import * as cheerio from 'cheerio';
import type { Card, Decklist } from '$lib/types';
import { fetchPage } from './fetch';

const JUNK_NAMES = new Set(['$?', '? TIX', '']);

export async function fetchDecklist(deckUrl: string): Promise<Decklist> {
	const html = await fetchPage(deckUrl);
	return parseDecklist(html, deckUrl);
}

export function parseDecklist(html: string, deckUrl: string): Decklist {
	const $ = cheerio.load(html);

	const mainboard: Card[] = [];
	const sideboard: Card[] = [];

	// The decklist is inside a tab panel. Card tables have th headers like
	// "Creature [4]", "Instant [20]", "Sideboard [15]", etc.
	// We only want tables whose headers match this pattern.
	const tables = $('table');
	let inSideboard = false;

	for (const table of tables) {
		const $table = $(table);
		const header = $table.find('th').first().text().trim();

		// Only process tables that look like card type headers
		if (!/\[\d+\]/.test(header) && !header.includes('Sideboard')) continue;

		if (header.includes('Sideboard')) {
			inSideboard = true;
		}

		const target = inSideboard ? sideboard : mainboard;

		$table.find('tr').each((_, tr) => {
			const $tr = $(tr);
			if ($tr.find('th').length > 0) return;

			const cell = $tr.find('td').first();
			const cardLink = cell.find('a');
			if (cardLink.length === 0) return;

			const cardName = cardLink.text().trim();
			if (JUNK_NAMES.has(cardName)) return;

			const cellText = cell.text().trim();
			const quantityMatch = cellText.match(/^(\d+)/);
			const quantity = quantityMatch ? parseInt(quantityMatch[1]) : 1;

			target.push({ name: cardName, quantity });
		});
	}

	// Parse metadata
	let player = '';
	let placement = '';
	let archetype = '';
	let event = '';
	let platform = 'Paper';
	let date = '';

	// Archetype from breadcrumb (e.g. "Izzet Lessons" link in breadcrumb)
	const breadcrumbLinks = $('a[href*="/Standard/"]');
	breadcrumbLinks.each((_, el) => {
		const href = $(el).attr('href') ?? '';
		const text = $(el).text().trim();
		// Archetype links don't contain "decklist", "tournament", "page:", etc.
		if (text && !href.includes('decklist') && !href.includes('tournament') && !href.includes('page:') && href !== '/Standard/' && href !== '/Standard') {
			archetype = text;
		}
	});

	const metaSection = $('strong');

	metaSection.each((_, el) => {
		const text = $(el).text().trim();
		if (text.startsWith('Builder:')) {
			player = text.replace('Builder:', '').trim();
		}
	});

	// Placement: strong tag matching "Top8", "1st", or "W/L" record
	const placementEl = metaSection.filter((_, el) => {
		const text = $(el).text().trim();
		return /^(Top\d+|1st|2nd|3rd|\d+th|W\/L)/.test(text);
	});
	if (placementEl.length > 0) {
		placement = placementEl.first().text().trim();
		// Add space before parenthesis: "1st(10 - 1)" → "1st (10 - 1)"
		placement = placement.replace(/(\w)\(/, '$1 (');
	}

	// Event name: link pointing to a tournament page
	const eventLink = $('a[href*="tournament-"]');
	if (eventLink.length > 0) {
		event = eventLink.first().text().trim();
	}

	// Platform detection from the deck info area
	const platformImg = $('img[alt*="MTGO"], img[alt*="Magic Online"]');
	if (platformImg.length > 0) platform = 'MTGO';
	const arenaImg = $('img[alt*="MTGA"], img[alt*="Magic Arena"]');
	if (arenaImg.length > 0) platform = 'MTGA';

	// Date
	const dateMatch = html.match(/(\d{1,2}-[A-Za-z]{3}-\d{4})/);
	if (dateMatch) {
		date = dateMatch[1];
	}

	return {
		mainboard,
		sideboard,
		player,
		placement,
		archetype,
		event,
		platform,
		date,
		url: deckUrl
	};
}
