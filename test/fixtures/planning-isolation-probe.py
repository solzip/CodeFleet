"""Real Linux negative tests; synthetic credentials only, no Host model."""
import ctypes
import hashlib
import importlib.util
import json
import os
import pathlib
import signal
import socket
import subprocess
import sys
import time

spec = importlib.util.spec_from_file_location("isolation", "/input/src/hosts/planning-isolation.py")
isolation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(isolation)

if len(sys.argv) > 1:
    libc = ctypes.CDLL(None, use_errno=True)
    # Import all runtime dependencies before root/UID restriction.
    isolation.confine("/h6/jail")
    if sys.argv[1] == "hang":
        time.sleep(60)
        raise AssertionError("Timeout not enforced")
    checks = []
    def denied(name, action):
        try:
            action()
        except (OSError, ValueError):
            checks.append(name)
            return
        raise AssertionError("BYPASS " + name)
    assert "subtract" in isolation.tool({"method": "read", "path": "src/math.js", "query": ""})
    assert isolation.tool({"method": "search", "path": "src/math.js", "query": "subtract"})[0]["line"] == 1
    checks += ["read", "search"]
    for name, p in [("outside-read", "/h6/secret"), ("credentials", "/h6/credentials/auth"),
                    ("ledger", "/h6/operator/ledger"), ("source-mount", "/input/src/hosts/planning.mjs")]:
        denied(name, lambda p=p: open(p).read())
    denied("fixture-write", lambda: open("/fixture/src/math.js", "w"))
    denied("tool-command", lambda: isolation.tool({"method": "shell", "path": "src/math.js", "query": ""}))
    denied("symlink", lambda: isolation.tool({"method": "read", "path": "escape", "query": ""}))
    denied("traversal", lambda: isolation.tool({"method": "read", "path": "../secret", "query": ""}))
    denied("replace-path", lambda: os.rename("/fixture/src", "/fixture/replaced"))
    denied("internet-socket", lambda: socket.socket(socket.AF_INET, socket.SOCK_STREAM))
    denied("operator-ipc", lambda: socket.socket(socket.AF_UNIX, socket.SOCK_STREAM))
    denied("docker-socket", lambda: open("/h6/docker.sock", "rb"))
    denied("operator-socket-path", lambda: os.stat("/h6/operator.sock"))
    denied("same-uid-provisioning", lambda: isolation.confine("/"))
    def syscall(number):
        if libc.syscall(number, 0, 0, 0, 0, 0) != -1 or ctypes.get_errno() != 1:
            raise AssertionError("syscall did not return EPERM")
        raise PermissionError()
    for name, n in [("mount", 165), ("execve", 59), ("execveat", 322), ("namespace", 272)]:
        denied(name, lambda n=n: syscall(n))
    denied("regain-root", lambda: os.setuid(0))
    denied("signal-supervisor", lambda: os.kill(os.getppid(), 0))
    # A fork inherits all restrictions; it cannot exec or regain authority.
    pid = os.fork()
    if pid == 0:
        try:
            denied("descendant-outside", lambda: open("/h6/secret"))
            denied("descendant-exec", lambda: syscall(59))
            denied("descendant-network", lambda: socket.socket())
            os._exit(0)
        except BaseException:
            os._exit(1)
    assert os.waitpid(pid, 0)[1] == 0
    checks.append("descendant-inherits")
    # Fake transport uses only stdin/stdout pipes to a trusted supervisor.
    assert sys.stdin.readline().strip() == "FAKE_MODEL_CHANNEL"
    checks.append("fake-pipe-transport-no-tool-network")
    observed = {p: isolation.tool({"method": "read", "path": p, "query": ""})
                for p in ["src/math.js", "test/math.test.js"]}
    print(json.dumps({"checks": checks, "uid": os.getuid(), "modelCalls": 0, "observed": observed}))
    sys.exit(0)

root = pathlib.Path("/h6")
root.mkdir(exist_ok=True)
root.chmod(0o755)
jail = root / "jail"
(jail / "fixture/src").mkdir(parents=True)
(jail / "fixture/src/math.js").write_text("export const subtract=(a,b)=>a+b;\n")
(jail / "fixture/test").mkdir()
(jail / "fixture/test/math.test.js").write_text("assert.equal(subtract(5,2),3);\n")
(jail / "fixture/large.txt").write_text("x" * 16000)
(root / "secret").write_text("SYNTHETIC_SECRET")
(root / "credentials").mkdir()
(root / "credentials/auth").write_text("FAKE_AUTH_NOT_A_REAL_KEY")
(root / "operator").mkdir()
(root / "operator/ledger").write_text("FAKE_APPROVAL_LEDGER")
listeners = []
for name in ["docker.sock", "operator.sock"]:
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.bind(str(root / name))
    s.listen(1)
    listeners.append(s)
(jail / "fixture/escape").symlink_to("/h6/secret")
for p in sorted(jail.rglob("*"), reverse=True):
    if not p.is_symlink():
        p.chmod(0o555 if p.is_dir() else 0o444)
jail.chmod(0o555)
def snapshot():
    return {str(p.relative_to(jail)): os.readlink(p) if p.is_symlink() else
            hashlib.sha256(p.read_bytes()).hexdigest() for p in jail.rglob("*") if not p.is_dir()}
before = snapshot()
worker = subprocess.Popen([sys.executable, "-B", __file__, "worker"],
                          stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, start_new_session=True)
try:
    stdout, stderr = worker.communicate(b"FAKE_MODEL_CHANNEL\n", timeout=10)
    assert worker.returncode == 0, stderr.decode()
finally:
    try:
        os.killpg(worker.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    worker.wait()
result = json.loads(stdout)
for payload, label in [
    (b"x" * 2049, "request-byte-limit"),
    ((json.dumps({"method": "read", "path": "src/math.js", "query": ""}) + "\n").encode() * 17, "request-count-limit"),
    ((json.dumps({"method": "read", "path": "large.txt", "query": ""}) + "\n").encode() * 5, "output-byte-limit"),
]:
    probe = subprocess.run([sys.executable, "-B", "/input/src/hosts/planning-isolation.py", "/h6/jail"],
                           input=payload, capture_output=True, timeout=10)
    assert probe.returncode != 0 and b"ValueError" in probe.stderr, probe.stderr
    assert len(probe.stdout) <= 65536
    result["checks"].append(label)
hang = subprocess.Popen([sys.executable, "-B", __file__, "hang"], stdin=subprocess.PIPE,
                        stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
try:
    hang.communicate(timeout=0.5)
    raise AssertionError("Expected timed-out worker")
except subprocess.TimeoutExpired:
    os.killpg(hang.pid, signal.SIGKILL)
    hang.communicate(timeout=5)
try:
    os.killpg(hang.pid, 0)
    raise AssertionError("Residual timeout worker")
except ProcessLookupError:
    result["checks"].append("timeout-no-residual-process")
for s in listeners:
    s.close()
assert before == snapshot()
try:
    os.killpg(worker.pid, 0)
    raise AssertionError("Residual process group")
except ProcessLookupError:
    pass
result.update(status="OFFLINE_VERIFIED", scope="FAKE_READ_SEARCH_WORKER_ONLY",
              fileChanges=False, residualProcesses=False, hostLive="BLOCKED",
              authentication="UNVERIFIED", realModelTransport="UNVERIFIED",
              fixtureHash=hashlib.sha256(json.dumps(before, sort_keys=True).encode()).hexdigest())
print(json.dumps(result))
