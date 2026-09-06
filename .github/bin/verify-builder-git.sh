#!/usr/bin/env bash

set -euo pipefail

if (( $# > 1 )); then
	echo "Usage: $0 [builder-image]" >&2
	exit 2
fi

builder_image="${1:-seanmorris/php-emscripten-builder:latest}"

# Feed the probe through stdin so a restored image does not need to contain it.
# No host workspace is mounted; ownership changes affect only disposable tmpfs.
docker run --rm --pull=never --read-only --network=none \
	--tmpfs /tmp:rw,nosuid,nodev --user 0:0 --entrypoint bash -i \
	"${builder_image}" -s <<'BUILDER_GIT_CHECK'
set -euo pipefail
export LC_ALL=C GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_COUNT=0
unset GIT_CONFIG_PARAMETERS SUDO_UID SUDO_GID

work_dir="$(mktemp -d /tmp/php-wasm-builder-git.XXXXXXXX)"
trap 'rm -rf "${work_dir}"' EXIT
cache="${work_dir}/restored.git"

git --version
git init --bare --quiet "${cache}"
chown -R 65534:65534 "${cache}"

if git -C "${cache}" rev-parse --is-bare-repository >"${work_dir}/untrusted.out" 2>"${work_dir}/untrusted.err"; then
	echo 'Builder Git did not reject a foreign-owned cache without safe.directory' >&2
	exit 1
fi
if ! grep -Fq 'detected dubious ownership' "${work_dir}/untrusted.err"; then
	cat "${work_dir}/untrusted.err" >&2
	echo 'Builder Git failed for a reason other than cache ownership' >&2
	exit 1
fi

if ! trusted="$(git -c "safe.directory=${cache}" -C "${cache}" rev-parse --is-bare-repository)"; then
	echo 'Builder Git does not support command-scoped safe.directory for restored importer caches' >&2
	exit 1
fi
if [[ "${trusted}" != true ]]; then
	echo "Builder Git returned an unexpected bare-cache result: ${trusted}" >&2
	exit 1
fi

echo 'Builder Git cache ownership checks passed'
BUILDER_GIT_CHECK
