FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bash \
        ca-certificates \
        coreutils \
        diffutils \
        file \
        findutils \
        gawk \
        grep \
        libxml2-utils \
        nodejs \
        sed \
        shellcheck \
        unzip \
        zip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

CMD ["/bin/bash", "/workspace/mac-builder/docker-preflight.sh"]
