import { MANAPOOL_EMAIL, MANAPOOL_ACCESS_TOKEN } from '$env/static/private';

const BASE_URL = 'https://manapool.com/api/v1';

export async function manapoolFetch(path: string, options: RequestInit = {}): Promise<Response> {
	const url = `${BASE_URL}${path}`;
	const headers = new Headers(options.headers);
	headers.set('email', MANAPOOL_EMAIL);
	headers.set('access-token', MANAPOOL_ACCESS_TOKEN);
	headers.set('Content-Type', 'application/json');

	return fetch(url, {
		...options,
		headers
	});
}
