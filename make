#!/usr/bin/env bash

test -e third_party/make-4.4 || {
	wget -q https://gnu.mirror.constant.com/make/make-4.4.tar.gz
	tar -C third_party -xzvf make-4.4.tar.gz
	rm make-4.4.tar.gz
	mkdir third_party/make-4.4/bin

	cd third_party/make-4.4 && {
		./configure
		make
		make install prefix=`pwd`/third_party/make-4.4/bin
	}

	cd ../..
}

third_party/make-4.4/third_party/make-4.4/bin/bin/make ${@}

exit $?
