FROM debian:bookworm-20250317-slim
MAINTAINER Sean Morris <sean@seanmorr.is>

SHELL ["/bin/bash", "-euxo", "pipefail", "-c"]

RUN apt-get update; \
	DEBIAN_FRONTEND=noninteractive \
	apt-get --no-install-recommends -y install ca-certificates curl; \
	install -m 0755 -d /etc/apt/keyrings; \
	curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc; \
	chmod a+r /etc/apt/keyrings/docker.asc; \
	echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian \
		$(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
		tee /etc/apt/sources.list.d/docker.list > /dev/null; \
	apt-get update; \
	DEBIAN_FRONTEND=noninteractive \
	apt-get --no-install-recommends -y install \
		docker-buildx-plugin \
		docker-compose-plugin \
		docker-ce-cli \
		containerd.io \
		docker-ce \
		build-essential \
		checkinstall \
		automake \
		autoconf \
		autogen \
		nodejs \
		npm \
		wget \
		git

RUN cd /tmp; \
	wget https://gnu.mirror.constant.com/make/make-4.4.tar.gz; \
	tar -xzvf make-4.4.tar.gz;\
	cd make-4.4; \
	./configure; \
	make; \
	checkinstall make install

WORKDIR /app

ENTRYPOINT ["bash", "-c"]
