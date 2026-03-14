import type { TournamentWithDecks, DeckEntry } from '$lib/types';
import { getCached, setCache, getStale } from './cache';
import { fetchMajorTournaments, fetchTopDeckUrls } from './scraper/tournaments';
import { fetchDecklist } from './scraper/decklist';
import { resolveCardNames } from './scraper/cardnames';
import { optimizeDecklist } from './manapool/optimizer';

const CACHE_KEY = 'tournament-data';

// Prevent concurrent pipeline runs
let activeBuild: Promise<void> | null = null;
const pendingCallbacks: PipelineCallbacks[] = [];

function timer() {
	const start = performance.now();
	return () => `${(performance.now() - start).toFixed(0)}ms`;
}

export interface PipelineCallbacks {
	onDecks: (tournaments: TournamentWithDecks[]) => void;
	onPrice: (tournamentIdx: number, deckIdx: number, optimizer: DeckEntry['optimizer']) => void;
	onDone: (tournaments: TournamentWithDecks[]) => void;
}

export async function getMetagameDataStreaming(cb: PipelineCallbacks): Promise<void> {
	const cached = getCached<TournamentWithDecks[]>(CACHE_KEY);
	if (cached) {
		console.log('[pipeline] cache hit');
		cb.onDecks(cached);
		cb.onDone(cached);
		return;
	}

	// If a build is already running, piggyback on it
	if (activeBuild) {
		console.log('[pipeline] build in progress, waiting...');
		pendingCallbacks.push(cb);
		await activeBuild;
		return;
	}

	activeBuild = runPipeline(cb);
	try {
		await activeBuild;
	} finally {
		activeBuild = null;
	}
}

async function runPipeline(cb: PipelineCallbacks): Promise<void> {
	const allCallbacks = [cb];
	const total = timer();

	function broadcast(fn: (cb: PipelineCallbacks) => void) {
		for (const c of allCallbacks) fn(c);
		for (const c of pendingCallbacks) fn(c);
	}

	try {
		// Phase 1: find major tournaments
		let t = timer();
		const tournaments = await fetchMajorTournaments(3);
		console.log(`[pipeline] found ${tournaments.length} major tournaments: ${t()}`);

		const results: TournamentWithDecks[] = [];

		// Phase 2: fetch top 2 decklists from each tournament
		for (const tournament of tournaments) {
			t = timer();
			const deckUrls = await fetchTopDeckUrls(tournament.url, 2);
			console.log(`[${tournament.name}] found ${deckUrls.length} deck URLs: ${t()}`);

			const decks: DeckEntry[] = [];
			for (const url of deckUrls) {
				t = timer();
				try {
					const decklist = await fetchDecklist(url);
					console.log(`[${tournament.name}] ${decklist.placement} ${decklist.player}: ${t()}`);
					decks.push({ decklist, optimizer: null });
				} catch (err) {
					console.error(`[${tournament.name}] failed to fetch deck ${url}:`, err);
				}
			}

			results.push({
				name: tournament.name,
				url: tournament.url,
				date: tournament.date,
				players: tournament.players,
				decks
			});
		}

		// Send decklists immediately
		broadcast((c) => c.onDecks(results));

		// Phase 3: optimize prices in parallel
		const pricePromises: Promise<void>[] = [];

		for (let ti = 0; ti < results.length; ti++) {
			for (let di = 0; di < results[ti].decks.length; di++) {
				const deck = results[ti].decks[di];
				const name = `${deck.decklist.player} @ ${results[ti].name}`;

				pricePromises.push(
					(async () => {
						const pt = timer();
						try {
							const allCards = [...deck.decklist.mainboard, ...deck.decklist.sideboard];
							const resolvedCards = await resolveCardNames(allCards);
							const optimizer = await optimizeDecklist(resolvedCards);
							console.log(`[optimizer] ${name}: ${pt()}`);
							if (optimizer) {
								results[ti].decks[di].optimizer = optimizer;
								broadcast((c) => c.onPrice(ti, di, optimizer));
							}
						} catch (err) {
							console.error(`[optimizer] ${name} failed:`, err);
						}
					})()
				);
			}
		}

		await Promise.all(pricePromises);

		setCache(CACHE_KEY, results);
		console.log(`[pipeline] total: ${total()}`);
		broadcast((c) => c.onDone(results));
		pendingCallbacks.length = 0;
	} catch (err) {
		console.error('Pipeline failed:', err);
		const stale = getStale<TournamentWithDecks[]>(CACHE_KEY);
		if (stale) {
			broadcast((c) => c.onDecks(stale));
			broadcast((c) => c.onDone(stale));
		} else {
			throw err;
		}
	}
}
