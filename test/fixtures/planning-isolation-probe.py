"""Real Linux negative tests; synthetic credentials only, no Host model."""
import ctypes
import hashlib
import importlib.util
import json
import os
import pathlib
import resource
import select
import signal
import socket
import subprocess
import sys
import time

spec = importlib.util.spec_from_file_location("isolation", "/input/src/hosts/planning-isolation.py")
isolation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(isolation)

# Test-only identity, distinct from common hosted runner / H3 / H4 UID 1001.
# confine already supports a provisioner-selected UID; its limits stay unchanged.
TEST_UID = 61001

if len(sys.argv) > 1:
    libc = ctypes.CDLL(None, use_errno=True)
    # Import all runtime dependencies before root/UID restriction.
    isolation.confine("/h6/jail", uid=1001 if sys.argv[1] == "collision" else TEST_UID)
    assert resource.getrlimit(resource.RLIMIT_NPROC) == (8, 8)
    if sys.argv[1] == "hang":
        time.sleep(60)
        raise AssertionError("Timeout not enforced")
    print("CONFINED", flush=True)
    assert sys.stdin.readline().strip() == "FAKE_MODEL_CHANNEL"
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
    checks.append("fake-pipe-transport-no-tool-network")
    observed = {p: isolation.tool({"method": "read", "path": p, "query": ""})
                for p in ["src/math.js", "test/math.test.js"]}
    print(json.dumps({"checks": checks, "uid": os.getuid(), "nproc": list(resource.getrlimit(resource.RLIMIT_NPROC)), "modelCalls": 0, "observed": observed}))
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

def pressure(uid):
    """Eight bounded, supervised test processes; no change to any worker limit."""
    children = []
    rd, wr = os.pipe()
    try:
        for _ in range(8):
            pid = os.fork()
            if pid == 0:
                os.close(rd)
                os.setgroups([])
                os.setgid(uid)
                os.setuid(uid)
                os.write(wr, b"R")
                os.close(wr)
                time.sleep(30)
                os._exit(0)
            children.append(pid)
        os.close(wr)
        for _ in children:
            assert select.select([rd], [], [], 5)[0], "Pressure child not ready"
            assert os.read(rd, 1) == b"R"
        return children
    except BaseException:
        reap(children)
        raise
    finally:
        os.close(rd)

def reap(children):
    for pid in children:
        try:
            os.kill(pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    for pid in children:
        os.waitpid(pid, 0)
        assert not pathlib.Path(f"/proc/{pid}").exists(), "Residual pressure child"

def run_worker(mode="worker", blocked=False):
    worker = subprocess.Popen([sys.executable, "-B", __file__, mode],
                              stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, start_new_session=True)
    try:
        assert select.select([worker.stdout], [], [], 10)[0], "Worker not ready"
        assert worker.stdout.readline() == b"CONFINED\n"
        status = dict(line.split(":", 1) for line in pathlib.Path(f"/proc/{worker.pid}/status").read_text().splitlines() if ":" in line)
        observed = {k: status[k].strip() for k in ["Uid", "Threads", "NoNewPrivs", "Seccomp"]}
        assert observed["Seccomp"] == "2" and observed["NoNewPrivs"] == "1"
        limits = pathlib.Path(f"/proc/{worker.pid}/limits").read_text().splitlines()
        observed["nproc"] = [int(v) for v in next(line for line in limits if line.startswith("Max processes")).split()[-3:-1]]
        assert observed["nproc"] == [8, 8]
        uid = int(observed["Uid"].split()[0])
        observed["visibleUidTasks"] = 0
        for p in pathlib.Path("/proc").glob("[0-9]*/task/[0-9]*/status"):
            try:
                task_uid = int(next(line for line in p.read_text().splitlines() if line.startswith("Uid:")).split()[1])
                observed["visibleUidTasks"] += task_uid == uid
            except (OSError, StopIteration):
                pass  # An unrelated task can exit during observation.
        for name in ["pids.current", "pids.max", "memory.current", "memory.max"]:
            for base in ["/sys/fs/cgroup", "/sys/fs/cgroup/pids"]:
                p = pathlib.Path(base, name)
                if p.exists():
                    observed[name] = p.read_text().strip()
                    break
        stdout, stderr = worker.communicate(b"FAKE_MODEL_CHANNEL\n", timeout=10)
        if blocked:
            assert worker.returncode != 0 and b"BlockingIOError: [Errno 11]" in stderr, stderr.decode()
            assert b"OFFLINE_VERIFIED" not in stdout
            return observed
        assert worker.returncode == 0, stderr.decode()
        result = json.loads(stdout)
        result["resourceObservation"] = observed
        return result
    finally:
        try:
            os.killpg(worker.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        worker.wait()
        assert not pathlib.Path(f"/proc/{worker.pid}").exists(), "Residual worker"
        try:
            os.killpg(worker.pid, 0)
            raise AssertionError("Residual process group")
        except ProcessLookupError:
            pass

children = pressure(1001)
try:
    collision = run_worker("collision", blocked=True)
    result = run_worker()  # Normal descendant must run despite unrelated UID load.
finally:
    reap(children)
children = pressure(TEST_UID)
try:
    bounded = run_worker(blocked=True)  # The dedicated identity still has a ceiling.
finally:
    reap(children)
recovered = run_worker()
assert recovered["checks"] == result["checks"] and recovered["uid"] == TEST_UID
result["resourceChecks"] = {"pressureProcesses": 8, "collision": collision,
                            "bounded": bounded, "recovered": recovered["resourceObservation"],
                            "pressureChildrenReaped": True}
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
result.update(status="OFFLINE_VERIFIED", scope="FAKE_READ_SEARCH_WORKER_ONLY",
              fileChanges=False, residualProcesses=False, hostLive="BLOCKED",
              authentication="UNVERIFIED", realModelTransport="UNVERIFIED",
              fixtureHash=hashlib.sha256(json.dumps(before, sort_keys=True).encode()).hexdigest())
print(json.dumps(result))
