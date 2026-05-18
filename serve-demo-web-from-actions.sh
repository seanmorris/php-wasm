#!/usr/bin/env bash

set -euo pipefail

DEFAULT_ACTIONS_URL="https://github.com/seanmorris/php-wasm/actions/runs/25331839202"
DEFAULT_LIB_TYPE="dynamic"
DEFAULT_TMP_ROOT="/tmp"

artifact_name="${ARTIFACT_NAME:-}"
artifact_name_explicit=0
lib_type="${LIB_TYPE:-$DEFAULT_LIB_TYPE}"
port="${PORT:-}"
tmp_root="${TMP_ROOT:-$DEFAULT_TMP_ROOT}"
actions_url=""
repo_slug=""
run_id=""

usage() {
	cat <<EOF
Usage: $(basename "$0") [options] [actions-run-url]

Download a web demo build artifact from GitHub Actions into /tmp and serve it
with http-server under /php-wasm/.

Options:
  -u, --url URL              GitHub Actions run URL.
  -r, --run-id ID            GitHub Actions run id.
  -R, --repo OWNER/REPO      Repository for --run-id mode.
  -l, --lib-type TYPE        Artifact lib type: dynamic, shared, or static.
                             Default: ${DEFAULT_LIB_TYPE}
  -a, --artifact-name NAME   Artifact name to download.
                             Default: php-demo-web-<lib-type>
  -p, --port PORT            Port for http-server.
                             Default: let http-server decide
  -d, --tmp-root DIR         Parent directory for downloaded files.
                             Default: ${DEFAULT_TMP_ROOT}
  -h, --help                 Show this help and exit.

Defaults:
  If no URL or run id is provided, the script uses:
    ${DEFAULT_ACTIONS_URL}

Examples:
  $(basename "$0")
  $(basename "$0") https://github.com/seanmorris/php-wasm/actions/runs/25331839202
  $(basename "$0") --url ${DEFAULT_ACTIONS_URL}
  $(basename "$0") --run-id 25331839202 --repo seanmorris/php-wasm
  $(basename "$0") --lib-type shared --port 8091
  $(basename "$0") --artifact-name php-demo-web-dynamic
EOF
}

while [[ $# -gt 0 ]]; do
	case "$1" in
		-u|--url)
			actions_url="${2:-}"
			shift 2
			;;
		-r|--run-id)
			run_id="${2:-}"
			shift 2
			;;
		-R|--repo)
			repo_slug="${2:-}"
			shift 2
			;;
		-l|--lib-type)
			lib_type="${2:-}"
			shift 2
			;;
		-a|--artifact-name)
			artifact_name="${2:-}"
			artifact_name_explicit=1
			shift 2
			;;
		-p|--port)
			port="${2:-}"
			shift 2
			;;
		-d|--tmp-root)
			tmp_root="${2:-}"
			shift 2
			;;
		-h|--help)
			usage
			exit 0
			;;
		--)
			shift
			break
			;;
		-*)
			echo "Unknown option: $1" >&2
			usage >&2
			exit 1
			;;
		*)
			if [[ -z "$actions_url" && -z "$run_id" ]]; then
				actions_url="$1"
				shift
				continue
			fi

			echo "Unexpected argument: $1" >&2
			usage >&2
			exit 1
			;;
	esac
done

case "$lib_type" in
	dynamic|shared|static)
		;;
	*)
		echo "Unsupported lib type: ${lib_type}" >&2
		echo "Expected one of: dynamic, shared, static" >&2
		exit 1
		;;
esac

if [[ "$artifact_name_explicit" -eq 0 && -z "$artifact_name" ]]; then
	artifact_name="php-demo-web-${lib_type}"
fi

if [[ -n "$actions_url" && -n "$run_id" ]]; then
	echo "Use either --url or --run-id, not both." >&2
	exit 1
fi

if [[ -z "$actions_url" && -z "$run_id" ]]; then
	actions_url="$DEFAULT_ACTIONS_URL"
fi

if [[ -n "$actions_url" ]]; then
	if [[ "$actions_url" =~ ^https://github\.com/([^/]+)/([^/]+)/actions/runs/([0-9]+)(/.*)?$ ]]; then
		owner="${BASH_REMATCH[1]}"
		repo="${BASH_REMATCH[2]}"
		repo_slug="${owner}/${repo}"
		run_id="${BASH_REMATCH[3]}"
	else
		echo "Expected a GitHub Actions run URL like:" >&2
		echo "  https://github.com/<owner>/<repo>/actions/runs/<run-id>" >&2
		exit 1
	fi
elif [[ -n "$run_id" ]]; then
	if [[ ! "$repo_slug" =~ ^[^/]+/[^/]+$ ]]; then
		echo "--repo OWNER/REPO is required when using --run-id." >&2
		exit 1
	fi
else
	echo "Unable to determine a workflow run." >&2
	exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
	echo "`gh` is required but was not found in PATH." >&2
	exit 1
fi

run_root="${tmp_root%/}/${artifact_name}-run-${run_id}"
archive_dir="${run_root}/artifact"
site_dir="${run_root}/site"
tarball="${archive_dir}/${artifact_name}.tar.gz"
serve_root="${site_dir}"

rm -rf "$run_root"
mkdir -p "$archive_dir" "$site_dir"

echo "Downloading ${artifact_name} from ${repo_slug} run ${run_id}..."
gh run download "$run_id" \
	-R "$repo_slug" \
	-n "$artifact_name" \
	-D "$archive_dir"

if [[ ! -f "$tarball" ]]; then
	echo "Expected artifact tarball at ${tarball}, but it was not found." >&2
	exit 1
fi

echo "Extracting ${tarball} into ${site_dir}..."
tar -xzf "$tarball" -C "$site_dir"

if [[ -d "${site_dir}/docs" ]]; then
	serve_root="${run_root}/serve-root"
	mkdir -p "$serve_root"
	mv "${site_dir}/docs" "${serve_root}/php-wasm"
fi

echo "Artifact stored in ${run_root}"

http_server_args=("$serve_root" "-c-1")

if [[ -n "$port" ]]; then
	http_server_args+=("-p" "$port")
	echo "Serving ${serve_root} on http://127.0.0.1:${port}/php-wasm/"
else
	echo "Serving ${serve_root} with http-server default port selection under /php-wasm/"
fi

exec npx --yes http-server "${http_server_args[@]}"
