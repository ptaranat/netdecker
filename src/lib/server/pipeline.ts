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
		const allPriced = cached.every((t) => t.decks.every((d) => d.optimizer !== null));
		if (allPriced) {
			console.log('[pipeline] cache hit (complete)');
			cb.onDecks(cached);
			cb.onDone(cached);
			return;
		}
		// Cache has decklists but no prices — send decks, then optimize
		console.log('[pipeline] cache hit (no prices), optimizing...');
		cb.onDecks(cached);

		if (activeBuild) {
			// Optimization already running from another request — piggyback
			pendingCallbacks.push(cb);
			await activeBuild;
		} else {
			activeBuild = optimizeCachedDecks(cached, cb);
			try { await activeBuild; } finally { activeBuild = null; }
		}
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
		for (const c of [...allCallbacks, ...pendingCallbacks]) {
			try { fn(c); } catch { /* stream may be closed */ }
		}
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
					// Resolve names + prices before sending to client
					const mbCount = decklist.mainboard.length;
					const allCards = [...decklist.mainboard, ...decklist.sideboard];
					const resolved = await resolveCardNames(allCards);
					decklist.mainboard = resolved.slice(0, mbCount);
					decklist.sideboard = resolved.slice(mbCount);
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

		// Cache decklists immediately (without prices) so reloads don't re-scrape
		setCache(CACHE_KEY, results);

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
							const optimizer = await optimizeDecklist(allCards);
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

async function optimizeCachedDecks(
	results: TournamentWithDecks[],
	cb: PipelineCallbacks
): Promise<void> {
	const pricePromises: Promise<void>[] = [];

	for (let ti = 0; ti < results.length; ti++) {
		for (let di = 0; di < results[ti].decks.length; di++) {
			const deck = results[ti].decks[di];
			if (deck.optimizer) continue;

			const name = `${deck.decklist.player} @ ${results[ti].name}`;
			pricePromises.push(
				(async () => {
					const pt = timer();
					try {
						const allCards = [...deck.decklist.mainboard, ...deck.decklist.sideboard];
						const optimizer = await optimizeDecklist(allCards);
						console.log(`[optimizer] ${name}: ${pt()}`);
						if (optimizer) {
							results[ti].decks[di].optimizer = optimizer;
							try { cb.onPrice(ti, di, optimizer); } catch { /* stream closed */ }
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
	try { cb.onDone(results); } catch { /* stream closed */ }
}
