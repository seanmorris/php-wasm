#!/usr/bin/env bash

set -euo pipefail

DEFAULT_ACTIONS_URL="https://github.com/seanmorris/php-wasm/actions/runs/25331839202"
DEFAULT_LIB_TYPE="dynamic"
DEFAULT_TMP_ROOT="/tmp"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_WORKSPACE_ROOT="${SCRIPT_DIR}"

artifact_family="uncompressed"
artifact_name="${ARTIFACT_NAME:-}"
lib_type="${LIB_TYPE:-$DEFAULT_LIB_TYPE}"
overwrite_mode="ask"
php_version=""
tmp_root="${TMP_ROOT:-$DEFAULT_TMP_ROOT}"
workspace_root="${WORKSPACE_ROOT:-$DEFAULT_WORKSPACE_ROOT}"
actions_url=""
repo_slug=""
run_id=""

usage() {
	cat <<EOF
Usage: $(basename "$0") [options] [actions-run-url]

Download a PHP build artifact from GitHub Actions, extract it into /tmp, and
overlay the packaged workspace contents into the local packages/ checkout.

Options:
  -u, --url URL              GitHub Actions run URL.
  -r, --run-id ID            GitHub Actions run id.
  -R, --repo OWNER/REPO      Repository for --run-id mode.
  -l, --lib-type TYPE        Artifact lib type: dynamic, shared, or static.
                             Default: ${DEFAULT_LIB_TYPE}
  -o, --overwrite            Overwrite differing existing files without prompting.
  -c, --compressed           Download php-compressed-<lib-type>.
  -U, --uncompressed         Download php-uncompressed-<php-version>-<lib-type>.
                             Default when neither flag is provided.
  -v, --php-version VERSION  PHP version for uncompressed artifacts.
                             If omitted, download all matching versions.
  -a, --artifact-name NAME   Artifact name to download.
                             Overrides compressed/uncompressed naming.
  -w, --workspace-root DIR   Workspace root to overlay into.
                             Default: ${DEFAULT_WORKSPACE_ROOT}
  -d, --tmp-root DIR         Parent directory for downloaded files.
                             Default: ${DEFAULT_TMP_ROOT}
  -h, --help                 Show this help and exit.

Defaults:
  If no URL or run id is provided, the script uses:
    ${DEFAULT_ACTIONS_URL}

Examples:
  $(basename "$0")
  $(basename "$0") --url ${DEFAULT_ACTIONS_URL}
  $(basename "$0") --lib-type shared
  $(basename "$0") --overwrite --lib-type shared
  $(basename "$0") --lib-type shared --php-version 8.4
  $(basename "$0") --compressed --run-id 25331839202 --repo seanmorris/php-wasm
  $(basename "$0") --artifact-name php-compressed-dynamic
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
		-o|--overwrite)
			overwrite_mode="yes"
			shift
			;;
		-c|--compressed)
			artifact_family="compressed"
			shift
			;;
		-U|--uncompressed)
			artifact_family="uncompressed"
			shift
			;;
		-v|--php-version)
			php_version="${2:-}"
			shift 2
			;;
		-a|--artifact-name)
			artifact_name="${2:-}"
			shift 2
			;;
		-w|--workspace-root)
			workspace_root="${2:-}"
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

case "$artifact_family" in
	compressed|uncompressed)
		;;
	*)
		echo "Unsupported artifact family: ${artifact_family}" >&2
		echo "Expected one of: compressed, uncompressed" >&2
		exit 1
		;;
esac

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

if [[ ! -d "$workspace_root" ]]; then
	echo "Workspace root does not exist: ${workspace_root}" >&2
	exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
	echo "\`gh\` is required but was not found in PATH." >&2
	exit 1
fi

if ! command -v sha256sum >/dev/null 2>&1; then
	echo "\`sha256sum\` is required but was not found in PATH." >&2
	exit 1
fi

prompt_for_overwrite() {
	local reply=""

	if [[ "$overwrite_mode" != "ask" ]]; then
		return 0
	fi

	if [[ ! -t 0 ]]; then
		echo "A conflicting file needs overwrite confirmation, but stdin is not interactive." >&2
		echo "Re-run with --overwrite to replace differing files automatically." >&2
		exit 1
	fi

	while true; do
		read -r -p "Overwrite differing existing files for this run? [y/N] " reply

		case "$reply" in
			[yY]|[yY][eE][sS])
				overwrite_mode="yes"
				return 0
				;;
			""|[nN]|[nN][oO])
				overwrite_mode="no"
				return 0
				;;
			*)
				echo "Please answer y or n." >&2
				;;
		esac
	done
}

file_hash() {
	local path="$1"
	sha256sum "$path" | awk '{print $1}'
}

copy_overlay_entry() {
	local source_path="$1"
	local source_root="$2"
	local artifact_base="$3"
	local relative_path="${source_path#"$source_root"/}"
	local target_path="${workspace_root%/}/${relative_path}"
	local target_parent

	target_parent="$(dirname "$target_path")"
	mkdir -p "$target_parent"

	if [[ -L "$source_path" ]]; then
		local source_link
		source_link="$(readlink "$source_path")"

		if [[ -L "$target_path" && "$(readlink "$target_path")" == "$source_link" ]]; then
			echo "Skipping identical symlink ${relative_path}"
			skipped_match_count=$((skipped_match_count + 1))
			return 0
		fi

		if [[ -e "$target_path" || -L "$target_path" ]]; then
			prompt_for_overwrite

			if [[ "$overwrite_mode" != "yes" ]]; then
				echo "Skipping conflicting symlink ${relative_path}"
				skipped_conflict_count=$((skipped_conflict_count + 1))
				return 0
			fi

			rm -rf "$target_path"
		fi

		cp -a "$source_path" "$target_path"
		echo "Overlayed ${relative_path} from ${artifact_base}"
		copied_count=$((copied_count + 1))
		return 0
	fi

	if [[ ! -f "$source_path" ]]; then
		return 0
	fi

	if [[ -f "$target_path" && ! -L "$target_path" ]]; then
		if [[ "$(file_hash "$source_path")" == "$(file_hash "$target_path")" ]]; then
			echo "Skipping identical file ${relative_path}"
			skipped_match_count=$((skipped_match_count + 1))
			return 0
		fi

		prompt_for_overwrite

		if [[ "$overwrite_mode" != "yes" ]]; then
			echo "Skipping changed file ${relative_path}"
			skipped_conflict_count=$((skipped_conflict_count + 1))
			return 0
		fi
	elif [[ -e "$target_path" || -L "$target_path" ]]; then
		prompt_for_overwrite

		if [[ "$overwrite_mode" != "yes" ]]; then
			echo "Skipping conflicting file ${relative_path}"
			skipped_conflict_count=$((skipped_conflict_count + 1))
			return 0
		fi
	fi

	if [[ -e "$target_path" || -L "$target_path" ]]; then
		rm -rf "$target_path"
	fi

	cp -a "$source_path" "$target_path"
	echo "Overlayed ${relative_path} from ${artifact_base}"
	copied_count=$((copied_count + 1))
}

download_mode="name"
download_selector=""
run_label=""

if [[ -n "$artifact_name" ]]; then
	download_selector="$artifact_name"
	run_label="$artifact_name"
elif [[ "$artifact_family" == "compressed" ]]; then
	download_selector="php-compressed-${lib_type}"
	run_label="$download_selector"
else
	if [[ -n "$php_version" ]]; then
		download_selector="php-uncompressed-${php_version}-${lib_type}"
		run_label="$download_selector"
	else
		download_mode="pattern"
		download_selector="php-uncompressed-*-${lib_type}"
		run_label="php-uncompressed-all-${lib_type}"
	fi
fi

run_root="${tmp_root%/}/${run_label}-run-${run_id}"
archive_dir="${run_root}/artifact"
extract_dir="${run_root}/extract"
overlay_count=0
copied_count=0
skipped_match_count=0
skipped_conflict_count=0

rm -rf "$run_root"
mkdir -p "$archive_dir" "$extract_dir"

echo "Downloading ${download_selector} from ${repo_slug} run ${run_id}..."

if [[ "$download_mode" == "pattern" ]]; then
	gh run download "$run_id" \
		-R "$repo_slug" \
		-p "$download_selector" \
		-D "$archive_dir"
else
	gh run download "$run_id" \
		-R "$repo_slug" \
		-n "$download_selector" \
		-D "$archive_dir"
fi

mapfile -t tarballs < <(find "$archive_dir" -type f -name '*.tar.gz' | sort)

if [[ "${#tarballs[@]}" -eq 0 ]]; then
	echo "No artifact tarballs were downloaded for selector: ${download_selector}" >&2
	exit 1
fi

for tarball in "${tarballs[@]}"; do
	artifact_base="$(basename "$tarball" .tar.gz)"
	artifact_extract_dir="${extract_dir}/${artifact_base}"

	mkdir -p "$artifact_extract_dir"

	echo "Extracting ${tarball} into ${artifact_extract_dir}..."
	tar -xzf "$tarball" -C "$artifact_extract_dir"

	for path in packages; do
		source_dir="${artifact_extract_dir}/${path}"

		if [[ ! -d "$source_dir" ]]; then
			continue
		fi

		mkdir -p "${workspace_root%/}/${path}"
		overlay_count=$((overlay_count + 1))

		while IFS= read -r -d '' directory_path; do
			relative_path="${directory_path#"$artifact_extract_dir"/}"
			mkdir -p "${workspace_root%/}/${relative_path}"
		done < <(find "$source_dir" -mindepth 1 -type d -print0 | sort -z)

		while IFS= read -r -d '' entry_path; do
			copy_overlay_entry "$entry_path" "$artifact_extract_dir" "$artifact_base"
		done < <(find "$source_dir" -mindepth 1 \( -type f -o -type l \) -print0 | sort -z)
	done
done

if [[ "$overlay_count" -eq 0 ]]; then
	echo "No overlayable directories were found for ${download_selector}." >&2
	echo "Expected: packages" >&2
	exit 1
fi

echo "Overlay complete from ${download_selector} into ${workspace_root}"
echo "Copied: ${copied_count}; skipped identical: ${skipped_match_count}; skipped conflicts: ${skipped_conflict_count}"
