import type { ArchetypeWithDeck } from '$lib/types';
import { getCached, setCache, getStale } from './cache';
import { fetchTopArchetypes } from './scraper/metagame';
import { fetchBestDeckUrl } from './scraper/archetype';
import { fetchDecklist } from './scraper/decklist';
import { optimizeDecklist } from './manapool/optimizer';

const CACHE_KEY = 'metagame-data';

export type ProgressCallback = (pct: number, msg: string) => void;

export async function getMetagameData(
	onProgress?: ProgressCallback
): Promise<ArchetypeWithDeck[]> {
	const cached = getCached<ArchetypeWithDeck[]>(CACHE_KEY);
	if (cached) {
		onProgress?.(100, 'cached');
		return cached;
	}

	try {
		const data = await buildMetagameData(onProgress);
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
	archetype: Awaited<ReturnType<typeof fetchTopArchetypes>>[number],
	onProgress?: ProgressCallback,
	basePct?: number
): Promise<ArchetypeWithDeck | null> {
	try {
		onProgress?.(basePct ?? 0, `fetching ${archetype.name}`);
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

async function buildMetagameData(
	onProgress?: ProgressCallback
): Promise<ArchetypeWithDeck[]> {
	onProgress?.(5, 'fetching metagame');
	const archetypes = await fetchTopArchetypes(5);
	onProgress?.(15, 'processing archetypes');

	// Process sequentially so we can report per-archetype progress
	const results: ArchetypeWithDeck[] = [];
	for (let i = 0; i < archetypes.length; i++) {
		const pct = 15 + Math.round((i / archetypes.length) * 80);
		const result = await processArchetype(archetypes[i], onProgress, pct);
		if (result) results.push(result);
	}

	onProgress?.(100, 'done');
	return results;
}
