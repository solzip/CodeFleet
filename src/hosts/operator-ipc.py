"""Linux-only local bridge. No model, TCP, shell or caller-supplied identity."""
import json
import os
import socket
import stat
import struct
import subprocess
import sys
import signal
import select
import time


def private(path, directory=False):
    info = os.lstat(path)
    if stat.S_ISLNK(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise RuntimeError('Operator-owned private path required')
    if directory != stat.S_ISDIR(info.st_mode):
        raise RuntimeError('Invalid private path kind')


def ancestors(path):
    # Protect pathname identity as well as file mode: an Agent-writable ancestor
    # could rename a private directory and replace its pathname after startup.
    current = os.path.dirname(os.path.abspath(path))
    while True:
        info = os.lstat(current)
        if not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode) or info.st_uid not in (0, os.getuid()) or info.st_mode & 0o022:
            raise RuntimeError('Unsafe Operator path ancestor')
        parent = os.path.dirname(current)
        if parent == current:
            break
        current = parent


def serve(config_path, socket_path, node, worker):
    if sys.platform != 'linux' or not hasattr(socket, 'SO_PEERCRED'):
        raise RuntimeError('Linux peer credentials required')
    ancestors(config_path)
    ancestors(socket_path)
    private(os.path.dirname(os.path.abspath(config_path)), True)
    private(config_path)
    with open(config_path, encoding='utf8') as handle:
        config = json.load(handle)
    operator, agent = config['operatorUid'], config['agentUid']
    if type(operator) is not int or type(agent) is not int or operator != os.getuid() or operator == agent or min(operator, agent) <= 0:
        raise RuntimeError('Distinct non-root Operator and Agent UIDs required')
    private(config['state'], True)
    ancestors(config['state'])
    parent = os.lstat(os.path.dirname(os.path.abspath(socket_path)))
    if not stat.S_ISDIR(parent.st_mode) or parent.st_uid != operator or parent.st_mode & 0o022:
        raise RuntimeError('Socket directory must be Operator owned and non-writable by Agent')
    if not os.path.isabs(node) or not os.path.isabs(worker):
        raise RuntimeError('Absolute trusted runtime paths required')
    if config.get('hostService'):
        private(config['workspaces'], True)
        ancestors(config['workspaces'])
    if config.get('hostService'):
        # Agent may read installed client code, never replace coordinator imports.
        for base, dirs, files in os.walk(os.path.dirname(os.path.dirname(worker)), followlinks=False):
            for name in dirs + files:
                entry = os.lstat(os.path.join(base, name))
                if stat.S_ISLNK(entry.st_mode) or entry.st_uid not in (0, operator) or entry.st_mode & 0o022:
                    raise RuntimeError('Agent-writable runtime code')
        ancestors(worker)
        ancestors(node)
        for executable in (worker, node):
            entry = os.lstat(executable)
            if not stat.S_ISREG(entry.st_mode) or entry.st_uid not in (0, operator) or entry.st_mode & 0o022:
                raise RuntimeError('Untrusted runtime executable')
    runtime_env = {'PATH': '/usr/local/bin:/usr/bin:/bin', 'HOME': config['state'], 'TMPDIR': config.get('workspaces', '/tmp')}
    if config.get('hostService') and config.get('dockerSocket'):
        private(config['dockerSocket'])
        ancestors(config['dockerSocket'])
        if not stat.S_ISSOCK(os.lstat(config['dockerSocket']).st_mode):
            raise RuntimeError('Private Harness socket required')
        runtime_env['DOCKER_HOST'] = 'unix://' + config['dockerSocket']
    os.umask(0o077)
    child = subprocess.Popen([node, worker, config_path], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             close_fds=True, env=runtime_env)
    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    def stop(*_):
        raise SystemExit(0)
    signal.signal(signal.SIGTERM, stop)
    bound = False
    try:
        server.bind(socket_path)  # never replace an existing socket/file
        bound = True
        os.chmod(socket_path, 0o666)  # UID authentication still mandatory
        server.listen(8)
        print('OPERATOR_IPC_READY', flush=True)
        while True:
            connection, _ = server.accept()
            with connection:
                connection.settimeout(3)
                message = None
                try:
                    pid, uid, gid = struct.unpack('3i', connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, struct.calcsize('3i')))
                    if uid not in (operator, agent):
                        raise PermissionError('IPC peer UID denied')
                    data = b''
                    deadline = time.monotonic() + 3
                    while not data.endswith(b'\n'):
                        connection.settimeout(max(0.001, deadline - time.monotonic()))
                        if time.monotonic() >= deadline:
                            raise RuntimeError('IPC input deadline')
                        part = connection.recv(min(4096, 65537 - len(data)))
                        if not part or len(data) + len(part) > 65536:
                            raise ValueError('IPC request missing or too large')
                        data += part
                    message = json.loads(data)
                    if not isinstance(message, dict) or set(message) not in ({'method', 'params'}, {'version', 'requestId', 'method', 'params'}):
                        raise ValueError('Unexpected IPC envelope')
                    if message['method'] in ('decide',) and uid != operator:
                        raise PermissionError('Operator UID required')
                    child.stdin.write((json.dumps({'peer': {'pid': pid, 'uid': uid, 'gid': gid}, 'message': message}) + '\n').encode())
                    child.stdin.flush()
                    result = b''
                    deadline = time.monotonic() + 8
                    while not result.endswith(b'\n'):
                        remaining = deadline - time.monotonic()
                        if remaining <= 0 or not select.select([child.stdout], [], [], remaining)[0]:
                            child.terminate()
                            raise RuntimeError('Coordinator deadline; outcome unknown, restart required')
                        part = os.read(child.stdout.fileno(), min(4096, 262145-len(result)))
                        if not part or len(result)+len(part)>262144:
                            child.terminate()
                            raise RuntimeError('Coordinator unavailable or response too large')
                        result += part
                    connection.sendall(result)
                except (ValueError, PermissionError, RuntimeError, OSError) as error:
                    try:
                        connection.sendall((json.dumps({'status': 'BLOCKED', 'reason': str(error), 'requestId': message.get('requestId') if isinstance(message, dict) else None}) + '\n').encode())
                    except OSError:
                        pass
    finally:
        server.close()
        child.terminate()
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait()
        # Socket belongs to this invocation; do not recursively remove anything.
        if bound and os.path.exists(socket_path):
            os.unlink(socket_path)


if __name__ == '__main__':
    serve(*sys.argv[1:])
