# Bisecting for CloudFlare:

# Works (cloudflare)
# FROM emscripten/emsdk:3.1.43
# FROM emscripten/emsdk:3.1.44


# Broken (cloudflare)
# FROM emscripten/emsdk:3.1.67
# FROM emscripten/emsdk:3.1.55
# FROM emscripten/emsdk:3.1.51
# FROM emscripten/emsdk:3.1.47
# FROM emscripten/emsdk:3.1.45

# Keep this in sync with patch/emscripten-6.0.6.patch.
ARG EMSDK_VERSION="6.0.6"
FROM emscripten/emsdk:${EMSDK_VERSION}

MAINTAINER Sean Morris <sean@seanmorr.is>

SHELL ["/bin/bash", "-euxo", "pipefail", "-c"]

RUN export TMPDIR=/dev/shm; \
	install -d /dev/shm/apt-archives/partial; \
	apt-get update; \
	DEBIAN_FRONTEND=noninteractive \
	apt-get -o Dir::Cache::archives=/dev/shm/apt-archives --no-install-recommends -y install \
		build-essential \
		automake \
		autoconf \
		autogen \
		libtool \
		gettext \
		shtool \
		brotli \
		pkgconf \
		gperf \
		groff \
		bison \
		flex \
		gzip \
		make \
		re2c \
		gdb \
		git \
		sed \
		pv \
		jq

COPY patch/emscripten-6.0.6.patch /tmp/emscripten.patch

RUN cd /emsdk/upstream/emscripten && {\
	git apply --check /tmp/emscripten.patch;\
	git apply /tmp/emscripten.patch;\
	python3 -m compileall -q emcc.py tools;\
	rm /tmp/emscripten.patch;\
}

COPY .github/bin/retry-embuilder.sh /usr/local/bin/retry-embuilder
COPY .github/bin/verify-emscripten-profile-runtime.sh /usr/local/bin/verify-emscripten-profile-runtime
COPY .github/bin/verify-emscripten-fibers.sh /usr/local/bin/verify-emscripten-fibers

RUN retry-embuilder build USER

RUN bash /usr/local/bin/verify-emscripten-profile-runtime
RUN bash /usr/local/bin/verify-emscripten-fibers

RUN emcc --check
