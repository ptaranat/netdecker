import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// mtgdecks sits behind Cloudflare, which serves a challenge to any request whose
// Accept header advertises text/html. curl's default `Accept: */*` plus a browser
// User-Agent gets through; node/bun fetch does not, regardless of headers.
export async function fetchPage(url: string): Promise<string> {
	const { stdout } = await execAsync(
		`curl -s -L -H "User-Agent: ${USER_AGENT}" "${url}"`,
		{ maxBuffer: 10 * 1024 * 1024 },
	);

	if (!stdout || stdout.includes("Just a moment...")) {
		throw new Error(`failed to fetch ${url}`);
	}

	return stdout;
}
