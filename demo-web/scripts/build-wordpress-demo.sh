#!/usr/bin/env bash

set -euo pipefail

PLAYGROUND_COMMIT="320cb98276f26982ff483a884ddb121d05b47884"
PLAYGROUND_ROOT="https://raw.githubusercontent.com/WordPress/wordpress-playground/${PLAYGROUND_COMMIT}/packages/playground/wordpress-builds"

WORDPRESS_ARCHIVE="wp-7.1.tar.zst"
WORDPRESS_SHA256="34c5730426643c63dbaa54c8b37b27a70f558a5178e6147b7ac3b4eb3e419195"
STATIC_ARCHIVE="wordpress-static.zip"
STATIC_SHA256="5d8cb644dfcdf59def66cf2fb9ed6fb9ec408c54ff40fd608944939d62581bc7"
SQLITE_ARCHIVE="sqlite-database-integration-trunk.zip"
SQLITE_SHA256="690f8521a351bf86b3e1516b3af1ab8191ac386e3233b04e4a043f826f961e83"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT="${1:-${SCRIPT_DIR}/../public/backups/wordpress-7.1.zip}"
WORK_DIR="$(mktemp -d)"
SITE_DIR="${WORK_DIR}/wordpress"

cleanup() {
	rm -rf "${WORK_DIR}"
}

trap cleanup EXIT

for command in curl php sha256sum sqlite3 unzip zip zstd
do
	command -v "${command}" >/dev/null || {
		echo "Missing required command: ${command}" >&2
		exit 1
	}
done

download() {
	local url="$1"
	local output="$2"

	curl --fail --location --retry 3 --silent --show-error "${url}" --output "${output}"
}

verify() {
	local checksum="$1"
	local path="$2"

	printf '%s  %s\n' "${checksum}" "${path}" | sha256sum --check --status
}

download \
	"${PLAYGROUND_ROOT}/src/wordpress/${WORDPRESS_ARCHIVE}" \
	"${WORK_DIR}/${WORDPRESS_ARCHIVE}"
download \
	"${PLAYGROUND_ROOT}/public/wp-7.1/${STATIC_ARCHIVE}" \
	"${WORK_DIR}/${STATIC_ARCHIVE}"
download \
	"${PLAYGROUND_ROOT}/src/sqlite-database-integration/${SQLITE_ARCHIVE}" \
	"${WORK_DIR}/${SQLITE_ARCHIVE}"

verify "${WORDPRESS_SHA256}" "${WORK_DIR}/${WORDPRESS_ARCHIVE}"
verify "${STATIC_SHA256}" "${WORK_DIR}/${STATIC_ARCHIVE}"
verify "${SQLITE_SHA256}" "${WORK_DIR}/${SQLITE_ARCHIVE}"

mkdir -p "${SITE_DIR}"
zstd --decompress --stdout --quiet "${WORK_DIR}/${WORDPRESS_ARCHIVE}" \
	| tar -xf - -C "${SITE_DIR}"
unzip -q -o "${WORK_DIR}/${STATIC_ARCHIVE}" -d "${SITE_DIR}"

unzip -q "${WORK_DIR}/${SQLITE_ARCHIVE}" -d "${WORK_DIR}/sqlite"
mkdir -p "${SITE_DIR}/wp-content/plugins"
mv \
	"${WORK_DIR}/sqlite/plugin-sqlite-database-integration" \
	"${SITE_DIR}/wp-content/plugins/sqlite-database-integration"

cp \
	"${SITE_DIR}/wp-content/plugins/sqlite-database-integration/db.copy" \
	"${SITE_DIR}/wp-content/db.php"
sed -i \
	"s#'{SQLITE_IMPLEMENTATION_FOLDER_PATH}'#realpath( __DIR__ . '/plugins/sqlite-database-integration' )#g; s#{SQLITE_PLUGIN}#sqlite-database-integration/load.php#g" \
	"${SITE_DIR}/wp-content/db.php"

cat > "${WORK_DIR}/wp-config.php.fragment" <<'PHP'
/**
 * Resolve the public WordPress URL from the CGI vhost instead of retaining the
 * localhost URL used while WordPress Playground assembled its browser build.
 */
$php_wasm_wordpress_path = '/cgi-bin/wordpress';
$php_wasm_script_name = $_SERVER['SCRIPT_NAME'] ?? '';
$php_wasm_path_offset = strpos( $php_wasm_script_name, $php_wasm_wordpress_path );

if ( false !== $php_wasm_path_offset ) {
	$php_wasm_wordpress_path = substr(
		$php_wasm_script_name,
		0,
		$php_wasm_path_offset + strlen( $php_wasm_wordpress_path )
	);
}

$php_wasm_scheme = $_SERVER['REQUEST_SCHEME'] ?? (
	! empty( $_SERVER['HTTPS'] ) && 'off' !== $_SERVER['HTTPS'] ? 'https' : 'http'
);
$php_wasm_host = preg_replace(
	'/[^A-Za-z0-9.\-:\[\]]/',
	'',
	$_SERVER['HTTP_HOST'] ?? 'localhost'
);

define( 'WP_HOME', $php_wasm_scheme . '://' . $php_wasm_host . $php_wasm_wordpress_path );
define( 'WP_SITEURL', WP_HOME );
define( 'WP_ENVIRONMENT_TYPE', 'local' );

/* Native sockets are unavailable in the browser CGI runtime. */
define( 'WP_HTTP_BLOCK_EXTERNAL', true );
define( 'DISABLE_WP_CRON', true );
define( 'AUTOMATIC_UPDATER_DISABLED', true );
PHP

sed -i \
	'/\/\* Add any custom values between this line and the "stop editing" line\. \*\//r '"${WORK_DIR}/wp-config.php.fragment" \
	"${SITE_DIR}/wp-config.php"

mkdir -p "${SITE_DIR}/wp-content/mu-plugins"
cat > "${SITE_DIR}/wp-content/mu-plugins/php-wasm-demo.php" <<'PHP'
<?php
/**
 * Plugin Name: PHP-WASM WordPress Demo
 * Description: Adds browser-demo login instructions to the bundled front page.
 */

add_filter(
	'the_content',
	static function ( $content ) {
		static $rendered = false;

		if ( $rendered || is_admin() || ! is_front_page() || ! in_the_loop() || ! is_main_query() ) {
			return $content;
		}

		$rendered = true;

		$notice = sprintf(
			'<div class="php-wasm-demo-login" style="border:2px solid currentColor;padding:1rem;margin-bottom:1.5rem">'
			. '<p><strong>%1$s</strong></p>'
			. '<p>%2$s</p>'
			. '<p><strong>%3$s</strong> admin<br><strong>%4$s</strong> admin</p>'
			. '<p><a class="php-wasm-demo-edit" target="_blank" href="/php-wasm/code-editor.html?path=%%2Fpersist%%2Fwordpress-7.1%%2Fwp-content%%2Fmu-plugins%%2Fphp-wasm-demo.php">%5$s</a></p>'
			. '</div>',
			esc_html__( 'WordPress 7.1 is running in the browser!', 'php-wasm-demo' ),
			sprintf(
				wp_kses_post( __( '<a href="%s">Log in</a> to explore the dashboard.', 'php-wasm-demo' ) ),
				esc_url( wp_login_url( admin_url() ) )
			),
			esc_html__( 'Username:', 'php-wasm-demo' ),
			esc_html__( 'Password:', 'php-wasm-demo' ),
			esc_html__( 'Click here to edit this welcome message!', 'php-wasm-demo' )
		);

		return $notice . $content;
	}
);
PHP

DATABASE="${SITE_DIR}/wp-content/database/.ht.sqlite"
ADMIN_HASH='$wp$2y$10$Q1xinFjrZeLWJBvxviIL6u834Fu.evIEFHAUVisQ5O.w9Dm0sMdES'

php -r '
	$password = base64_encode(hash_hmac("sha384", "admin", "wp-sha384", true));
	$hash = substr($argv[1], 3);
	if (!password_verify($password, $hash)) {
		fwrite(STDERR, "Pinned WordPress admin hash is invalid.\n");
		exit(1);
	}
' "${ADMIN_HASH}"

sqlite3 "${DATABASE}" <<SQL
UPDATE wp_options SET option_value = 'WordPress 7.1 on PHP-WASM' WHERE option_name = 'blogname';
UPDATE wp_options SET option_value = 'http://localhost/cgi-bin/wordpress' WHERE option_name IN ('home', 'siteurl');
UPDATE wp_options SET option_value = 'a:1:{i:0;s:36:"sqlite-database-integration/load.php";}' WHERE option_name = 'active_plugins';
UPDATE wp_users SET user_pass = '${ADMIN_HASH}' WHERE user_login = 'admin';
DELETE FROM wp_usermeta WHERE user_id = 1 AND meta_key = 'session_tokens';
UPDATE wp_posts SET post_content = replace(post_content, '<a href="http://127.0.0.1:38977/wp-admin/">your dashboard</a>', 'your dashboard');
UPDATE wp_posts SET guid = replace(guid, 'http://127.0.0.1:38977', 'http://localhost/cgi-bin/wordpress');
SQL

test "$(sqlite3 "${DATABASE}" "SELECT option_value FROM wp_options WHERE option_name = 'blogname';")" = \
	'WordPress 7.1 on PHP-WASM'
test "$(sqlite3 "${DATABASE}" "SELECT user_pass FROM wp_users WHERE user_login = 'admin';")" = \
	"${ADMIN_HASH}"

# Stable timestamps and entry ordering keep regenerated archives reviewable.
find "${SITE_DIR}" -exec touch -d '2026-08-19 20:32:00 UTC' {} +

ARCHIVE="${WORK_DIR}/wordpress-7.1.zip"
(
	cd "${SITE_DIR}"
	find . -type f -print | LC_ALL=C sort | zip -X -q "${ARCHIVE}" -@
)

mkdir -p "$(dirname "${OUTPUT}")"
mv "${ARCHIVE}" "${OUTPUT}"
unzip -tq "${OUTPUT}"
sha256sum "${OUTPUT}"
