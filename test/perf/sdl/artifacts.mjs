import {verifySdl} from '../../../bin/package-sdl.mjs';

/**
 * Lists verified package inputs, including matching native libraries and data.
 * @param {string} directory Finished SDL package directory.
 * @param {string} version PHP minor version.
 * @returns {Promise<string[]>} Package files covered by this measurement.
 */
export async function artifactFiles(directory, version)
{
	const {manifest, manifestName} = await verifySdl(directory, version);
	return [...manifest.files.map(file => file.path), manifestName];
}
