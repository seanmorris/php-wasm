/**
 * Selects the PDO-PGlite side module for demos that provide a PGlite constructor.
 */
import pdoPglite from 'pdo-pglite';

/**
 * Shared and static profiles already include the driver; PHP 8.0 cannot use it.
 * @param {string} libType Selected library profile.
 * @param {string} version Selected PHP version.
 * @returns {object[]} Extension loaders needed by the selected runtime.
 */
export const pdoPgliteLibraries = (libType, version) => libType === 'dynamic' && version !== '8.0'
	? [pdoPglite]
	: [];
