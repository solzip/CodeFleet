FROM node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS node
FROM python@sha256:4101e4a31b9d2c927c9052ae2fa58b76a89265997ec9209c02933d9974214b80
COPY --from=node /usr/local/bin/node /usr/local/bin/node
# Test-only offline composition of existing local runtimes; no package download.
