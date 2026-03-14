import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { dev } from '$app/environment';

const execAsync = promisify(exec);

const CURL_HEADERS = [
	'-H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"',
	'-H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"',
	'-H "Accept-Language: en-US,en;q=0.5"'
].join(' ');

export async function fetchPage(url: string): Promise<string> {
	let body: string;

	if (dev) {
		// macOS curl uses SecureTransport which gets flagged by Cloudflare's
		// TLS fingerprinting. got-scraping impersonates a real browser.
		const { gotScraping } = await import('got-scraping');
		const response = await gotScraping({
			url,
			headerGeneratorOptions: {
				browsers: ['chrome'],
				operatingSystems: ['windows']
			}
		});
		body = response.body;
	} else {
		const { stdout } = await execAsync(`curl -s -L ${CURL_HEADERS} "${url}"`, {
			maxBuffer: 10 * 1024 * 1024
		});
		body = stdout;
	}

	if (!body || body.includes('Just a moment...')) {
		throw new Error(`failed to fetch ${url}`);
	}

	return body;
}
