import type { ArchetypeWithDeck } from '$lib/types';
import { getCached, setCache, getStale } from './cache';
import { fetchTopArchetypes } from './scraper/metagame';
import { fetchBestDeckUrl } from './scraper/archetype';
import { fetchDecklist } from './scraper/decklist';
import { optimizeDecklist } from './manapool/optimizer';

const CACHE_KEY = 'metagame-data';

export async function getMetagameData(): Promise<ArchetypeWithDeck[]> {
	const cached = getCached<ArchetypeWithDeck[]>(CACHE_KEY);
	if (cached) return cached;

	try {
		const data = await buildMetagameData();
		setCache(CACHE_KEY, data);
		return data;
	} catch (err) {
		console.error('Pipeline failed:', err);
		const stale = getStale<ArchetypeWithDeck[]>(CACHE_KEY);
		if (stale) return stale;
		throw err;
	}
}

async function processArchetype(
	archetype: Awaited<ReturnType<typeof fetchTopArchetypes>>[number]
): Promise<ArchetypeWithDeck | null> {
	try {
		const deckUrl = await fetchBestDeckUrl(archetype.url);
		if (!deckUrl) {
			console.warn(`No deck found for ${archetype.name}`);
			return null;
		}

		const decklist = await fetchDecklist(deckUrl);
		const allCards = [...decklist.mainboard, ...decklist.sideboard];
		const optimizer = await optimizeDecklist(allCards);

		return { ...archetype, decklist, optimizer };
	} catch (err) {
		console.error(`Failed to process ${archetype.name}:`, err);
		return null;
	}
}

async function buildMetagameData(): Promise<ArchetypeWithDeck[]> {
	const archetypes = await fetchTopArchetypes(5);

	const results = await Promise.all(archetypes.map(processArchetype));

	return results.filter((r): r is ArchetypeWithDeck => r !== null);
}
