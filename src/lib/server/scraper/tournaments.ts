import * as cheerio from 'cheerio';
import { fetchPage } from './fetch';

const BASE_URL = 'https://mtgdecks.net';
const TOURNAMENTS_URL = `${BASE_URL}/Standard/tournaments`;
const MAX_PAGES = 5;

export interface Tournament {
	name: string;
	url: string;
	date: string;
	players: number;
	stars: number;
	isBigStar: boolean;
}

/**
 * Find the most recent major paper tournaments (big star events).
 * Paginates through the tournament list until we find enough.
 */
export async function fetchMajorTournaments(count = 3): Promise<Tournament[]> {
	const results: Tournament[] = [];

	for (let page = 1; page <= MAX_PAGES && results.length < count; page++) {
		const url = `${TOURNAMENTS_URL}/page:${page}`;
		const html = await fetchPage(url);
		const tournaments = parseTournaments(html);

		for (const t of tournaments) {
			if (results.length >= count) break;
			if (t.isBigStar) {
				results.push(t);
			}
		}
	}

	return results;
}

export function parseTournaments(html: string): Tournament[] {
	const $ = cheerio.load(html);
	const rows = $('table tbody tr');
	const tournaments: Tournament[] = [];

	for (const row of rows) {
		const $row = $(row);
		const cells = $row.find('td');
		if (cells.length < 5) continue;

		// Skip MTGO and MTGA events
		const platformImg = $row.find('img[alt*="MTGO"], img[alt*="MTGA"]');
		if (platformImg.length > 0) continue;

		const eventLink = $row.find('a[href*="tournament-"]');
		if (eventLink.length === 0) continue;

		const name = eventLink.text().trim();
		const href = eventLink.attr('href') ?? '';
		const url = href.startsWith('http') ? href : `${BASE_URL}${href}`;

		const dateText = cells.eq(0).text().trim();
		const playersText = cells.eq(3).text().trim();
		const players = parseInt(playersText) || 0;

		// Check event level: big star = font-size 16px in the level cell
		const levelCell = cells.eq(4).html() ?? '';
		const fontSizeMatch = levelCell.match(/font-size:\s*(\d+)px/);
		const fontSize = fontSizeMatch ? parseInt(fontSizeMatch[1]) : 8;
		const isBigStar = fontSize >= 16;
		const stars = (levelCell.match(/glyphicon-star/g) ?? []).length;

		tournaments.push({ name, url, date: dateText, players, stars, isBigStar });
	}

	return tournaments;
}

/**
 * Fetch the 1st and 2nd place decklist URLs from a tournament page.
 */
export async function fetchTopDeckUrls(
	tournamentUrl: string,
	count = 2
): Promise<string[]> {
	const html = await fetchPage(tournamentUrl);
	return parseTopDeckUrls(html, count);
}

export function parseTopDeckUrls(html: string, count = 2): string[] {
	const $ = cheerio.load(html);
	const links: string[] = [];

	$('a[href*="decklist"]').each((_, el) => {
		if (links.length >= count) return;
		const href = $(el).attr('href') ?? '';
		if (href.includes('decklist-by') || href.includes('decklist')) {
			const url = href.startsWith('http') ? href : `${BASE_URL}${href}`;
			links.push(url);
		}
	});

	return links;
}
