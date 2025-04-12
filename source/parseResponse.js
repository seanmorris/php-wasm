export const parseResponse = response => {
	const headers = new Headers()
	const line = [];
	const decoder = new TextDecoder();

	let i = 0;

	for(; i < response.length; i++)
	{
		if(response[i] === 0xD && response[i+1] === 0xA) // We're at a CRLF
		{
			if(line.length)
			{
				const header = decoder.decode(new Uint8Array(line).buffer);
				const colon = header.indexOf(':');

				if(colon < 0)
				{
					headers.append(header, true);
				}
				else
				{
					headers.append(header.substring(0, colon), header.substring(colon + 2));
				}

				line.length = 0;
				i++;
				continue;
			}
			else
			{
				i++;
				break;
			}
		}

		line.push(response[i]);
	}

	return {headers, body: new Uint8Array(response.slice(1+i)).buffer };
};
