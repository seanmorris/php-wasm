/**
 * Start an independent Make query without inheriting an outer Make invocation.
 * Configuration variables remain available at their normal environment priority.
 * Explicit blanks also prevent Deno 2.5.6 from restoring omitted parent keys.
 */
const independentMakeEnvironment = (environment = process.env) => ({
	...environment,
	MAKEFLAGS: '',
	MFLAGS: '',
	MAKEOVERRIDES: '',
	MAKELEVEL: '',
	GNUMAKEFLAGS: '',
});

module.exports = { independentMakeEnvironment };
