PUBLIC TEST MATERIAL ONLY

The PEM private keys and self-signed certificates in this directory are disposable,
public loopback TLS fixtures, not credentials. Never use them in production or
install them into a system trust store. localhost.pem authenticates localhost;
wrong-host.pem deliberately authenticates wrong.invalid for a rejection test.
Generated using OpenSSL req -x509 -newkey rsa:2048 -nodes, 3650 days, on
2026-10-20. Tests pass their certificate as a per-request test CA only.
