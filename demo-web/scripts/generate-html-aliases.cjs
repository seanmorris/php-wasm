/**
 * Post-build helper that fans the generated HTML entrypoint out to legacy aliases.
 */
const fs = require('node:fs/promises');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const buildDir = path.join(rootDir, 'build');
const indexHtml = path.join(buildDir, 'index.html');
const nestedIndexHtml = path.join(buildDir, 'src', 'index.html');
const asciiArt = path.join(rootDir, 'aphex.txt');

const aliases = [
	'home.html'
	, 'embedded-php.html'
	, 'dbg-preview.html'
	, 'cli-preview.html'
	, 'install-demo.html'
	, 'select-framework.html'
	, 'code-editor.html'
	, 'vscode.html'
];

/**
 * Copies the generated entry HTML to every legacy route expected by the demo.
 */
async function main() {
	let sourceIndexHtml = indexHtml;

	try
	{
		await fs.access(sourceIndexHtml);
	}
	catch
	{
		sourceIndexHtml = nestedIndexHtml;
	}

	const [html, art] = await Promise.all([
		fs.readFile(sourceIndexHtml, 'utf8')
		, fs.readFile(asciiArt, 'utf8')
	]);

	const htmlWithAscii = html.endsWith('\n')
		? `${html}${art}`
		: `${html}\n${art}`;

	await fs.writeFile(indexHtml, htmlWithAscii);

	if(sourceIndexHtml === nestedIndexHtml)
	{
		await fs.rm(path.join(buildDir, 'src'), {recursive: true, force: true});
	}

	await Promise.all(aliases.map(alias => (
		fs.writeFile(path.join(buildDir, alias), htmlWithAscii)
	)));

	await fs.writeFile(path.join(buildDir, '404.html'), htmlWithAscii);
}

main().catch(error => {
	console.error(error);
	process.exit(1);
});
