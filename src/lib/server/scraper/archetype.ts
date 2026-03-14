import * as cheerio from 'cheerio';
import { fetchPage } from './fetch';

const BASE_URL = 'https://mtgdecks.net';

export async function fetchBestDeckUrl(archetypeUrl: string): Promise<string | null> {
	// Sort by event relevance — biggest tournaments first
	const url = `${archetypeUrl}/sort:Event.relevance/direction:desc`;
	const html = await fetchPage(url);
	return parseBestDeckUrl(html);
}

export function parseBestDeckUrl(html: string): string | null {
	const $ = cheerio.load(html);
	const rows = $('table tbody tr');

	// First pass: skip W/L (no notable finish) and low-quality Japanese store events
	for (const row of rows) {
		const $row = $(row);
		const rowText = $row.text();

		if (/W\/L/.test(rowText) && !/Top\d+|1st|2nd|3rd|\d+th/.test(rowText)) continue;
		if (/HARERUYA|Kichijoji|Japan\)/i.test(rowText)) continue;

		const deckLink = $row.find('td:nth-child(2) a[href*="decklist"]');
		if (deckLink.length > 0) {
			const href = deckLink.attr('href') ?? '';
			return href.startsWith('http') ? href : `${BASE_URL}${href}`;
		}
	}

	// Fallback: take the first deck regardless
	for (const row of rows) {
		const $row = $(row);
		const deckLink = $row.find('td:nth-child(2) a[href*="decklist"]');
		if (deckLink.length > 0) {
			const href = deckLink.attr('href') ?? '';
			return href.startsWith('http') ? href : `${BASE_URL}${href}`;
		}
	}

	return null;
}
