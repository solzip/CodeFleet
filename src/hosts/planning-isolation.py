"""Linux x86_64 offline read/search worker boundary. Never launches a model.

Trusted supervisor provisions a root-owned jail and passes only bounded pipes.
This is NOT a sandbox launcher for Codex/Claude or an auth transport attestation.
"""
import ctypes
import errno
import json
import os
import platform
import resource
import stat


def confine(root, uid=1001):
    if platform.system() != "Linux" or platform.machine() != "x86_64":
        raise RuntimeError("Unsupported isolation platform")
    if os.geteuid() != 0 or uid == 0:
        raise PermissionError("Distinct privileged provisioner and Agent UID required")
    root = os.path.abspath(root)
    # No writable/symlink ancestors. Deployment may not use a shared /tmp root.
    current = root
    while True:
        st = os.lstat(current)
        if not stat.S_ISDIR(st.st_mode) or st.st_uid != 0 or st.st_mode & 0o022:
            raise RuntimeError("Untrusted jail ancestor")
        if current == "/":
            break
        current = os.path.dirname(current)
    for directory, dirs, files in os.walk(root, followlinks=False):
        for name in dirs + files:
            st = os.lstat(os.path.join(directory, name))
            if stat.S_ISLNK(st.st_mode):
                continue  # Kernel root + read tool O_NOFOLLOW prevent traversal.
            if st.st_uid != 0 or st.st_mode & 0o022:
                raise RuntimeError("Agent-writable jail content")
    libc = ctypes.CDLL(None, use_errno=True)
    # No inherited socket, directory, credential or executable descriptors.
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    resource.setrlimit(resource.RLIMIT_CPU, (3, 3))
    resource.setrlimit(resource.RLIMIT_FSIZE, (0, 0))
    resource.setrlimit(resource.RLIMIT_NPROC, (8, 8))
    for fd in range(3):
        if not stat.S_ISFIFO(os.fstat(fd).st_mode):
            raise RuntimeError("Only private pipe stdio is allowed")
    os.closerange(3, 1048576)
    os.environ.clear()
    os.chroot(root)
    os.chdir("/")
    os.setgroups([])
    os.setgid(uid)
    os.setuid(uid)
    if os.getuid() != uid or os.geteuid() != uid:
        raise RuntimeError("UID separation failed")

    class Filter(ctypes.Structure):
        _fields_ = [("code", ctypes.c_ushort), ("jt", ctypes.c_ubyte),
                    ("jf", ctypes.c_ubyte), ("k", ctypes.c_uint)]
    class Program(ctypes.Structure):
        _fields_ = [("length", ctypes.c_ushort), ("filters", ctypes.POINTER(Filter))]
    deny = 0x00050000 | errno.EPERM
    # Check architecture, reject x32 ABI, then deny effect-bearing syscalls.
    rows = [(0x20, 0, 0, 4), (0x15, 1, 0, 0xC000003E),
            (0x06, 0, 0, 0x80000000), (0x20, 0, 0, 0),
            (0x35, 0, 1, 0x40000000), (0x06, 0, 0, deny)]
    for number in [41, 42, 43, 49, 50, 53, 59, 101, 105, 106, 116, 117,
                   119, 122, 123, 126, 155, 157, 161, 165, 166, 272, 288,
                   298, 304, 308, 310, 311, 321, 322, 323, 425, 426, 427]:
        rows += [(0x15, 0, 1, number), (0x06, 0, 0, deny)]
    rows += [(0x06, 0, 0, 0x7FFF0000)]
    filters = (Filter * len(rows))(*(Filter(*r) for r in rows))
    program = Program(len(rows), filters)
    if libc.prctl(38, 1, 0, 0, 0) or libc.prctl(22, 2, ctypes.byref(program), 0, 0):
        raise OSError(ctypes.get_errno(), "seccomp installation failed")


def tool(request):
    """No shell, arbitrary code, IPC, execution or mutation method."""
    if not isinstance(request, dict) or set(request) != {"method", "path", "query"}:
        raise ValueError("Invalid tool schema")
    if request["method"] not in ("read", "search"):
        raise ValueError("Tool forbidden")
    parts = request["path"].split("/") if isinstance(request["path"], str) else []
    if not parts or any(not p or p in (".", "..") or not all(c.isalnum() or c in "._-" for c in p) for p in parts):
        raise ValueError("Path forbidden")
    query = request["query"]
    if not isinstance(query, str) or len(query) > 256:
        raise ValueError("Bounded query required")
    fd = os.open("/fixture", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for component in parts[:-1]:
            child = os.open(component, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = child
        f = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW, dir_fd=fd)
        try:
            st = os.fstat(f)
            if not stat.S_ISREG(st.st_mode) or st.st_size > 16000:
                raise ValueError("Bounded regular file required")
            text = os.read(f, 16001).decode("utf8")
            if len(text.encode()) > 16000:
                raise ValueError("Output limit")
        finally:
            os.close(f)
    finally:
        os.close(fd)
    if request["method"] == "search":
        return [{"line": i + 1, "text": line} for i, line in enumerate(text.splitlines()) if query in line]
    return text


def serve():
    import sys
    total = 0
    for _ in range(16):
        line = sys.stdin.buffer.readline(2049)
        if not line:
            return
        if len(line) > 2048 or not line.endswith(b"\n"):
            raise ValueError("Request limit")
        try:
            output = {"result": tool(json.loads(line))}
        except (ValueError, OSError) as error:
            output = {"error": type(error).__name__}
        encoded = json.dumps(output) + "\n"
        total += len(encoded.encode())
        if total > 65536:
            raise ValueError("Session output limit")
        sys.stdout.write(encoded)
        sys.stdout.flush()
    if sys.stdin.buffer.read(1):
        raise ValueError("Request count exceeded")


if __name__ == "__main__":
    import sys
    if len(sys.argv) != 2:
        raise SystemExit("Trusted jail path required")
    confine(sys.argv[1])
    serve()
