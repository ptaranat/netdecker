import type { ArchetypeWithDeck } from '$lib/types';
import { getCached, setCache, getStale } from './cache';
import { fetchTopArchetypes } from './scraper/metagame';
import { fetchBestDeckUrl } from './scraper/archetype';
import { fetchDecklist } from './scraper/decklist';
import { resolveCardNames } from './scraper/cardnames';
import { optimizeDecklist } from './manapool/optimizer';

const CACHE_KEY = 'metagame-data';

export type ProgressCallback = (pct: number, msg: string) => void;

function timer() {
	const start = performance.now();
	return () => `${(performance.now() - start).toFixed(0)}ms`;
}

export async function getMetagameData(
	onProgress?: ProgressCallback
): Promise<ArchetypeWithDeck[]> {
	const cached = getCached<ArchetypeWithDeck[]>(CACHE_KEY);
	if (cached) {
		console.log('[pipeline] cache hit');
		onProgress?.(100, 'cached');
		return cached;
	}

	const t = timer();
	try {
		const data = await buildMetagameData(onProgress);
		setCache(CACHE_KEY, data);
		console.log(`[pipeline] total: ${t()}`);
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
	const name = archetype.name;
	const total = timer();
	try {
		onProgress?.(basePct ?? 0, `fetching ${name}`);

		let t = timer();
		const deckUrl = await fetchBestDeckUrl(archetype.url);
		console.log(`[${name}] archetype page: ${t()}`);
		if (!deckUrl) {
			console.warn(`[${name}] no deck found`);
			return null;
		}

		t = timer();
		const decklist = await fetchDecklist(deckUrl);
		console.log(`[${name}] decklist page: ${t()}`);

		const allCards = [...decklist.mainboard, ...decklist.sideboard];

		t = timer();
		const resolvedCards = await resolveCardNames(allCards);
		console.log(`[${name}] card names: ${t()}`);

		t = timer();
		const optimizer = await optimizeDecklist(resolvedCards);
		console.log(`[${name}] optimizer: ${t()}`);

		console.log(`[${name}] total: ${total()}`);
		return { ...archetype, decklist, optimizer };
	} catch (err) {
		console.error(`[${name}] failed:`, err);
		return null;
	}
}

async function buildMetagameData(
	onProgress?: ProgressCallback
): Promise<ArchetypeWithDeck[]> {
	let t = timer();
	onProgress?.(5, 'fetching metagame');
	const archetypes = await fetchTopArchetypes(5);
	console.log(`[pipeline] metagame page: ${t()}`);
	onProgress?.(15, 'processing archetypes');

	const results: ArchetypeWithDeck[] = [];
	for (let i = 0; i < archetypes.length; i++) {
		const pct = 15 + Math.round((i / archetypes.length) * 80);
		const result = await processArchetype(archetypes[i], onProgress, pct);
		if (result) results.push(result);
	}

	onProgress?.(100, 'done');
	return results;
}
