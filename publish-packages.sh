#!/usr/bin/env bash

set -euo pipefail

usage() {
	echo "Usage: $0 <npm-tag> [--dry-run|--real] [--registry <url>|--registry=<url>] [--otp <code>|--otp=<code>] [--otp-command <cmd>|--otp-command=<cmd>]"
	echo
	echo "Publishes package directories under ./packages serially."
	echo "Dry-run is the default. Use --real for an actual publish."
	echo "For real publishes, prefer --otp-command or the interactive prompt over a fixed --otp code."
}

NPM_TAG=""

DRY_RUN=1
REGISTRY="${NPM_REGISTRY:-}"
OTP="${NPM_OTP:-}"
OTP_COMMAND="${NPM_OTP_COMMAND:-}"

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
		--otp)
			shift || true
			if [[ "$#" -eq 0 ]]; then
				echo "Missing value for --otp" >&2
				usage
				exit 1
			fi
			OTP="$1"
			;;
		--otp=*)
			OTP="${1#*=}"
			;;
		--otp-command)
			shift || true
			if [[ "$#" -eq 0 ]]; then
				echo "Missing value for --otp-command" >&2
				usage
				exit 1
			fi
			OTP_COMMAND="$1"
			;;
		--otp-command=*)
			OTP_COMMAND="${1#*=}"
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

PACKAGES_TO_PUBLISH=()
SKIPPED_PACKAGES=()

for PACKAGE in "${PACKAGES[@]}"; do
	cd "packages/${PACKAGE}"
	echo -e "\033[33mChanged files in \033[1m${PACKAGE}:\033[0m"

	set +e
	DIFF_OUTPUT="$(npm diff --tag "${NPM_TAG}" --diff-name-only 2>&1)"
	DIFF_STATUS=$?
	set -e

	if [[ -n "${DIFF_OUTPUT}" ]]; then
		printf '%s\n' "${DIFF_OUTPUT}"
	fi

	if [[ "${DIFF_STATUS}" -eq 0 ]]; then
		if [[ -n "$(printf '%s' "${DIFF_OUTPUT}" | tr -d '[:space:]')" ]]; then
			PACKAGES_TO_PUBLISH+=("${PACKAGE}")
		else
			SKIPPED_PACKAGES+=("${PACKAGE}")
			echo "  no diff against ${NPM_TAG}; skipping publish"
		fi
	elif grep -q 'E404' <<< "${DIFF_OUTPUT}"; then
		echo "  package missing on ${NPM_TAG}; treating as a publish candidate"
		PACKAGES_TO_PUBLISH+=("${PACKAGE}")
	else
		echo "  npm diff failed; publishing anyway" >&2
		PACKAGES_TO_PUBLISH+=("${PACKAGE}")
	fi

	cd "../.."
done

if [[ "${#SKIPPED_PACKAGES[@]}" -gt 0 ]]; then
	echo
	echo "Skipping unchanged packages: ${SKIPPED_PACKAGES[*]}"
fi

if [[ "${#PACKAGES_TO_PUBLISH[@]}" -eq 0 ]]; then
	echo
	echo "No packages need publishing for tag ${NPM_TAG}."
	exit 0
fi

echo
echo "Packages queued for publish: ${PACKAGES_TO_PUBLISH[*]}"

resolve_publish_otp() {
	local PACKAGE="$1"

	if [[ -n "${OTP_COMMAND}" ]]; then
		bash -lc "${OTP_COMMAND}"
		return
	fi

	if [[ -n "${OTP}" ]]; then
		printf '%s\n' "${OTP}"
		return
	fi

	if [[ -t 0 ]]; then
		local OTP_INPUT
		read -r -p "OTP for ${PACKAGE}: " OTP_INPUT
		printf '%s\n' "${OTP_INPUT}"
	fi
}

for PACKAGE in "${PACKAGES_TO_PUBLISH[@]}"; do
	cd "packages/${PACKAGE}"

	PUBLISH_ARGS=(publish --tag "${NPM_TAG}")

	if [[ -n "${REGISTRY}" ]]; then
		PUBLISH_ARGS+=(--registry "${REGISTRY}")
	fi

	if [[ "${DRY_RUN}" -eq 1 ]]; then
		PUBLISH_ARGS+=(--dry-run)
	else
		PUBLISH_OTP="$(resolve_publish_otp "${PACKAGE}")"
		if [[ -n "${PUBLISH_OTP}" ]]; then
			PUBLISH_ARGS+=(--otp "${PUBLISH_OTP}")
		fi
	fi

	echo -e "\033[32mPublishing \033[1m${PACKAGE}\033[0m"
	npm "${PUBLISH_ARGS[@]}"

	cd "../.."
done
