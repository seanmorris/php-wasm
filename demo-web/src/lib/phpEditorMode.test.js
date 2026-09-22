import {readFileSync} from 'node:fs';
import {expect, test} from 'vitest';
import {createPhpEditorMode} from './phpEditorMode';

/** Tokenize successive lines with the real Ace PHP tokenizer and its saved state. */
const tokenize = source => {
	const tokenizer = createPhpEditorMode().getTokenizer();
	let state;

	return source.split(/\r?\n/).map(line => {
		const result = tokenizer.getLineTokens(line, state);
		state = result.state;
		return result;
	});
};

test.each([
	['nowdoc in a function call', "'GLSL'", '\tGLSL);', 'shader(']
	, ['heredoc in a function call', 'GLSL', '    GLSL);', 'shader(']
	, ['quoted heredoc in an array', '"GLSL"', '    GLSL, 42];', '[']
	, ['unindented expression continuation', "'GLSL'", 'GLSL . "suffix";', '']
	, ['classic closing marker', 'GLSL', 'GLSL;', '']
	, ['closing marker followed by a comment', "'GLSL'", '\tGLSL; // end shader', '']
])('%s resumes PHP highlighting', (_name, opening, closing, expression) => {
	const body = closing.match(/^[\t ]*/)[0] + 'void main() {}';
	const lines = tokenize(`<?php\n$value = ${expression}<<<${opening}\n${body}\n${closing}\n$after = 42;`);
	expect(lines[2].tokens).toEqual([{type: 'string', value: body}]);
	expect(lines[3].tokens).toContainEqual({type: 'markup.list', value: closing.match(/^[\t ]*GLSL/)[0]});
	expect(lines[4].tokens).toContainEqual({type: 'variable', value: '$after'});
	expect(lines[4].tokens).toContainEqual({type: 'constant.numeric', value: '42'});
});

test('only the complete, case-sensitive closing identifier ends a nowdoc', () => {
	const body = ['\tOTHER);', '\tGLSL_EXTRA', '\tGLSL123', '\tGLSLé', '\tglsl'];
	const lines = tokenize(["<?php\n$value = <<<'GLSL'", ...body, '\tGLSL;', 'echo $value;'].join('\n'));
	for(const [index, value] of body.entries())
	{
		expect(lines[index + 2].tokens).toEqual([{type: 'string', value}]);
	}
	expect(lines.at(-1).tokens).toContainEqual({type: 'variable', value: '$value'});
});

test('consecutive strings preserve PHP and HTML highlighting with CRLF lines', () => {
	const lines = tokenize(['<b>before</b>', '<?php', "$a = <<<'FIRST'", '  literal $value', '  FIRST;', '$b = <<<SECOND', '\tsecond', '\tSECOND;', 'echo $a, $b;', '?>', '<b>after</b>'].join('\r\n'));
	expect(lines[3].tokens).toEqual([{type: 'string', value: '  literal $value'}]);
	expect(lines[5].tokens).toContainEqual({type: 'variable', value: '$b'});
	expect(lines[8].tokens).toContainEqual({type: 'variable', value: '$a'});
	expect(lines[10].tokens.some(token => token.type === 'meta.tag.tag-name.xml')).toBe(true);
});

test('both shader nowdocs in the actual cube demo end before the PHP renderer code', () => {
	const source = readFileSync('public/scripts/sdl-cube.php', 'utf8');
	const rows = source.split('\n');
	const tokens = tokenize(source);
	const endings = rows.flatMap((line, index) => /^\s+GLSL\);$/.test(line) ? [index] : []);
	expect(endings).toHaveLength(2);
	for(const row of endings)
	{
		expect(tokens[row].tokens.some(token => token.type === 'markup.list')).toBe(true);
		expect(tokens[row + 1].tokens.some(token => token.type === 'variable')).toBe(true);
	}
	const program = rows.findIndex(line => line.includes('$this->program = glCreateProgram();'));
	expect(tokens[program].tokens).toContainEqual({type: 'variable', value: '$this'});
});
