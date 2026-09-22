import ace from 'ace-builds';
import 'ace-builds/src-noconflict/mode-php';

const {Mode} = ace.require('ace/mode/php');
const {PhpHighlightRules} = ace.require('ace/mode/php_highlight_rules');

/** Recognize PHP 7.3+ indented heredoc/nowdoc endings and expression continuations. */
class PhpEditorHighlightRules extends PhpHighlightRules
{
	constructor()
	{
		super();
		const ending = this.getRules()['php-heredoc'].find(rule => rule.nextState === 'php-start');
		const onMatch = ending.onMatch;
		ending.regex = /^[\t ]*[a-zA-Z_\x7f-\uffff][a-zA-Z0-9_\x7f-\uffff]*/;
		ending.onMatch = function(value, state, stack) {
			// Keep Ace's exact delimiter comparison and state-stack restoration.
			return onMatch.call(this, value.trimStart(), state, stack);
		};
	}
}

/** Create an independent PHP editor mode while retaining Ace's HTML, folding and completion support. */
export const createPhpEditorMode = () => {
	const mode = new Mode();
	mode.HighlightRules = PhpEditorHighlightRules;
	return mode;
};
