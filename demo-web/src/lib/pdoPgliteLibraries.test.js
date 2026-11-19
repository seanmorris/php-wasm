import {pdoPgliteLibraries} from './pdoPgliteLibraries';

describe('demo PDO-PGlite libraries', () => {
	it('loads only the matching driver for supported dynamic runtimes', () => {
		for(const version of ['8.1', '8.2', '8.3', '8.4', '8.5'])
		{
			const libraries = pdoPgliteLibraries('dynamic', version);
			expect(libraries.flatMap(loader => loader.getLibs({phpVersion: version})).map(lib => lib.name))
				.toEqual([`php${version}-pdo-pglite.so`]);
		}
	});

	it('keeps PHP 8.0 and compiled-in drivers out of the dynamic library list', () => {
		for(const profile of ['dynamic', 'shared', 'static'])
		{
			expect(pdoPgliteLibraries(profile, '8.0')).toEqual([]);
		}
		for(const profile of ['shared', 'static'])
		{
			expect(pdoPgliteLibraries(profile, '8.4')).toEqual([]);
		}
	});
});
