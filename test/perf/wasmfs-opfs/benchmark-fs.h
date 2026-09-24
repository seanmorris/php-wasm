/* Benchmark-only exports. Included in the staged PIB translation unit. */
#include <errno.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>
#if BENCH_WASMFS
#include <emscripten/wasmfs.h>
#endif

static int benchmark_read_size = 0;

EMSCRIPTEN_KEEPALIVE int benchmark_mount(void)
{
#if BENCH_WASMFS
	backend_t backend = wasmfs_create_opfs_backend();
	int result = wasmfs_create_directory("/opfs", 0777, backend);
	if(result) return result;
	if(mkdir("/opfs/persist", 0777) && errno != EEXIST) return -errno;
	if(mkdir("/opfs/config", 0777) && errno != EEXIST) return -errno;
	if(symlink("/opfs/persist", "/persist")) return -errno;
	if(symlink("/opfs/config", "/config")) return -errno;
#endif
	return 0;
}

EMSCRIPTEN_KEEPALIVE int benchmark_stat(const char *path)
{
	struct stat info;
	if(stat(path, &info)) return -errno;
	return info.st_mode;
}

EMSCRIPTEN_KEEPALIVE int benchmark_mkdir(const char *path)
{
	if(mkdir(path, 0777) && errno != EEXIST) return -errno;
	return 0;
}

EMSCRIPTEN_KEEPALIVE int benchmark_write(const char *path, const char *data, int length)
{
	int fd = open(path, O_WRONLY | O_CREAT | O_TRUNC, 0666);
	if(fd < 0) return -errno;
	int written = 0;
	while(written < length)
	{
		ssize_t count = write(fd, data + written, length - written);
		if(count <= 0) { int error = errno; close(fd); return -error; }
		written += count;
	}
	if(close(fd)) return -errno;
	return written;
}

EMSCRIPTEN_KEEPALIVE char *benchmark_read(const char *path)
{
	benchmark_read_size = -1;
	int fd = open(path, O_RDONLY);
	if(fd < 0) return NULL;
	struct stat info;
	if(fstat(fd, &info)) { close(fd); return NULL; }
	char *data = malloc(info.st_size + 1);
	if(!data) { close(fd); return NULL; }
	int received = 0;
	while(received < info.st_size)
	{
		ssize_t count = read(fd, data + received, info.st_size - received);
		if(count < 0) { free(data); close(fd); return NULL; }
		if(count == 0) break;
		received += count;
	}
	close(fd);
	data[received] = 0;
	benchmark_read_size = received;
	return data;
}

EMSCRIPTEN_KEEPALIVE int benchmark_read_length(void)
{
	return benchmark_read_size;
}
