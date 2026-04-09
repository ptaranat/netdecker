<script lang="ts">
import { onMount } from "svelte";
import type {
	DeckEntry,
	ManapoolCardPrice,
	TournamentEvent,
	TournamentWithDecks,
} from "$lib/types";
import "$lib/sacred/sacred.css";
import ActionButton from "$lib/sacred/ActionButton.svelte";
import Badge from "$lib/sacred/Badge.svelte";
import Card from "$lib/sacred/Card.svelte";

interface FlatDeck extends DeckEntry {
	tournament: TournamentEvent;
}

let { data } = $props();
let tournaments = $state<TournamentWithDecks[]>([]);
let loading = $state(true);
let pricingDone = $state(false);
let error = $state<string | null>(null);
let loadingMsg = $state("");

// Manapool live prices
let manapoolPrices = $state<Record<string, ManapoolCardPrice>>({});
let priceInterval: ReturnType<typeof setInterval> | null = null;

// Flatten: all 1st place finishers first, then all 2nd place
let flatDecks = $derived.by(() => {
	const firsts: FlatDeck[] = [];
	const seconds: FlatDeck[] = [];
	for (const t of tournaments) {
		const event: TournamentEvent = {
			name: t.name,
			url: t.url,
			date: t.date,
			players: t.players,
		};
		if (t.decks[0]) firsts.push({ ...t.decks[0], tournament: event });
		if (t.decks[1]) seconds.push({ ...t.decks[1], tournament: event });
	}
	return [...firsts, ...seconds];
});

const LOADING_MESSAGES = [
	"bolting the bird...",
	"paying the one...",
	"in response...",
	"searching library...",
	"cutting your deck...",
	"destroying target permanent...",
	"exiling all graveyards...",
	"passing priority...",
	"drawing for turn...",
	"declaring blockers...",
	"going to combat...",
];

const SPINNER = ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"];
let spinIdx = $state(0);
let msgTick = $state(0);

let msgInterval: ReturnType<typeof setInterval>;
let spinInterval: ReturnType<typeof setInterval>;

function collectScryfallIds(): string[] {
	const ids = new Set<string>();
	for (const t of tournaments) {
		for (const d of t.decks) {
			for (const c of [...d.decklist.mainboard, ...d.decklist.sideboard]) {
				if (c.scryfallId) ids.add(c.scryfallId);
			}
		}
	}
	return [...ids];
}

async function fetchManapoolPrices() {
	const scryfallIds = collectScryfallIds();
	if (scryfallIds.length === 0) return;

	try {
		const res = await fetch("/api/prices", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ scryfallIds }),
		});
		if (!res.ok) return;

		manapoolPrices = await res.json();
	} catch {
		// silent fail
	}
}

function startPricePolling() {
	if (priceInterval) return;
	fetchManapoolPrices();
	priceInterval = setInterval(fetchManapoolPrices, 30 * 60 * 1000);
}

function stopPricePolling() {
	if (priceInterval) {
		clearInterval(priceInterval);
		priceInterval = null;
	}
}

onMount(() => {
	let msgIndex = Math.floor(Math.random() * LOADING_MESSAGES.length);
	loadingMsg = LOADING_MESSAGES[msgIndex];
	msgInterval = setInterval(() => {
		msgIndex = (msgIndex + 1) % LOADING_MESSAGES.length;
		loadingMsg = LOADING_MESSAGES[msgIndex];
		msgTick++;
	}, 2000);
	spinInterval = setInterval(() => {
		spinIdx = (spinIdx + 1) % SPINNER.length;
	}, 100);

	const es = new EventSource("/api/metagame");

	es.addEventListener("decks", (e) => {
		tournaments = JSON.parse(e.data);
		loading = false;
		// Preload card images for instant hover
		for (const t of tournaments) {
			for (const d of t.decks) {
				for (const c of [...d.decklist.mainboard, ...d.decklist.sideboard]) {
					preloadImage(c.name);
				}
			}
		}
		// Fetch Manapool prices after decks load
		startPricePolling();
	});

	es.addEventListener("price", (e) => {
		const { tournamentIdx, deckIdx, optimizer } = JSON.parse(e.data);
		// Trigger reactivity by reassigning the tournaments array
		tournaments = tournaments.map((t, ti) => {
			if (ti !== tournamentIdx) return t;
			return {
				...t,
				decks: t.decks.map((d, di) => {
					if (di !== deckIdx) return d;
					return { ...d, optimizer };
				}),
			};
		});
	});

	es.addEventListener("done", () => {
		pricingDone = true;
		clearInterval(spinInterval);
		clearInterval(msgInterval);
		es.close();
	});

	es.addEventListener("error", () => {
		// Native connection-close fires after the server ends the stream.
		// If we already have data this is benign — just clean up.
		if (tournaments.length > 0) {
			pricingDone = true;
			clearInterval(spinInterval);
			clearInterval(msgInterval);
			es.close();
			return;
		}
		error = "Failed to load data. Please try again later.";
		loading = false;
		clearInterval(msgInterval);
		clearInterval(spinInterval);
		stopPricePolling();
		es.close();
	});

	function onVisibilityChange() {
		if (document.hidden) {
			stopPricePolling();
		} else if (tournaments.length > 0) {
			startPricePolling();
		}
	}
	document.addEventListener("visibilitychange", onVisibilityChange);

	return () => {
		stopPricePolling();
		document.removeEventListener("visibilitychange", onVisibilityChange);
	};
});

function formatPrice(price: number): string {
	return `$${price.toFixed(2)}`;
}

function formatCents(cents: number): string {
	return `$${(cents / 100).toFixed(2)}`;
}

function decklistToText(deck: FlatDeck): string {
	const lines = [
		...deck.decklist.mainboard.map((c) => `${c.quantity} ${c.name}`),
		"",
		...deck.decklist.sideboard.map((c) => `${c.quantity} ${c.name}`),
	];
	return lines.join("\n");
}

let copiedIdx = $state<number | null>(null);

async function copyDecklist(deck: FlatDeck, idx: number) {
	await navigator.clipboard.writeText(decklistToText(deck));
	copiedIdx = idx;
	setTimeout(() => {
		copiedIdx = null;
	}, 300);
}

let priceTooltip = $state<{
	x: number;
	y: number;
	text: string;
	cls: string;
} | null>(null);

function showPriceTooltip(
	scryfallId: string | null,
	scryfallUsd: number | null,
	qty: number,
	e: MouseEvent,
) {
	if (scryfallUsd == null || !scryfallId || !manapoolPrices[scryfallId]) return;
	const mp = manapoolPrices[scryfallId];
	const mpCents = mp.priceCentsLow ?? mp.priceCentsNm;
	if (mpCents == null) return;
	const deltaCents = mpCents * qty - Math.round(scryfallUsd * qty * 100);
	const sign = deltaCents <= 0 ? "" : "+";
	const cls =
		deltaCents < 0 ? "delta-cheaper" : deltaCents > 0 ? "delta-pricier" : "";
	priceTooltip = {
		x: e.clientX,
		y: e.clientY,
		text: `${sign}$${(deltaCents / 100).toFixed(2)}`,
		cls,
	};
}

function hidePriceTooltip() {
	priceTooltip = null;
}

let disclaimerPos = $state<{ x: number; y: number } | null>(null);

function showDisclaimer(e: MouseEvent) {
	disclaimerPos = { x: e.clientX, y: e.clientY };
}

function hideDisclaimer() {
	disclaimerPos = null;
}

let hoverCard = $state<string | null>(null);
let hoverCardId = $state<string | null>(null);
let hoverCardQty = $state(1);
let hoverCardScryfall = $state<number | null>(null);
let hoverPos = $state({ x: 0, y: 0 });
let showBack = $state(false);

const imageCache = new Set<string>();

function preloadImage(name: string) {
	if (imageCache.has(name)) return;
	imageCache.add(name);
	const img = new Image();
	img.src = scryfallImageUrl(name);
	if (name.includes("//")) {
		new Image().src = scryfallImageUrl(name, true);
	}
	if (name in NEO_BASICS) {
		// Preload alt variant
		const num = NEO_BASICS[name][1];
		new Image().src = `https://api.scryfall.com/cards/neo/${num}/ja?format=image&version=normal`;
	}
}

function showCard(
	name: string,
	scryfallId: string | null,
	qty: number,
	scryfallUsd: number | null,
	e: MouseEvent,
) {
	hoverCard = name;
	hoverCardId = scryfallId;
	hoverCardQty = qty;
	hoverCardScryfall = scryfallUsd;
	showBack = false;
	hoverPos = { x: e.clientX, y: e.clientY };
}

function moveCard(e: MouseEvent) {
	hoverPos = { x: e.clientX, y: e.clientY };
}

function hideCard() {
	hoverCard = null;
	hoverCardId = null;
	showBack = false;
}

function handleClick(
	name: string,
	scryfallId: string | null,
	qty: number,
	scryfallUsd: number | null,
	e: MouseEvent,
) {
	if (hoverCard !== name) {
		showCard(name, scryfallId, qty, scryfallUsd, e);
		return;
	}
	if (name in NEO_BASICS) {
		basicAlt = !basicAlt;
	} else if (name.includes("//")) {
		showBack = !showBack;
	}
}

// Kamigawa Neon Dynasty full art basics (Japanese)
const NEO_BASICS: Record<string, [string, string]> = {
	Plains: ["293", "294"],
	Island: ["295", "296"],
	Swamp: ["297", "298"],
	Mountain: ["299", "300"],
	Forest: ["301", "302"],
};

let basicAlt = $state(false);

function scryfallImageUrl(name: string, back = false): string {
	const neo = NEO_BASICS[name];
	if (neo) {
		const num = basicAlt ? neo[1] : neo[0];
		return `https://api.scryfall.com/cards/neo/${num}/ja?format=image&version=normal`;
	}
	const face = back ? "&face=back" : "";
	return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=normal${face}`;
}

function truncate(str: string, max = 50): string {
	return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

function getCardPriceClass(
	scryfallId: string | null,
	scryfallUsd: number | null,
): string {
	if (!scryfallId || scryfallUsd == null) return "";
	const mp = manapoolPrices[scryfallId];
	if (!mp) return "";
	const mpCents = mp.priceCentsLow ?? mp.priceCentsNm ?? null;
	if (mpCents == null) return "";
	// Compare Manapool (cents) vs Scryfall (dollars)
	if (mpCents / 100 < scryfallUsd) return "price-up";
	if (mpCents / 100 > scryfallUsd) return "price-down";
	return "";
}

function getDisplayPrice(
	scryfallId: string | null,
	fallbackUsd: number | null,
	quantity: number,
): string | null {
	if (scryfallId && manapoolPrices[scryfallId]) {
		const mp = manapoolPrices[scryfallId];
		const cents = mp.priceCentsLow ?? mp.priceCentsNm;
		if (cents != null) return `$${((cents * quantity) / 100).toFixed(2)}`;
	}
	if (fallbackUsd != null) return `$${(fallbackUsd * quantity).toFixed(2)}`;
	return null;
}

function deckTotals(deck: FlatDeck): {
	scryfall: number | null;
	manapool: number | null;
} {
	const cards = [...deck.decklist.mainboard, ...deck.decklist.sideboard];
	let scryfall = 0;
	let scryfallComplete = false;
	let manapool = 0;
	let manapoolComplete = false;

	for (const c of cards) {
		if (c.priceUsd != null) {
			scryfall += c.priceUsd * c.quantity;
			scryfallComplete = true;
		}
		if (c.scryfallId && manapoolPrices[c.scryfallId]) {
			const cents =
				manapoolPrices[c.scryfallId].priceCentsLow ??
				manapoolPrices[c.scryfallId].priceCentsNm;
			if (cents != null) {
				manapool += (cents * c.quantity) / 100;
				manapoolComplete = true;
			}
		}
	}

	return {
		scryfall: scryfallComplete ? scryfall : null,
		manapool: manapoolComplete ? manapool : null,
	};
}

const ASCII_LOGO = [
	"███    ██ ███████ ████████ ██████  ███████  ██████ ██   ██ ███████ ██████ ",
	"████   ██ ██         ██    ██   ██ ██      ██      ██  ██  ██      ██   ██",
	"██ ██  ██ █████      ██    ██   ██ █████   ██      █████   █████   ██████ ",
	"██  ██ ██ ██         ██    ██   ██ ██      ██      ██  ██  ██      ██   ██",
	"██   ████ ███████    ██    ██████  ███████  ██████ ██   ██ ███████ ██   ██",
].join("\n");
</script>

<svelte:head>
	<title>netdecker - top standard decks</title>
	<meta name="description" content="Top Standard decks from major tournaments with Manapool-optimized pricing" />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap" rel="stylesheet" />
</svelte:head>

<div class="page sacred-root">
	<header>
		<pre class="logo">{ASCII_LOGO}</pre>
		<div class="tagline">netdeck responsibly - get <span class="green" role="note" onmouseenter={(e) => showDisclaimer(e)} onmousemove={(e) => showDisclaimer(e)} onmouseleave={hideDisclaimer}>better*</span> prices on <a href="https://manapool.com" target="_blank" rel="noopener" class="link">manapool</a></div>
	</header>

	{#if error}
		<div class="status" style="color: var(--red)">{error}</div>
	{/if}

	{#if loading}
		<div class="status" style="color: var(--accent)">
			<span class="spinner">{SPINNER[spinIdx]}</span> {loadingMsg}
		</div>
	{/if}

	<div class="deck-list">
	{#each flatDecks as deck, deckIndex}
		{@const totals = deckTotals(deck)}
		<div class="deck-wrapper">
			<Card title={deck.decklist.archetype.toUpperCase()} mode="left">
				<Badge>{deck.decklist.placement}</Badge>
				{'  '}{deck.decklist.player}
				{'  '}<span style="opacity: 0.5">{deck.tournament.name}  {deck.tournament.players} players  {deck.tournament.date}</span>

				<div class="deck-grid">
					<div class="deck-col">
						<div class="section-label"><Badge>MAINBOARD ({deck.decklist.mainboard.reduce((s, c) => s + c.quantity, 0)})</Badge></div>
						{#each deck.decklist.mainboard as card}
							<div class="card-row">
								<span class="card-qty">{card.quantity}</span>
								<span class="card-name" role="button" tabindex="-1" onmouseenter={(e) => showCard(card.name, card.scryfallId, card.quantity, card.priceUsd, e)} onmousemove={moveCard} onmouseleave={hideCard} onclick={(e) => handleClick(card.name, card.scryfallId, card.quantity, card.priceUsd, e)} onkeydown={(e) => e.key === 'Enter' && handleClick(card.name, card.scryfallId, card.quantity, card.priceUsd, e as any)}>{card.name}</span>
								{#if getDisplayPrice(card.scryfallId, card.priceUsd, card.quantity)}
									<span class="card-price {getCardPriceClass(card.scryfallId, card.priceUsd)}" role="note" onmouseenter={(e) => showPriceTooltip(card.scryfallId, card.priceUsd, card.quantity, e)} onmousemove={(e) => showPriceTooltip(card.scryfallId, card.priceUsd, card.quantity, e)} onmouseleave={hidePriceTooltip}>{getDisplayPrice(card.scryfallId, card.priceUsd, card.quantity)}</span>
								{/if}
							</div>
						{/each}
					</div>
					<div class="deck-col">
						<div class="section-label"><Badge>SIDEBOARD ({deck.decklist.sideboard.reduce((s, c) => s + c.quantity, 0)})</Badge></div>
						{#each deck.decklist.sideboard as card}
							<div class="card-row">
								<span class="card-qty">{card.quantity}</span>
								<span class="card-name" role="button" tabindex="-1" onmouseenter={(e) => showCard(card.name, card.scryfallId, card.quantity, card.priceUsd, e)} onmousemove={moveCard} onmouseleave={hideCard} onclick={(e) => handleClick(card.name, card.scryfallId, card.quantity, card.priceUsd, e)} onkeydown={(e) => e.key === 'Enter' && handleClick(card.name, card.scryfallId, card.quantity, card.priceUsd, e as any)}>{card.name}</span>
								{#if getDisplayPrice(card.scryfallId, card.priceUsd, card.quantity)}
									<span class="card-price {getCardPriceClass(card.scryfallId, card.priceUsd)}" role="note" onmouseenter={(e) => showPriceTooltip(card.scryfallId, card.priceUsd, card.quantity, e)} onmousemove={(e) => showPriceTooltip(card.scryfallId, card.priceUsd, card.quantity, e)} onmouseleave={hidePriceTooltip}>{getDisplayPrice(card.scryfallId, card.priceUsd, card.quantity)}</span>
								{/if}
							</div>
						{/each}
					</div>
				</div>

				<div class="pricing">
					<span class="price-compare">
						{#if totals.scryfall != null || totals.manapool != null}
							{#if totals.scryfall != null}
								<span style="opacity: 0.5">{formatPrice(totals.scryfall)}</span>
							{/if}
							{#if totals.scryfall != null && totals.manapool != null}
								<span style="opacity: 0.5">→</span>
								<span class={totals.manapool < totals.scryfall ? 'green' : totals.manapool > totals.scryfall ? 'red' : ''}>{formatPrice(totals.manapool)}</span>
							{:else if totals.manapool != null}
								<span>{formatPrice(totals.manapool)}</span>
							{/if}
						{:else if !pricingDone}
							{@const msgIdx = (msgTick + deckIndex * 3) % LOADING_MESSAGES.length}
							<span style="color: var(--accent)"><span class="spinner">{SPINNER[spinIdx]}</span> {LOADING_MESSAGES[msgIdx]}</span>
						{:else}
							<span style="opacity: 0.5">pricing unavailable</span>
						{/if}
					</span>
					<ActionButton onclick={() => copyDecklist(deck, deckIndex)}>{copiedIdx === deckIndex ? 'COPIED!' : 'COPY'}</ActionButton>
					<ActionButton href="https://manapool.com/add-deck" target="_blank">BUY</ActionButton>
				</div>
			</Card>
		</div>
	{/each}
	</div>

	{#if hoverCard}
		<div class="card-preview" style="left: {hoverPos.x + 16}px; top: {hoverPos.y - 100}px;">
			<img src={scryfallImageUrl(hoverCard, showBack)} alt={hoverCard} width="280" height="391" />
			{#if hoverCard.includes('//') || hoverCard in NEO_BASICS}
				<div class="flip-hint">click to flip</div>
			{/if}
			{#if hoverCardId && manapoolPrices[hoverCardId]}
				{@const mp = manapoolPrices[hoverCardId]}
				{@const unitCents = mp.priceCentsLow ?? mp.priceCentsNm}
				<div class="price-details">
					{#if unitCents != null}
						<div class="price-row"><span style="opacity: 0.5">low</span> <span>{formatCents(unitCents)}</span></div>
					{/if}
					{#if mp.priceMarket != null}
						<div class="price-row"><span style="opacity: 0.5">market</span> <span>{formatCents(mp.priceMarket)}</span></div>
					{/if}
					{#if unitCents != null && hoverCardScryfall != null}
						{@const deltaCents = unitCents - Math.round(hoverCardScryfall * 100)}
						<div class="price-row">
							<span style="opacity: 0.5">vs scryfall</span>
							<span class={deltaCents < 0 ? 'green' : deltaCents > 0 ? 'red' : ''}>{deltaCents <= 0 ? '' : '+'}{formatCents(deltaCents)}</span>
						</div>
					{/if}
					<div class="price-row"><span style="opacity: 0.5">available</span> <span>{mp.availableQty}</span></div>
				</div>
			{/if}
		</div>
	{/if}

	{#if priceTooltip}
		<div class="tooltip {priceTooltip.cls}" style="left: {priceTooltip.x}px; top: {priceTooltip.y + 20}px;">
			{priceTooltip.text}
		</div>
	{/if}

	{#if disclaimerPos}
		<div class="tooltip" style="left: {disclaimerPos.x}px; top: {disclaimerPos.y + 20}px;">
			vs TCGplayer/Cardmarket
		</div>
	{/if}

	<footer>
		made with &lt;3 by <a href="https://scriptwizards.org" target="_blank" rel="noopener">script wizards</a>
		(<a href="https://github.com/ptaranat/netdecker" target="_blank" rel="noopener">github</a>)
		<br />
		data <a href="https://mtgdecks.net" target="_blank" rel="noopener">mtgdecks</a>
		/ prices <a href="https://manapool.com" target="_blank" rel="noopener">manapool</a>
		/ cards <a href="https://scryfall.com" target="_blank" rel="noopener">scryfall</a>
		<div class="disclaimer">
			netdecker is unofficial Fan Content permitted under the <a href="https://company.wizards.com/en/legal/fancontentpolicy" target="_blank" rel="noopener">Fan Content Policy</a>.
			Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast.
			&copy; Wizards of the Coast LLC. Not affiliated with Manapool, MTGDecks, or Scryfall.
		</div>
	</footer>
</div>

<style>
	:global(*) { border: 0; box-sizing: border-box; margin: 0; padding: 0; }

	:global(body) {
		--accent: #e8a349;
		--green: #5cb85c;
		--red: #cc5544;

		background: #000;
		color: #fff;
		font-family: 'Share Tech Mono', 'GeistMono-Regular', 'JetBrains Mono', monospace;
		font-size: 15px;
		line-height: 1.5;
	}

	/* Utilities */
	.green { color: var(--green); }
	.red { color: var(--red); }
	.link { color: var(--accent); text-decoration: none; }
	.link:hover { color: #f0b860; }
	.spinner { display: inline-block; width: 1ch; }

	/* Layout */
	.page { max-width: 72ch; margin: 0 auto; padding: 0 2ch; }
	.status { padding: 0.5lh 0; }

	header { text-align: center; padding-top: 1lh; }
	.logo { color: var(--accent); font-size: 10px; line-height: 1.0; overflow: hidden; }
	.tagline { color: var(--accent); margin-top: 1lh; margin-bottom: 1lh; }

	/* Deck list */
	.deck-list { display: flex; flex-direction: column; }
	.deck-wrapper { margin-top: 1lh; }
	.section-label { margin-top: 0.5lh; }

	.deck-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		min-width: 0;
		overflow: hidden;
	}

	.deck-col { min-width: 0; overflow: hidden; }
	.deck-col:first-child { padding-right: 2ch; }
	.deck-col:last-child { padding-left: 2ch; }

	/* Card rows */
	.card-row { display: flex; gap: 1ch; }
	.card-row:hover { background: #111; }
	.card-qty { width: 2ch; text-align: right; flex-shrink: 0; }
	.card-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
	.card-price { margin-left: auto; opacity: 0.5; flex-shrink: 0; }
	.card-price.price-up { color: var(--green); opacity: 1; }
	.card-price.price-down { color: var(--red); opacity: 1; }

	/* Pricing footer */
	.pricing { margin-top: 0.5lh; display: flex; align-items: center; gap: 1ch; }
	.price-compare { flex: 1; display: flex; gap: 1ch; }

	/* Card preview */
	.card-preview {
		position: fixed; z-index: 100; overflow: hidden; pointer-events: none;
		box-shadow: inset 2px 0 0 0 #fff, inset -2px 0 0 0 #fff, inset 0 2px 0 0 #fff, inset 0 -2px 0 0 #fff;
	}
	.card-preview img { display: block; }
	.flip-hint { text-align: center; opacity: 0.5; padding: 2px 0; background: #000; }
	.price-details { background: #000; padding: 4px 1ch; }
	.price-row { display: flex; justify-content: space-between; gap: 2ch; }

	/* Tooltips */
	.tooltip {
		position: fixed; z-index: 100; pointer-events: none; text-align: center;
		background: #000; padding: 2px 1ch;
		box-shadow: inset 2px 0 0 0 #fff, inset -2px 0 0 0 #fff, inset 0 2px 0 0 #fff, inset 0 -2px 0 0 #fff;
	}

	/* Footer */
	footer { text-align: center; opacity: 0.5; padding: 2lh 0; }
	footer a { color: #fff; text-decoration: none; }
	footer a:hover { color: var(--accent); }
	.disclaimer { margin-top: 0.5lh; }

	/* Responsive */
	@media (min-width: 1400px) {
		.page { max-width: 100%; }
		.deck-list { display: grid; grid-template-columns: repeat(3, 1fr); }
	}

	@media (max-width: 600px) {
		.logo { font-size: 7px; }
		.deck-grid { grid-template-columns: 1fr; }
		.deck-col:last-child { padding-left: 0; padding-top: 0.5lh; }
		.deck-col:first-child { padding-right: 0; }
	}
</style>
