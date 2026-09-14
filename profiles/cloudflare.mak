# Cloudflare is a platform profile, not the ordinary static-extension variant.
# Keep this explicit and independent of .env, .php-wasm-rc and npm discovery.
override EXTENSION_PACKAGE_DIRS := packages/vrzno packages/pdo-cfd1 packages/zlib packages/libzip
override PHP_DIST_DIR := packages/php-cloud-wasm
override CPU_COUNT := $(or ${CLOUDFLARE_BUILD_JOBS},8)
override MAIN_MODULE := 0
override ASYNCIFY := 1
override WITH_VRZNO := 1
override WITH_PDO_CFD1 := 1
override EXTRA_CFLAGS := -DWITH_VRZNO=1 -DWITH_PDO_CFD1=1
override WITH_PDO_PGLITE := 0
override WITH_ZLIB := static
override WITH_LIBZIP := static
override LIBZIP_CMAKE_FLAGS := -DENABLE_COMMONCRYPTO=OFF -DENABLE_GNUTLS=OFF -DENABLE_MBEDTLS=OFF -DENABLE_OPENSSL=OFF -DENABLE_BZIP2=OFF -DENABLE_LZMA=OFF -DENABLE_ZSTD=OFF -DBUILD_TOOLS=OFF -DBUILD_REGRESS=OFF -DBUILD_EXAMPLES=OFF -DBUILD_DOC=OFF
override WITH_LIBXML := 0
override WITH_ONIGURUMA := 0
override WITH_NETWORKING := 0
override NODE_RAW_FS := 0
override PRELOAD_ASSETS :=
override EXTRA_PRE_JS_FILES :=
override WITH_SOURCEMAPS := 0
override PHP_VARIANT :=
override OPTIMIZE := z
override SUB_OPTIMIZE := z
override INITIAL_MEMORY := 64MB
override MAXIMUM_MEMORY := 96MB
override ASSERTIONS := 1
override SYMBOLS := 0
override WITH_BCMATH := 0
override WITH_CALENDAR := 0
override WITH_CTYPE := 1
override WITH_EXIF := 0
override WITH_FILTER := 1
override WITH_SESSION := 1
override WITH_TOKENIZER := 1
