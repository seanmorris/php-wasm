import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { ensureServiceWorker } from './serviceWorker';

const params = new URLSearchParams(window.location.search);

if(!params.has('no-service-worker'))
{
	(async () => {
		const serviceWorker = await ensureServiceWorker();

		if(!serviceWorker.controlled)
		{
			console.log('No Service Worker Detected, Reloading...');
			await new Promise(a => setTimeout(a, 500));
			window.location.reload();
			return;
		}
	})();
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode>
	<App />
</React.StrictMode>
);
