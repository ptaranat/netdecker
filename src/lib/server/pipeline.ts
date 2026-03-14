import type { TournamentWithDecks, DeckEntry, OptimizerResult } from '$lib/types';
import { allCards } from '$lib/types';
import { getCached, setCache, getStale } from './cache';
import { fetchMajorTournaments, fetchTopDeckUrls } from './scraper/tournaments';
import { fetchDecklist } from './scraper/decklist';
import { resolveCardNames } from './scraper/cardnames';
import { optimizeDecklist } from './manapool/optimizer';

const CACHE_KEY = 'tournament-data';
const TOURNAMENT_COUNT = 3;
const TOP_DECKS_PER_EVENT = 2;

let activeBuild: Promise<void> | null = null;
const pendingCallbacks: PipelineCallbacks[] = [];

function timer() {
	const start = performance.now();
	return () => `${(performance.now() - start).toFixed(0)}ms`;
}

export interface PipelineCallbacks {
	onDecks: (tournaments: TournamentWithDecks[]) => void;
	onPrice: (tournamentIdx: number, deckIdx: number, optimizer: OptimizerResult) => void;
	onDone: (tournaments: TournamentWithDecks[]) => void;
}

type BroadcastFn = (cb: PipelineCallbacks) => void;

function safeSend(cb: PipelineCallbacks, fn: BroadcastFn) {
	try { fn(cb); } catch { /* stream may be closed */ }
}

export async function getMetagameDataStreaming(cb: PipelineCallbacks): Promise<void> {
	const cached = getCached<TournamentWithDecks[]>(CACHE_KEY);
	if (cached) {
		const complete = cached.every((t) => t.decks.every((d) => d.optimizer !== null));
		if (complete) {
			console.log('[pipeline] cache hit (complete)');
			cb.onDecks(cached);
			cb.onDone(cached);
			return;
		}

		console.log('[pipeline] cache hit (no prices), optimizing...');
		cb.onDecks(cached);

		if (activeBuild) {
			pendingCallbacks.push(cb);
			await activeBuild;
			replayCompleted(cb, cached);
		} else {
			activeBuild = runOptimization(cached, [cb]);
			try { await activeBuild; } finally { activeBuild = null; }
		}
		return;
	}

	if (activeBuild) {
		console.log('[pipeline] build in progress, waiting...');
		pendingCallbacks.push(cb);
		await activeBuild;
		replayCompleted(cb, getCached<TournamentWithDecks[]>(CACHE_KEY));
		return;
	}

	activeBuild = runPipeline(cb);
	try { await activeBuild; } finally { activeBuild = null; }
}

function replayCompleted(cb: PipelineCallbacks, cached: TournamentWithDecks[] | null) {
	if (!cached) return;
	safeSend(cb, (c) => c.onDecks(cached));
	for (let ti = 0; ti < cached.length; ti++) {
		for (let di = 0; di < cached[ti].decks.length; di++) {
			const opt = cached[ti].decks[di].optimizer;
			if (opt) safeSend(cb, (c) => c.onPrice(ti, di, opt));
		}
	}
	safeSend(cb, (c) => c.onDone(cached));
}

async function runPipeline(cb: PipelineCallbacks): Promise<void> {
	const callbacks = [cb];
	const total = timer();

	function broadcast(fn: BroadcastFn) {
		for (const c of [...callbacks, ...pendingCallbacks]) safeSend(c, fn);
	}

	try {
		let elapsed = timer();
		const tournaments = await fetchMajorTournaments(TOURNAMENT_COUNT);
		console.log(`[pipeline] found ${tournaments.length} tournaments: ${elapsed()}`);

		const results: TournamentWithDecks[] = [];

		for (const tournament of tournaments) {
			elapsed = timer();
			const deckUrls = await fetchTopDeckUrls(tournament.url, TOP_DECKS_PER_EVENT);
			console.log(`[${tournament.name}] ${deckUrls.length} decks: ${elapsed()}`);

			const decks: DeckEntry[] = [];
			for (const url of deckUrls) {
				elapsed = timer();
				try {
					const decklist = await fetchDecklist(url);
					const mbCount = decklist.mainboard.length;
					const resolved = await resolveCardNames(allCards(decklist));
					decklist.mainboard = resolved.slice(0, mbCount);
					decklist.sideboard = resolved.slice(mbCount);
					console.log(`[${tournament.name}] ${decklist.placement} ${decklist.player}: ${elapsed()}`);
					decks.push({ decklist, optimizer: null });
				} catch (err) {
					console.error(`[${tournament.name}] deck failed ${url}:`, err);
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

		setCache(CACHE_KEY, results);
		broadcast((c) => c.onDecks(results));

		await runOptimization(results, callbacks, broadcast);

		console.log(`[pipeline] total: ${total()}`);
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

async function runOptimization(
	results: TournamentWithDecks[],
	callbacks: PipelineCallbacks[],
	broadcast?: (fn: BroadcastFn) => void
): Promise<void> {
	const send = broadcast ?? ((fn: BroadcastFn) => {
		for (const c of callbacks) safeSend(c, fn);
	});

	const promises: Promise<void>[] = [];

	for (let ti = 0; ti < results.length; ti++) {
		for (let di = 0; di < results[ti].decks.length; di++) {
			const deck = results[ti].decks[di];
			if (deck.optimizer) continue;

			const label = `${deck.decklist.player} @ ${results[ti].name}`;
			promises.push(optimizeSingleDeck(results, ti, di, label, send));
		}
	}

	await Promise.all(promises);
	setCache(CACHE_KEY, results);
	send((c) => c.onDone(results));
	pendingCallbacks.length = 0;
}

async function optimizeSingleDeck(
	results: TournamentWithDecks[],
	ti: number,
	di: number,
	label: string,
	broadcast: (fn: BroadcastFn) => void
): Promise<void> {
	const elapsed = timer();
	try {
		const cards = allCards(results[ti].decks[di].decklist);
		const optimizer = await optimizeDecklist(cards);
		console.log(`[optimizer] ${label}: ${elapsed()}`);
		if (optimizer) {
			results[ti].decks[di].optimizer = optimizer;
			broadcast((c) => c.onPrice(ti, di, optimizer));
		}
	} catch (err) {
		console.error(`[optimizer] ${label} failed:`, err);
	}
}
