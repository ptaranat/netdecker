import * as cheerio from 'cheerio';
import type { Archetype } from '$lib/types';
import { fetchPage } from './fetch';

const METAGAME_URL =
	'https://mtgdecks.net/Standard/metagame:recent-major-events-last-30-days';

export async function fetchTopArchetypes(count = 5): Promise<Archetype[]> {
	const html = await fetchPage(METAGAME_URL);
	return parseMetagame(html, count);
}

export function parseMetagame(html: string, count = 5): Archetype[] {
	const $ = cheerio.load(html);
	const archetypes: Archetype[] = [];

	const rows = $('table tbody tr');

	for (const row of rows) {
		if (archetypes.length >= count) break;

		const $row = $(row);
		const nameLink = $row.find('td:nth-child(2) strong a');
		const name = nameLink.text().trim();

		if (!name || name === 'Rogue') continue;

		const href = nameLink.attr('href') ?? '';
		const slug = href.split('/').pop() ?? '';
		const metaShareText = $row.find('td:nth-child(3)').text().trim();
		const metaShare = parseFloat(metaShareText) || 0;

		const trendText = $row.find('td:nth-child(4)').text().trim();
		const trend = parseFloat(trendText) || 0;

		const tier = $row.find('td:nth-child(5)').text().trim();
		const deckCountText = $row.find('td:nth-child(6)').text().trim();
		const deckCount = parseInt(deckCountText) || 0;

		archetypes.push({
			name,
			slug,
			url: href.startsWith('http') ? href : `https://mtgdecks.net${href}`,
			metaShare,
			trend,
			tier,
			deckCount
		});
	}

	return archetypes;
}
