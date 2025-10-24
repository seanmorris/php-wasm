#!/usr/bin/env bash

MAKE_VERSION=4.4.1

test -e third_party/make-${MAKE_VERSION} || {
	wget -q https://gnu.mirror.constant.com/make/make-${MAKE_VERSION}.tar.gz
	tar -C third_party -xzvf make-${MAKE_VERSION}.tar.gz
	rm make-${MAKE_VERSION}.tar.gz
	mkdir third_party/make-${MAKE_VERSION}/bin

	cd third_party/make-${MAKE_VERSION} && {
		./configure
		make
		make install prefix=`pwd`/third_party/make-${MAKE_VERSION}/bin
	}

	cd ../..
}

third_party/make-${MAKE_VERSION}/third_party/make-${MAKE_VERSION}/bin/bin/make ${@}

exit $?
