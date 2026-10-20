FROM codefleet-h3-runtime:offline
RUN apt-get update && apt-get install -y --no-install-recommends git docker-cli && rm -rf /var/lib/apt/lists/*


