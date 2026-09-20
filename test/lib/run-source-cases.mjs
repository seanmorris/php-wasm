import assert from 'node:assert/strict';

const cases = [
	['strict calls', '<?php declare(strict_types=1); try { (function(int $n) {})("1"); } catch(TypeError $error) { echo "strict"; }', 'strict']
	, ['strict namespace', '<?php declare(strict_types=1); namespace Issue52; echo __NAMESPACE__;', 'Issue52']
	, ['tag casing and CRLF', '<?PHP\r\ndeclare(strict_types=1);\r\necho __LINE__;', '3']
	, ['mixed markup', '<?php declare(strict_types=1); echo "first"; ?>html<?= "last" ?>', 'firsthtmllast']
	, ['HTML first', 'html<?php echo "php"; ?>tail', 'htmlphptail']
	, ['short echo', '<?= "short" ?>', 'short']
	, ['empty PHP', '<?php', '']
	, ['empty source', '', '']
	, ['leading output stays invalid for strict types', ' <?php declare(strict_types=1);', /strict_types declaration must be the very first statement/, 1]
	, ['BOM stays output', '\uFEFF<?php declare(strict_types=1);', /strict_types declaration must be the very first statement/, 1]
];

/**
 * Exercises identical PHP source semantics through ESM and CommonJS consumers.
 * @param {typeof import('./PhpNode.mjs').PhpNode} PhpNode Runtime constructor for the consumer under test.
 * @param {(name: string, callback: () => Promise<void>) => Promise<void>} register Test registration function.
 * @returns {Promise<void>} Completion of all source cases.
 */
export async function testRunSources(PhpNode, register)
{
	for(const [name, source, expected, status = 0] of cases)
	{
		await register(`run preserves PHP source semantics: ${name}`, async () => {
			const php = new PhpNode();
			let output = '';
			php.addEventListener('output', event => output += event.detail.join(''));
			assert.equal(await php.run(source), status);
			if(expected instanceof RegExp) assert.match(output, expected);
			else assert.equal(output, expected);
		});
	}

	await register('strict declarations do not leak into subsequent runs', async () => {
		const php = new PhpNode();
		let output = '';
		php.addEventListener('output', event => output += event.detail.join(''));
		assert.equal(await php.run('<?php declare(strict_types=1); $saved = 4;'), 0);
		assert.equal(await php.run('<?php echo $saved; echo (function(int $n) { return $n; })("1");'), 0);
		assert.equal(output, '41');
	});
}
