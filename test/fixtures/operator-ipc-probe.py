"""Offline Linux integration driver. Every actor uses kernel UID separation."""
import json
import os
import socket
import subprocess
import sys
import time

ROOT = '/fixture'
os.mkdir(ROOT + '/private', 0o700)
os.mkdir(ROOT + '/private/state', 0o700)
os.mkdir(ROOT + '/ipc', 0o755)
for entry in ('private/state', 'private', 'ipc'):
    os.chown(ROOT + '/' + entry, 1000, 1000)


def identity(uid):
    def setup():
        os.setgroups([])
        os.setgid(uid)
        os.setuid(uid)
    return setup


subprocess.run(['/usr/local/bin/node', '/app/test/fixtures/operator-seed.mjs', ROOT + '/private/state', ROOT + '/private/config.json'], preexec_fn=identity(1000), check=True)
server = subprocess.Popen([sys.executable, '-B', '/app/src/hosts/operator-ipc.py', ROOT + '/private/config.json', ROOT + '/ipc/operator.sock', '/usr/local/bin/node', '/app/src/hosts/operator-runtime.mjs'], preexec_fn=identity(1000), stdout=subprocess.PIPE, text=True)
assert server.stdout.readline().strip() == 'OPERATOR_IPC_READY'

client = """import socket,json,sys
s=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);s.settimeout(10);s.connect('/fixture/ipc/operator.sock');s.sendall(sys.argv[1].encode()+b'\\n');print(s.recv(262144).decode());s.close()
"""
observations = []


def call(uid, method, params):
    result = subprocess.run([sys.executable, '-c', client, json.dumps({'method': method, 'params': params})], preexec_fn=identity(uid), text=True, capture_output=True, timeout=15)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def check(name, condition):
    assert condition, name
    observations.append(name)


def request(run):
    assert call(1001, 'open', {'runId': run})['status'] == 'OK'
    return call(1001, 'request', {'runId': run, 'itemId': 'repair'})['result']


def decide(req, kind='APPROVE', expires=None, uid=1000):
    return call(uid, 'decide', {'id': req['id'], 'reviewDigest': req['reviewDigest'], 'kind': kind, 'expiresAt': expires or int(time.time()*1000)+60000})


try:
    check('unknown-uid-denied', call(1002, 'inspect', {'runId': 'safe'})['status'] == 'BLOCKED')
    req = request('risk')
    check('agent-operator-impersonation-denied', decide(req, uid=1001)['status'] == 'BLOCKED')
    check('unapproved-risk-assignment-denied', call(1001, 'assign', {'runId': 'risk', 'itemId': 'repair'})['status'] == 'BLOCKED')
    forged = {'runId': 'safe', 'peer': {'uid': 1000}, 'actor': 'operator'}
    check('json-identity-fields-denied', call(1001, 'inspect', forged)['status'] == 'BLOCKED')
    check('operator-decision-accepted', decide(req)['status'] == 'OK')
    check('approved-real-workflow-reservation', call(1001, 'assign', {'runId': 'risk', 'itemId': 'repair'})['result']['status'] == 'ASSIGNED')
    check('duplicate-assignment-denied', call(1001, 'assign', {'runId': 'risk', 'itemId': 'repair'})['status'] == 'BLOCKED')
    # Simulate terminal reconciliation only in this trusted test driver, freeing
    # the global scheduler slot. Never expose SQL or this command over IPC.
    def release_slot():
        code = "import sqlite3; c=sqlite3.connect('/fixture/private/state/state.sqlite');c.execute(\"UPDATE workflow_attempts SET status='FAILED' WHERE status='STARTED'\");c.commit()"
        subprocess.run([sys.executable, '-c', code], preexec_fn=identity(1000), check=True)
    release_slot()
    check('safe-open-without-human', call(1001, 'open', {'runId': 'safe'})['status'] == 'OK')
    check('safe-automatic-assignment', call(1001, 'assign', {'runId': 'safe', 'itemId': 'repair'})['result']['status'] == 'ASSIGNED')
    release_slot()
    rev = request('revoked'); assert decide(rev)['status'] == 'OK'; assert decide(rev, 'REVOKE')['status'] == 'OK'
    check('revoked-assignment-denied', call(1001, 'assign', {'runId': 'revoked', 'itemId': 'repair'})['status'] == 'BLOCKED')
    exp = request('expired'); assert decide(exp, expires=int(time.time()*1000)+300)['status'] == 'OK'
    time.sleep(.4)
    check('expired-assignment-denied', call(1001, 'assign', {'runId': 'expired', 'itemId': 'repair'})['status'] == 'BLOCKED')
    res = request('resume'); assert decide(res)['status'] == 'OK'
    assert call(1001, 'pause', {'runId': 'resume'})['status'] == 'OK'
    assert call(1001, 'open', {'runId': 'resume'})['status'] == 'OK'
    check('resume-old-lease-grant-denied', call(1001, 'assign', {'runId': 'resume', 'itemId': 'repair'})['status'] == 'BLOCKED')
    change = request('changed'); assert decide(change)['status'] == 'OK'
    code = "import sqlite3,json;c=sqlite3.connect('/fixture/private/state/state.sqlite');r=json.loads(c.execute(\"SELECT body FROM runs WHERE id='changed'\").fetchone()[0]);r['revision']+=1;c.execute(\"UPDATE runs SET body=? WHERE id='changed'\",(json.dumps(r),));c.commit()"
    subprocess.run([sys.executable, '-c', code], preexec_fn=identity(1000), check=True)
    check('graph-revision-reuse-denied', call(1001, 'assign', {'runId': 'changed', 'itemId': 'repair'})['status'] == 'BLOCKED')
    check('remote-command-denied', call(1001, 'execute', {'runId': 'safe'})['status'] == 'BLOCKED')
    attack = """import os,json,subprocess,sys
rows=[]
for p in ['/fixture/private/state/operator-key.json','/fixture/private/state/operator.sqlite','/fixture/private/state/state.sqlite']:
 for mode in ['rb','wb']:
  try:open(p,mode);rows.append(False)
  except PermissionError:rows.append(True)
try:os.setuid(1000);rows.append(False)
except PermissionError:rows.append(True)
print(json.dumps(rows))
"""
    for name, code in [('agent-store-access-denied', attack), ('descendant-store-access-denied', 'import subprocess,sys;subprocess.run([sys.executable,"-c",'+repr(attack)+'],check=True)')]:
        result = subprocess.run([sys.executable, '-c', code], preexec_fn=identity(1001), capture_output=True, text=True, check=True)
        check(name, json.loads(result.stdout) == [True]*7)
    # Same UID remains a real counterexample, never an accepted deployment.
    config_copy = "import json,os;c=json.load(open('/fixture/private/config.json'));c['agentUid']=1000;os.umask(0o077);json.dump(c,open('/fixture/private/same.json','w'))"
    subprocess.run([sys.executable, '-c', config_copy], preexec_fn=identity(1000), check=True)
    same = subprocess.run([sys.executable, '-B', '/app/src/hosts/operator-ipc.py', ROOT+'/private/same.json', ROOT+'/ipc/same.sock', '/usr/local/bin/node', '/app/src/hosts/operator-runtime.mjs'], preexec_fn=identity(1000), capture_output=True, text=True)
    check('same-uid-runtime-refused', same.returncode != 0 and 'Distinct' in same.stderr)
    # A private leaf under an Agent-writable ancestor is insufficient.
    os.mkdir(ROOT+'/unsafe', 0o777); os.chmod(ROOT+'/unsafe', 0o777)
    setup_unsafe = "import os;os.mkdir('/fixture/unsafe/private',0o700);open('/fixture/unsafe/private/config.json','w').write('{}');os.chmod('/fixture/unsafe/private/config.json',0o600)"
    subprocess.run([sys.executable, '-c', setup_unsafe], preexec_fn=identity(1000), check=True)
    unsafe = subprocess.run([sys.executable, '-B', '/app/src/hosts/operator-ipc.py', ROOT+'/unsafe/private/config.json', ROOT+'/ipc/unsafe.sock', '/usr/local/bin/node', '/app/src/hosts/operator-runtime.mjs'], preexec_fn=identity(1000), capture_output=True, text=True)
    check('writable-ancestor-runtime-refused', unsafe.returncode != 0 and 'ancestor' in unsafe.stderr)
    print(json.dumps({'status': 'OFFLINE_VERIFIED', 'checks': observations, 'modelCalls': 0, 'humanPresence': 'NOT_TESTED'}))
finally:
    subprocess.run([sys.executable, '-c', 'import os,signal,sys;os.kill(int(sys.argv[1]),signal.SIGTERM)', str(server.pid)], preexec_fn=identity(1000), check=True)
    server.wait(timeout=10)
