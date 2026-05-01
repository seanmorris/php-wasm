/**
 * Filesystem helpers for queued runtime operations.
 */
export class fsOps
{
	/**
	 * Returns a normalized analysis record for a filesystem path.
	 * @param {Promise<object>} binary Deferred PHP module instance.
	 * @param {string} path Filesystem path to inspect.
	 * @returns {Promise<object>} Sanitized Emscripten path analysis result.
	 */
	static async analyzePath(binary, path)
	{
		const result = (await binary).FS.analyzePath(path);

		if(!result.object)
		{
			return { exists: false };
		}

		const object = {
			exists: true
			, id: result.object.id
			, mode : result.object.mode
			, mount: {
				mountpoint: result.object.mount.mountpoint
				, mounts: result.object.mount.mounts.map(m => m.mountpoint)
			}
			, isDevice: result.object.isDevice
			, isFolder: result.object.isFolder
			, read: result.object.read
			, write: result.object.write
		};

		return {...result, object, parentObject: undefined};
	}

	/**
	 * Lists the entries in a virtual directory.
	 * @param {Promise<object>} binary Deferred PHP module instance.
	 * @param {string} path Directory path to list.
	 * @returns {Promise<string[]>} Directory entries for the path.
	 */
	static async readdir(binary, path)
	{
		return (await binary).FS.readdir(path);
	}

	/**
	 * Reads a file from the virtual filesystem.
	 * @param {Promise<object>} binary Deferred PHP module instance.
	 * @param {string} path File path to read.
	 * @param {object} options Read options forwarded to Emscripten FS.
	 * @returns {Promise<unknown>} File contents for the requested path.
	 */
	static async readFile(binary, path, options)
	{
		return (await binary).FS.readFile(path, options);
	}

	/**
	 * Returns file metadata for a virtual filesystem path.
	 * @param {Promise<object>} binary Deferred PHP module instance.
	 * @param {string} path Filesystem path to stat.
	 * @returns {Promise<unknown>} File metadata for the path.
	 */
	static async stat(binary, path)
	{
		return (await binary).FS.stat(path);
	}

	/**
	 * Creates a directory in the virtual filesystem.
	 * @param {Promise<object>} binary Deferred PHP module instance.
	 * @param {string} path Directory path to create.
	 * @returns {Promise<object>} Metadata for the created directory.
	 */
	static async mkdir(binary, path)
	{
		const php = (await binary);
		const _result = php.FS.mkdir(path);

		return {
			id: _result.id
			, mode : _result.mode
			, mount: {
				mountpoint: _result.mount.mountpoint
				, mounts: _result.mount.mounts.map(m => m.mountpoint)
			}
			, isDevice: _result.isDevice
			, isFolder: _result.isFolder
			, read: _result.read
			, write: _result.write
		};
	}

	/**
	 * Removes a directory from the virtual filesystem.
	 * @param {Promise<object>} binary Deferred PHP module instance.
	 * @param {string} path Directory path to remove.
	 * @returns {Promise<unknown>} Resolves when the directory has been removed.
	 */
	static async rmdir(binary, path)
	{
		return (await binary).FS.rmdir(path);
	}

	/**
	 * Renames a path in the virtual filesystem.
	 * @param {Promise<object>} binary Deferred PHP module instance.
	 * @param {string} path Existing filesystem path.
	 * @param {string} newPath Destination filesystem path.
	 * @returns {Promise<unknown>} Resolves when the path has been renamed.
	 */
	static async rename(binary, path, newPath)
	{
		return (await binary).FS.rename(path, newPath);
	}

	/**
	 * Writes data to a file in the virtual filesystem.
	 * @param {Promise<object>} binary Deferred PHP module instance.
	 * @param {string} path File path to write.
	 * @param {string|Uint8Array} data Data to persist.
	 * @param {object} options Write options forwarded to Emscripten FS.
	 * @returns {Promise<unknown>} Resolves when the file has been written.
	 */
	static async writeFile(binary, path, data, options)
	{
		const bin = (await binary);

		const about = bin.FS.analyzePath(path);

		let forced = false;

		if(about.object && about.object.mode)
		{
			if(!(about.object.mode & 0o200))
			{
				await bin.FS.chmod(path, about.object.mode | 0o200);
			}
		}

		const result = bin.FS.writeFile(path, data, options);

		if(forced)
		{
			await bin.FS.chmod(path, about.object.mode);
		}

		return result;
	}

	/**
	 * Deletes a file from the virtual filesystem.
	 * @param {Promise<object>} binary Deferred PHP module instance.
	 * @param {string} path File path to remove.
	 * @returns {Promise<unknown>} Resolves when the file has been removed.
	 */
	static async unlink(binary, path)
	{
		return (await binary).FS.unlink(path);
	}

	/**
	 * Changes permissions for a virtual filesystem path.
	 * @param {Promise<object>} binary Deferred PHP module instance.
	 * @param {number} mode POSIX permission mode to apply.
	 * @returns {Promise<unknown>} Resolves when the mode has been applied.
	 */
	static async chmod(binary, mode)
	{
		return (await binary).FS.chmod(mode);
	}
}
