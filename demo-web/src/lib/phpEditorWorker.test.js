import {readFileSync} from 'node:fs';
import {createContext, runInContext} from 'node:vm';
import {expect, test} from 'vitest';
import {patchPhpEditorWorker} from './phpEditorWorker';

const source = readFileSync('node_modules/ace-builds/src-noconflict/worker-php.js', 'utf8');

/** Load the actual Ace worker parser without mocking its PHP lexer or grammar. */
const parser = (workerSource = patchPhpEditorWorker(source)) => {
	const context = createContext({console});
	runInContext(workerSource, context);
	const {PHP} = context.require('ace/mode/php/php');
	return code => new PHP.Parser(PHP.Lexer(code, {short_open_tag: 1}));
};

test('the bundled worker reproduces the cube EOF error before correction', () => {
	const cube = readFileSync('public/scripts/sdl-cube.php', 'utf8');
	expect(() => parser(source)(cube)).toThrow(/unexpected EOF/);
});

test('the corrected worker accepts the complete cube source', () => {
	const cube = readFileSync('public/scripts/sdl-cube.php', 'utf8');
	expect(() => parser()(cube)).not.toThrow();
});

test.each([
	["'END'", '\t', 'consume(', ');']
	, ['END', '    ', '[', ', 42];']
	, ['"END"', '\t', '', ' . "suffix";']
	, ["'END'", '', '', '; // closing comment']
])('worker accepts %s with indentation %j and expression continuation', (label, indent, before, after) => {
	const code = `<?php\n$value = ${before}<<<${label}\n${indent}shader body\n${indent}END${after}\necho $value;`;
	expect(() => parser()(code)).not.toThrow();
});

test('worker retains case-sensitive delimiters, identifier suffixes, interpolation and CRLF lines', () => {
	const code = ['<?php', '$value = <<<END', '\tend', '\tEND_EXTRA', '\tEND123', '\tENDé', '\tHello $name', '\tEND;', '$nowdoc = <<<\'LITERAL\'', '\t$name', '\tLITERAL;', 'echo $value, $nowdoc;'].join('\r\n');
	expect(() => parser()(code)).not.toThrow();
});

test('a closing delimiter at EOF does not require a trailing newline', () => {
	expect(() => parser()("<?php\n$value = <<<'END'\n  body\n  END;")).not.toThrow();
});

test('real syntax errors after a heredoc keep their original line number', () => {
	const parse = parser();
	const code = "<?php\n$value = <<<'END'\n  body\n  END;\n$broken = ;";
	let error;
	try
	{
		parse(code);
	}
	catch(caught)
	{
		error = caught;
	}
	expect(error?.message).toMatch(/unexpected ';'/);
	expect(error?.line).toBe(5);
});

test('an unterminated nowdoc still produces an error', () => {
	expect(() => parser()("<?php\n$value = <<<'END'\nbody\nEND_EXTRA;")).toThrow(/unexpected EOF/);
});

test('dependency changes require reviewing the patch instead of silently dropping validation', () => {
	expect(() => patchPhpEditorWorker(source.replace('return [src.substr(0, heredoc.length)];', 'return changed;'))).toThrow(/Ace PHP worker changed/);
});
