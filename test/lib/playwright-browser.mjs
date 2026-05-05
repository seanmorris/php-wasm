import fs from 'node:fs';

const linuxCandidates = [
	'/usr/bin/chromium',
	'/usr/bin/chromium-browser',
	'/usr/bin/google-chrome',
	'/usr/bin/google-chrome-stable',
];

const macCandidates = [
	'/Applications/Chromium.app/Contents/MacOS/Chromium',
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

export const resolvePlaywrightExecutablePath = () => {
	const envCandidates = [
		process.env.PLAYWRIGHT_CHROMIUM_PATH,
		process.env.CHROMIUM_BIN,
		process.env.CHROME_BIN,
	];

	const platformCandidates = process.platform === 'darwin'
		? macCandidates
		: linuxCandidates;

	return [...envCandidates, ...platformCandidates]
		.find(candidate => candidate && fs.existsSync(candidate));
};

export const getPlaywrightLaunchOptions = () => {
	const executablePath = resolvePlaywrightExecutablePath();
	const headless = !Boolean(Number(process.env.TEST_VISIBLE ?? 0));

	return {
		headless,
		launchOptions: {
			...(executablePath ? { executablePath } : {})
			, args: [
				'--no-sandbox',
				...(headless ? ['--disable-gpu'] : [])
			]
		}
	};
};
