"""Disposable Linux fixture. Root provisions; AI actor never receives root/socket group."""
import json
import os
import shutil
import signal
import subprocess
import sys
import time
import uuid
import socket
import struct
import threading
import select

root = sys.argv[1]
for name, mode in [('private',0o700),('private/state',0o700),('private/workspaces',0o700),('ipc',0o755)]:
    os.mkdir(root+'/'+name,mode)
for name in ['private/state','private/workspaces','private','ipc']:
    os.chown(root+'/'+name,1000,1000)
shutil.copytree('/input/src',root+'/code/src')
shutil.copytree('/input/test/fixtures',root+'/code/test/fixtures')
for base, dirs, files in os.walk(root+'/code'):
    os.chmod(base,0o755)
    for name in files: os.chmod(os.path.join(base,name),0o644)

def identity(uid):
    def setup():
        os.setgroups([])
        os.setgid(uid)
        os.setuid(uid)
    return setup

def run(uid,args,**kw):
    return subprocess.run(args,preexec_fn=identity(uid),text=True,capture_output=True,timeout=30,**kw)

# Docker Desktop exposes a root-owned 0755 socket. Do not chmod the host socket.
# This fixture-only root transport delegates a fresh private socket to Operator;
# it is never mounted in candidate containers and authenticates kernel UID.
proxy_path=root+'/docker-fixture.sock'
proxy=socket.socket(socket.AF_UNIX);proxy.bind(proxy_path);os.chmod(proxy_path,0o600);os.chown(proxy_path,1000,1000);proxy.listen(8)
def forward(client):
    upstream=socket.socket(socket.AF_UNIX)
    try:
        uid=struct.unpack('3i',client.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12))[1]
        if uid!=1000: return
        upstream.connect('/var/run/docker.sock')
        readers=[client,upstream]
        while readers:
            ready,_,_=select.select(readers,[],[],60)
            if not ready: return
            for source in ready:
                data=source.recv(65536)
                target=upstream if source is client else client
                if not data:
                    readers.remove(source);target.shutdown(socket.SHUT_WR)
                else:
                    target.sendall(data)
    finally:
        client.close();upstream.close()
def accept_proxy():
    while True:
        client,_=proxy.accept();threading.Thread(target=forward,args=(client,),daemon=True).start()
threading.Thread(target=accept_proxy,daemon=True).start()
r=run(1000,['node',root+'/code/test/fixtures/host-ipc-seed.mjs',root])
assert r.returncode == 0,r.stderr
config_path=root+'/private/config.json'
script="import json,sys;p=sys.argv[1];c=json.load(open(p));c['dockerSocket']=sys.argv[2];open(p,'w').write(json.dumps(c))"
r=run(1000,['python3','-c',script,config_path,proxy_path]);assert r.returncode==0,r.stderr
sock=root+'/ipc/host.sock'

def start():
    server=subprocess.Popen(['python3','-B',root+'/code/src/hosts/operator-ipc.py',root+'/private/config.json',sock,'/usr/local/bin/node',root+'/code/src/hosts/operator-runtime.mjs'],preexec_fn=identity(1000),stdout=subprocess.PIPE,text=True)
    assert server.stdout.readline().strip()=='OPERATOR_IPC_READY'
    return server

def stop(server,force=False):
    # Operator kills its own worker first for an actual abrupt crash; root has no CAP_KILL.
    script="import os,signal;pid="+str(server.pid)+";children=open('/proc/'+str(pid)+'/task/'+str(pid)+'/children').read().split();[os.kill(int(p),signal.SIGKILL) for p in children];os.kill(pid,signal.SIGTERM)" if force else 'import os,signal;os.kill('+str(server.pid)+',signal.SIGTERM)'
    result=run(1000,['python3','-c',script]);assert result.returncode==0,result.stderr
    server.wait(timeout=10)

def call(method,params,request_id=None):
    r=run(1001,['node',root+'/code/src/hosts/ipc-client.mjs',sock,method,json.dumps(params),request_id or str(uuid.uuid4())])
    assert r.returncode in (0,2),r.stderr
    return json.loads(r.stdout)

def raw(uid,message):
    script="import socket,sys;s=socket.socket(socket.AF_UNIX);s.settimeout(12);s.connect(sys.argv[1]);s.sendall(sys.argv[2].encode()+b'\\n');print(s.recv(262144).decode())"
    r=run(uid,['python3','-c',script,sock,json.dumps(message)]);assert r.returncode==0,r.stderr
    return json.loads(r.stdout)

checks=[]
def check(name,condition):
    assert condition,name
    checks.append(name)

def stage(run_id,host='codex'):
    packets=call('requests',{'runId':run_id,'host':host});assert packets['status']=='OK',packets
    for p in packets['result']:
        response={'requestId':p['requestId'],'bindingHash':p['bindingHash'],'proposal':{'summary':'Subtract','edits':[{'path':'src/a.js','oldText':'a+b','newText':'a-b'}]}}
        result=call('submit',{'runId':run_id,'host':host,'response':response});assert result['status']=='OK',result

server=start()
try:
    proposed=call('propose',{'runId':'safe','goal':'Fix subtraction using protected tests'})
    check('natural-goal-request-only',proposed['result']['authority']=='REQUEST_ONLY')
    plan=call('plan',{'runId':'safe'})
    check('fixed-contract-and-role-plan',plan['result']['contract']['items'][0]['roles']['Executor']=='executor')
    for uid in [1001,1002]:
        check('operator-impersonation-denied-'+str(uid),raw(uid,{'method':'decide','params':{}})['status']=='BLOCKED')
    check('operator-human-input-unattested-denied',raw(1000,{'method':'decide','params':{}})['status']=='BLOCKED')
    check('legacy-agent-interface-denied',raw(1001,{'method':'assign','params':{'runId':'safe','itemId':'repair'}})['status']=='BLOCKED')
    check('body-actor-denied',call('plan',{'runId':'safe','actor':'operator'})['status']=='BLOCKED')
    check('arbitrary-command-denied',call('execute',{'runId':'safe','host':'codex','command':'touch /tmp/escape'})['status']=='BLOCKED')
    check('missing-proposals-denied',call('execute',{'runId':'safe','host':'codex'})['status']=='BLOCKED')
    check('risk-execution-denied',call('execute',{'runId':'risk','host':'codex'})['status']=='BLOCKED')
    req=call('approval-request',{'runId':'risk','itemId':'repair'})
    check('approval-request-not-approval',req['status']=='OK')
    # Agent and its actual child cannot open trusted stores, repository or Docker API.
    attack="""import os,socket,subprocess,sys,json
denied=[]
for p in sys.argv[1:]:
 for mode in ['rb','r+b']:
  try: open(p,mode);denied.append(False)
  except PermissionError: denied.append(True)
try:
 s=socket.socket(socket.AF_UNIX);s.connect('/var/run/docker.sock');denied.append(False)
except PermissionError: denied.append(True)
try:
 s=socket.socket(socket.AF_UNIX);s.connect(sys.argv[1].split('/private/')[0]+'/docker-fixture.sock');denied.append(False)
except PermissionError: denied.append(True)
r=subprocess.run([sys.executable,'-c','import os;os.setuid(1000)'],capture_output=True);denied.append(r.returncode!=0)
print(json.dumps(denied))
"""
    paths=[root+'/private/state/'+f for f in ['operator-key.json','operator.sqlite','state.sqlite']]+[root+'/private/repo/src/a.js']
    r=run(1001,['python3','-c',attack,*paths]);check('key-ledger-repository-docker-child-denied',r.returncode==0 and all(json.loads(r.stdout)))
    check('server-message-bound',raw(1001,{'version':1,'requestId':str(uuid.uuid4()),'method':'propose','params':{'runId':'safe','goal':'x'*70000}})['status']=='BLOCKED')
    stage('changed')
    mutate="import sqlite3,json,sys;c=sqlite3.connect(sys.argv[1]);r=json.loads(c.execute(\"select body from runs where id='changed'\").fetchone()[0]);r['revision']+=1;c.execute(\"update runs set body=? where id='changed'\",(json.dumps(r),));c.commit()"
    r=run(1000,['python3','-c',mutate,root+'/private/state/state.sqlite']);assert r.returncode==0,r.stderr
    check('changed-graph-before-dispatch-denied',call('execute',{'runId':'changed','host':'codex'})['status']=='BLOCKED')
    stage('safe')
    check('forged-evidence-fields-denied',call('verify',{'runId':'safe','evidence':{'passed':1}})['status']=='BLOCKED')
    request_id=str(uuid.uuid4());accepted=call('execute',{'runId':'safe','host':'codex'},request_id)
    check('bounded-execution-accepted',accepted['status']=='OK' and not accepted['result']['complete'])
    check('duplicate-request-no-execution',call('execute',{'runId':'safe','host':'codex'},request_id).get('replay') is True)
    check('duplicate-id-conflict',call('status',{'runId':'safe'},request_id)['status']=='BLOCKED')
    deadline=time.time()+90
    while time.time()<deadline:
        report=call('result',{'runId':'safe'})
        if report['status']=='OK' and report['result']['state'] in ['COMPLETED','FAILED','BLOCKED','RECONCILING','VERIFICATION_INVALID','WAITING_HUMAN']:
            break
        time.sleep(.2)
    assert report['status']=='OK',report
    final=report['result']
    if not final['complete']:
        debug="import sqlite3,json,sys;c=sqlite3.connect(sys.argv[1]+'/state.sqlite');rows=[json.loads(r[0]) for r in c.execute('select body from runs')];print([json.load(open(sys.argv[1]+'/artifacts/'+r['baselineHash']+'.json')) for r in rows if r.get('baselineHash')])"
        info=run(1000,['python3','-c',debug,root+'/private/state'])
        raise AssertionError(str(final)+' BASELINE '+info.stdout+info.stderr)
    check('real-docker-harness-and-judge',final['verification']['status']=='VERIFIED' and final['verification']['passed']>0)
    check('artifact-candidate-recheck',call('verify',{'runId':'safe'})['result']['verification']['status']=='VERIFIED')
    stop(server);server=start()
    check('durable-replay-after-restart',call('execute',{'runId':'safe','host':'codex'},request_id).get('replay') is True)
    check('durable-evidence-after-restart',call('result',{'runId':'safe'})['result']['complete'])
    stage('cancel','claude');assert call('execute',{'runId':'cancel','host':'claude'})['status']=='OK'
    check('cancel-request',call('cancel',{'runId':'cancel'})['status']=='OK')
    check('cancelled-resume-denied',call('resume',{'runId':'cancel','host':'claude'})['status']=='BLOCKED')
    time.sleep(2)
    stage('crash')
    assert call('execute',{'runId':'crash','host':'codex'})['status']=='OK'
    time.sleep(.7)
    before=call('status',{'runId':'crash'})['result']
    stop(server,True);server=start()
    recovered=call('resume',{'runId':'crash','host':'codex'})
    # A fresh request may reconcile only; it must never claim completion or replay a child.
    time.sleep(.5);r=call('status',{'runId':'crash'})
    check('abrupt-crash-not-completion',r['status']=='OK' and not r['result']['complete'])
    before_ids=[w['attempt']['childId'] for w in before['workItems'] if w['attempt']]
    after_ids=[w['attempt']['childId'] for w in r['result']['workItems'] if w['attempt']]
    check('crash-no-child-replay',len(before_ids)>0 and before_ids==after_ids and r['result']['state']=='RECONCILING')
    # A lost journal response is uncertain, even after restart. Never replay it.
    uncertain_id=str(uuid.uuid4())
    insert="import sqlite3,json,hashlib,sys;c=sqlite3.connect(sys.argv[1]);m=json.loads(sys.argv[2]);h=hashlib.sha256(json.dumps(m,sort_keys=True,separators=(',',':')).encode()).hexdigest();c.execute('insert into host_ipc_requests values (?,?,?,NULL)',(1001,m['requestId'],h));c.commit()"
    message={'version':1,'requestId':uncertain_id,'method':'status','params':{'runId':'safe'}}
    q=run(1000,['python3','-c',insert,root+'/private/state/state.sqlite',json.dumps(message)]);assert q.returncode==0,q.stderr
    check('uncertain-request-not-replayed','Uncertain' in call('status',{'runId':'safe'},uncertain_id).get('reason',''))
    evidence_path=call('result',{'runId':'safe'})['result']['artifactPaths']['evidenceHash']
    corrupt="import sys;open(sys.argv[1],'w').write('{}')"
    q=run(1000,['python3','-c',corrupt,evidence_path]);assert q.returncode==0,q.stderr
    check('tampered-artifact-not-verified',call('verify',{'runId':'safe'})['result']['verification']['status']=='INVALID')
    print(json.dumps({'status':'OFFLINE_VERIFIED','checks':checks,'modelCalls':0,'hostLive':'NOT_RUN','humanInput':'BLOCKED','tests':final['verification']['tests']}))
finally:
    stop(server)
