import { PhpWeb } from './PhpWeb.mjs';

const runPhpScriptTag = async (element) => {

	const scope = {
		stdin: null,
		canvas: null,
		stdout: null,
		stderr: null,
		ini: '',
		libs: [],
		files: [],
		imports: {}
	};

	if(element.hasAttribute('data-ini'))
	{
		scope.ini = element.getAttribute('data-ini');
	}

	if(element.hasAttribute('data-stdin'))
	{
		scope.stdin = document.querySelector(element.getAttribute('data-stdin'));
	}

	if(element.hasAttribute('data-stdout'))
	{
		scope.stdout = document.querySelector(element.getAttribute('data-stdout'));
	}

	if(element.hasAttribute('data-stderr'))
	{
		scope.stderr = document.querySelector(element.getAttribute('data-stderr'));
	}

	if(element.hasAttribute('data-libs'))
	{
		try
		{
			scope.libs = JSON.parse(element.getAttribute('data-libs'));
		}
		catch(error)
		{
			console.error(error);
		}
	}

	if(element.hasAttribute('data-files'))
	{
		try
		{
			scope.files = JSON.parse(element.getAttribute('data-files'));
		}
		catch(error)
		{
			console.error(error);
		}
	}

	if(element.hasAttribute('data-imports'))
	{
		try
		{
			scope.imports = JSON.parse(element.getAttribute('data-imports'));
		}
		catch(error)
		{
			console.error(error);
		}
	}

	if(element.hasAttribute('data-canvas'))
	{
		scope.canvas = document.querySelector(element.getAttribute('data-canvas'));
	}

	let stdout = '';
	let stderr = '';
	let ran = false;

	let getCode = Promise.resolve(element.innerText);

	if(element.hasAttribute('src'))
	{
		getCode = fetch(element.getAttribute('src')).then(response => response.text());
	}

	let getInput = Promise.resolve('');

	if(scope.stdin)
	{
		getInput = Promise.resolve(scope.stdin.innerText);

		if(scope.stdin.hasAttribute('src'))
		{
			getInput = fetch(scope.stdin.getAttribute('src')).then(response => response.text());
		}
	}

	let getImports = Promise.resolve();

	if(scope.imports)
	{
		getImports = Promise.all(Object.entries(scope.imports).map(async ([url, names]) => {
			const pkg = await import(url);
			if(typeof names === 'string')
			{
				return {[names]: pkg};
			}
			else if(Array.isArray(names))
			{
				return names.map(name => ({[name]: pkg[name]}));
			}
		}));
	}

	const [code, input, imports] = await Promise.all([getCode, getInput, getImports]);

	const flatImports = Object.assign({}, ...(imports.flat()));

	const php = new PhpWeb({
		...flatImports,
		sharedLibs: scope.libs,
		ini: scope.ini,
		files: scope.files,
		canvas: scope.canvas,
	});

	// Option 1:

	// Allow binding php into window via attribute data-bind-php-window='true'
	// if(element.getAttribute('data-bind-php-window') === 'true'){
	// 	window.php = php;
	// }

	// Option 2:

	// Improved by allowing specific window binding name to avoid naming collisions
	if(element.getAttribute('data-php-bind-window-as')){
		window[element.getAttribute('data-php-bind-window-as')] = php;
	}

	php.inputString(input);

	const outListener = event => {

		stdout += event.detail;

		if(ran && scope.stdout)
		{
			scope.stdout.innerHTML = stdout;
		}
	};

	const errListener = event => {

		stderr += event.detail;

		if(ran && scope.stderr)
		{
			scope.stderr.innerHTML = stderr;
		}
	};

	php.addEventListener('output', outListener);
	php.addEventListener('error',  errListener);
	php.addEventListener('ready', () => {
		php.run(code)
		.then(exitCode => exitCode && console.warn('WARNING! PHP exited with code: ' + exitCode))
		.catch(error => console.error(error))
		.finally(() => {
			ran = true;
			php.flush();
			scope.stdout && (scope.stdout.innerHTML = stdout);
			scope.stderr && (scope.stderr.innerHTML = stderr);
		});
	});
}

const phpSelector = 'script[type="text/php"]';

const runPhpTags = (doc) => {

	const phpNodes = doc.querySelectorAll(phpSelector);

	for(const phpNode of phpNodes)
	{
		runPhpScriptTag(phpNode);
	}

	const observer = new MutationObserver((mutations, observer) => {
		for(const mutation of mutations)
		{
			for(const addedNode of mutation.addedNodes)
			{
				if(!addedNode.matches || !addedNode.matches(phpSelector))
				{
					continue;
				}

				runPhpScriptTag(addedNode);
			}
		}
	});

	observer.observe(document.body.parentElement, {childList: true, subtree: true});
}

runPhpTags(document);