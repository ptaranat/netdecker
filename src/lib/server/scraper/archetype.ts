import * as cheerio from 'cheerio';
import { fetchPage } from './fetch';

const BASE_URL = 'https://mtgdecks.net';

export async function fetchBestDeckUrl(archetypeUrl: string): Promise<string | null> {
	const html = await fetchPage(archetypeUrl);
	return parseBestDeckUrl(html);
}

export function parseBestDeckUrl(html: string): string | null {
	const $ = cheerio.load(html);
	const rows = $('table tbody tr');

	// First pass: look for a paper event deck (skip MTGO and MTGA)
	for (const row of rows) {
		const $row = $(row);
		const platformImg = $row.find('img[alt*="MTGO"], img[alt*="MTGA"], img[alt*="Magic Online"], img[alt*="Magic Arena"]');

		if (platformImg.length > 0) continue;

		const deckLink = $row.find('td:nth-child(2) a[href*="decklist"]');
		if (deckLink.length > 0) {
			const href = deckLink.attr('href') ?? '';
			return href.startsWith('http') ? href : `${BASE_URL}${href}`;
		}
	}

	// Fallback: take the first deck regardless of platform
	const firstDeckLink = rows.first().find('td:nth-child(2) a[href*="decklist"]');
	if (firstDeckLink.length > 0) {
		const href = firstDeckLink.attr('href') ?? '';
		return href.startsWith('http') ? href : `${BASE_URL}${href}`;
	}

	return null;
}
