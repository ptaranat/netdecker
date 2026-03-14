import type { ArchetypeWithDeck, OptimizerResult } from '$lib/types';
import { getCached, setCache, getStale } from './cache';
import { fetchTopArchetypes } from './scraper/metagame';
import { fetchBestDeckUrl } from './scraper/archetype';
import { fetchDecklist } from './scraper/decklist';
import { resolveCardNames } from './scraper/cardnames';
import { optimizeDecklist } from './manapool/optimizer';

const CACHE_KEY = 'metagame-data';

function timer() {
	const start = performance.now();
	return () => `${(performance.now() - start).toFixed(0)}ms`;
}

export interface PipelineCallbacks {
	onDecks: (archetypes: ArchetypeWithDeck[]) => void;
	onPrice: (index: number, optimizer: OptimizerResult) => void;
	onDone: (archetypes: ArchetypeWithDeck[]) => void;
}

export async function getMetagameDataStreaming(cb: PipelineCallbacks): Promise<void> {
	const cached = getCached<ArchetypeWithDeck[]>(CACHE_KEY);
	if (cached) {
		console.log('[pipeline] cache hit');
		cb.onDecks(cached);
		cb.onDone(cached);
		return;
	}

	const total = timer();

	try {
		// Phase 1: scrape all decklists
		let t = timer();
		const archetypes = await fetchTopArchetypes(5);
		console.log(`[pipeline] metagame page: ${t()}`);

		const decks: ArchetypeWithDeck[] = [];

		for (const archetype of archetypes) {
			t = timer();
			try {
				const deckUrl = await fetchBestDeckUrl(archetype.url);
				if (!deckUrl) {
					console.warn(`[${archetype.name}] no deck found`);
					continue;
				}
				const decklist = await fetchDecklist(deckUrl);
				console.log(`[${archetype.name}] scrape: ${t()}`);
				decks.push({ ...archetype, decklist, optimizer: null });
			} catch (err) {
				console.error(`[${archetype.name}] scrape failed:`, err);
			}
		}

		// Send decklists immediately
		cb.onDecks(decks);

		// Phase 2: optimize prices in parallel
		const pricePromises = decks.map(async (deck, i) => {
			const name = deck.name;
			const pt = timer();
			try {
				const allCards = [...deck.decklist.mainboard, ...deck.decklist.sideboard];
				const resolvedCards = await resolveCardNames(allCards);
				const optimizer = await optimizeDecklist(resolvedCards);
				console.log(`[${name}] optimizer: ${pt()}`);
				if (optimizer) {
					decks[i].optimizer = optimizer;
					cb.onPrice(i, optimizer);
				}
			} catch (err) {
				console.error(`[${name}] optimizer failed:`, err);
			}
		});

		await Promise.all(pricePromises);

		setCache(CACHE_KEY, decks);
		console.log(`[pipeline] total: ${total()}`);
		cb.onDone(decks);
	} catch (err) {
		console.error('Pipeline failed:', err);
		const stale = getStale<ArchetypeWithDeck[]>(CACHE_KEY);
		if (stale) {
			cb.onDecks(stale);
			cb.onDone(stale);
		} else {
			throw err;
		}
	}
}
