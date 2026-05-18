#!/usr/bin/env bash

set -euo pipefail

usage() {
	echo "Usage: $0 <npm-tag> [--dry-run|--real] [--registry <url>|--registry=<url>]"
	echo
	echo "Publishes package directories under ./packages serially."
	echo "Dry-run is the default. Use --real for an actual publish."
	echo "Do not pass OTP on the command line; let npm prompt if needed."
}

NPM_TAG=""

DRY_RUN=1
REGISTRY="${NPM_REGISTRY:-}"

while [[ "$#" -gt 0 ]]; do
	case "$1" in
		--real)
			DRY_RUN=0
			;;
		--dry-run)
			DRY_RUN=1
			;;
		--registry)
			shift || true
			if [[ "$#" -eq 0 ]]; then
				echo "Missing value for --registry" >&2
				usage
				exit 1
			fi
			REGISTRY="$1"
			;;
		--registry=*)
			REGISTRY="${1#*=}"
			;;
		-h|--help)
			usage
			exit 0
			;;
		--)
			shift
			while [[ "$#" -gt 0 ]]; do
				if [[ -z "${NPM_TAG}" ]]; then
					NPM_TAG="$1"
				else
					echo "Unexpected extra argument: $1" >&2
					usage
					exit 1
				fi
				shift
			done
			break
			;;
		-*)
			echo "Unknown argument: $1" >&2
			usage
			exit 1
			;;
		*)
			if [[ -z "${NPM_TAG}" ]]; then
				NPM_TAG="$1"
			else
				echo "Unexpected extra argument: $1" >&2
				usage
				exit 1
			fi
			;;
	esac
	shift
done

if [[ -z "${NPM_TAG}" ]]; then
	echo "Missing npm tag." >&2
	usage
	exit 1
fi

if [[ "${DRY_RUN}" -eq 0 && -n "${CI:-}" ]]; then
	echo "Refusing to run a real publish from CI with the local publish script." >&2
	echo "Use a trusted publishing workflow instead." >&2
	exit 1
fi

echo -e "Getting ready to publish to channel: \033[33m${NPM_TAG}\033[0m"
if [[ "${DRY_RUN}" -eq 1 ]]; then
	echo "Mode: dry-run"
else
	echo "Mode: real publish"
fi
sleep 3

PACKAGES=()
for PACKAGE_DIR in packages/*; do
	[[ -d "${PACKAGE_DIR}" ]] || continue
	[[ -f "${PACKAGE_DIR}/package.json" ]] || continue

	PACKAGE="$(basename "${PACKAGE_DIR}")"
	if [[ "${PACKAGE}" == "sdl" ]]; then
		continue
	fi

	if [[ "$(jq -r '.private // false' < "${PACKAGE_DIR}/package.json")" == "true" ]]; then
		continue
	fi

	PACKAGES+=("${PACKAGE}")
done

IFS=$'\n' PACKAGES=($(printf '%s\n' "${PACKAGES[@]}" | sort))
unset IFS

for PACKAGE in "${PACKAGES[@]}"; do
	echo -e "Checking packlist in \033[1m${PACKAGE}\033[0m"
	cd "packages/${PACKAGE}"

	PACK_INFO="$(npm pack --dry-run --json)"
	jq -e '(length > 0) and ((.[0].files | length) > 0)' <<< "${PACK_INFO}" >/dev/null
	jq -r '.[0] | "  packlist (\(.files | length) files, \(.size) bytes tarball, \(.unpackedSize) bytes unpacked):", (.files[] | "    - \(.path)")' <<< "${PACK_INFO}"

	cd "../.."
done

for PACKAGE in "${PACKAGES[@]}"; do
	cd "packages/${PACKAGE}"
	echo -e "\033[33mChanged files in \033[1m${PACKAGE}:\033[0m"
	npm diff --tag "${NPM_TAG}" --diff-name-only || true
	cd "../.."
done

for PACKAGE in "${PACKAGES[@]}"; do
	cd "packages/${PACKAGE}"

	PUBLISH_ARGS=(publish --tag "${NPM_TAG}")

	if [[ -n "${REGISTRY}" ]]; then
		PUBLISH_ARGS+=(--registry "${REGISTRY}")
	fi

	if [[ "${DRY_RUN}" -eq 1 ]]; then
		PUBLISH_ARGS+=(--dry-run)
	fi

	echo -e "\033[32mPublishing \033[1m${PACKAGE}\033[0m"
	npm "${PUBLISH_ARGS[@]}"

	cd "../.."
done
