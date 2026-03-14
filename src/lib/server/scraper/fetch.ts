import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export async function fetchPage(url: string): Promise<string> {
	const { stdout, stderr } = await execAsync(
		`curl -s -L -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" -H "Accept-Language: en-US,en;q=0.5" "${url}"`,
		{ maxBuffer: 10 * 1024 * 1024 }
	);

	if (!stdout || stdout.includes('Just a moment...')) {
		throw new Error(`Failed to fetch ${url}: Cloudflare challenge or empty response`);
	}

	return stdout;
}
