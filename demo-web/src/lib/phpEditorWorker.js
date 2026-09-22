/** Patch Ace's worker lexer to recognize PHP 7.3+ heredoc and nowdoc endings. */
export const patchPhpEditorWorker = source => {
	const replacements = [
		[String.raw`'(?=;?[\\r\\n])'`, String.raw`'(?![a-zA-Z0-9_\\x7f-\\uffff])'`, 4]
		, ["new RegExp('^' + heredoc", String.raw`new RegExp('^[ \\t]*' + heredoc`, 2]
		, [String.raw`new RegExp('[\\r\\n]' + heredoc`, String.raw`new RegExp('[\\r\\n][ \\t]*' + heredoc`, 1]
		, [String.raw`new RegExp('([\\r\\n])' + heredoc`, String.raw`new RegExp('([\\r\\n])[ \\t]*' + heredoc`, 1]
		, ['return [src.substr(0, heredoc.length)];', 'return [src.match(re)[0]];', 2]
	];
	for(const [before, after, expected] of replacements)
	{
		const matches = source.split(before).length - 1;
		if(matches !== expected)
		{
			throw new Error(`Ace PHP worker changed: expected ${expected} matches for ${before}, found ${matches}. Review its heredoc patch.`);
		}
		source = source.replaceAll(before, after);
	}
	return source;
};
