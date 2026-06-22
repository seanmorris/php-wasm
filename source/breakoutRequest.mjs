export const breakoutRequest = request => {
	let getPost = Promise.resolve('');

	if(request.body)
	{
		getPost = new Promise(accept => {
			const reader   = request.body.getReader();
			const postBody = [];

			const processBody = ({done, value}) => {
				if(value)
				{
					postBody.push([...value].map(x => String.fromCharCode(x)).join(''));
				}

				if(!done)
				{
					return reader.read().then(processBody);
				}

				accept(postBody.join(''));
			};

			return reader.read().then(processBody);
		});
	}
	else if(request.arrayBuffer)
	{
		getPost = request.arrayBuffer().then(
			buffer => [...new Uint8Array(buffer)].map(x => String.fromCharCode(x)).join('')
		);
	}
	else if(request.on)
	{
		getPost = new Promise(accept => {
			let body = [];
			request.on('data', chunk => body.push(chunk));
			request.on('end', () => accept(
				[...new Uint8Array(Buffer.concat(body))].map(x => String.fromCharCode(x)).join(''))
			);
		});
	}

	const url = new URL(request.url);

	return getPost.then(post => ({
		url
		, method: request.method
		, get: url.search ? url.search.substr(1) : ''
		, post: request.method === 'POST' ? post : null
		, contentType: request.method === 'POST'
			? (request.headers && (request.headers.get('Content-Type')) || 'application/x-www-form-urlencoded')
			: null
	}));
};
