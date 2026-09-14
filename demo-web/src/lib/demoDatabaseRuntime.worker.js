import { requestWebLock } from '../../../source/webTransactions.mjs';
import { basePath } from './runtimePaths.worker.js';

// Outermost lock: demo database -> PHP request -> filesystem. Never acquire
// this lock from inside one of the latter two locks. It covers hydration and
// persistence as well as SQL, including PDO connections opened by frameworks.
export const withDemoDatabaseLock = callback => requestWebLock('php-wasm-demo-database', callback);

const filesystemActions = new Set([
	'analyzePath', 'readdir', 'readFile', 'stat', 'mkdir', 'rmdir', 'writeFile'
	, 'rename', 'unlink', 'putEnv', 'refresh', 'getSettings', 'setSettings'
	, 'getEnvs', 'setEnvs', 'storeInit'
]);

/** Adds demo-local coordination without changing the public CGI runtime API. */
export const coordinateDemoDatabase = Base => class extends Base {
	request(request) {
		return withDemoDatabaseLock(() => super.request(request));
	}

	_handleMessageEvent(event) {
		if(filesystemActions.has(event.data?.action))
		{
			return withDemoDatabaseLock(() => super._handleMessageEvent(event));
		}

		return super._handleMessageEvent(event);
	}

	queryWorkbenchSqlite(payload) {
		return withDemoDatabaseLock(async () => {
			// This host is only present for this internal request, while the outer
			// lock excludes framework requests and settings changes. The worker's
			// fetch filter also excludes dot-prefixed CGI paths.
			const pathPrefix = basePath('cgi-bin/.query-workbench/');
			const hosts = this.vHosts;
			this.vHosts = [{pathPrefix, directory: '/preload/query-workbench'}, ...hosts];

			try
			{
				// CGI's input bridge consumes character bytes. JSON-escape Unicode
				// so SQL and edited text survive that bridge without truncation.
				const body = JSON.stringify(payload).replace(/[\u007f-\uffff]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
				const response = await super.request(new Request(
					new URL(`${pathPrefix}query-workbench.php`, globalThis.location.href),
					{method: 'POST', headers: {'Content-Type': 'application/json'}, body}
				));

				if(!(response instanceof Response)) throw new Error('SQLite helper did not return a response.');

				let result;
				try
				{
					result = await response.json();
				}
				catch
				{
					throw new Error('SQLite helper failed. Check the PHP runtime output; do not retry a write automatically.');
				}

				if(!response.ok || result?.error)
				{
					throw Object.assign(new Error(result.error?.message || 'SQLite query failed.'), {code: result.error?.code});
				}

				return result;
			}
			finally
			{
				this.vHosts = hosts;
			}
		});
	}
};
