<script lang="ts">
	import { onMount } from 'svelte';
	import type { TournamentWithDecks } from '$lib/types';

	import type { DeckEntry, TournamentEvent } from '$lib/types';

	interface FlatDeck extends DeckEntry {
		tournament: TournamentEvent;
	}

	let { data } = $props();
	let tournaments = $state<TournamentWithDecks[]>([]);
	let loading = $state(true);
	let pricingDone = $state(false);
	let error = $state<string | null>(null);
	let loadingMsg = $state('');

	// Flatten: all 1st place finishers first, then all 2nd place
	let flatDecks = $derived.by(() => {
		const firsts: FlatDeck[] = [];
		const seconds: FlatDeck[] = [];
		for (const t of tournaments) {
			const event: TournamentEvent = { name: t.name, url: t.url, date: t.date, players: t.players };
			if (t.decks[0]) firsts.push({ ...t.decks[0], tournament: event });
			if (t.decks[1]) seconds.push({ ...t.decks[1], tournament: event });
		}
		return [...firsts, ...seconds];
	});

	const LOADING_MESSAGES = [
		'bolting the bird...',
		'paying the one...',
		'in response...',
		'searching library...',
		'cutting your deck...',
		'destroying target permanent...',
		'exiling all graveyards...',
		'passing priority...',
		'drawing for turn...',
		'declaring blockers...',
		'going to combat...'
	];

	const SPINNER = ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'];
	let spinIdx = $state(0);

	let msgInterval: ReturnType<typeof setInterval>;
	let spinInterval: ReturnType<typeof setInterval>;

	onMount(() => {
		let msgIndex = Math.floor(Math.random() * LOADING_MESSAGES.length);
		loadingMsg = LOADING_MESSAGES[msgIndex];
		msgInterval = setInterval(() => {
			msgIndex = (msgIndex + 1) % LOADING_MESSAGES.length;
			loadingMsg = LOADING_MESSAGES[msgIndex];
		}, 2000);
		spinInterval = setInterval(() => {
			spinIdx = (spinIdx + 1) % SPINNER.length;
		}, 100);

		const es = new EventSource('/api/metagame');

		es.addEventListener('decks', (e) => {
			tournaments = JSON.parse(e.data);
			loading = false;
		});

		es.addEventListener('price', (e) => {
			const { tournamentIdx, deckIdx, optimizer } = JSON.parse(e.data);
			// Trigger reactivity by reassigning the tournaments array
			tournaments = tournaments.map((t, ti) => {
				if (ti !== tournamentIdx) return t;
				return {
					...t,
					decks: t.decks.map((d, di) => {
						if (di !== deckIdx) return d;
						return { ...d, optimizer };
					})
				};
			});
		});

		es.addEventListener('done', () => {
			pricingDone = true;
			clearInterval(spinInterval);
			clearInterval(msgInterval);
			es.close();
		});

		es.addEventListener('error', () => {
			error = 'Failed to load data. Please try again later.';
			loading = false;
			clearInterval(msgInterval);
			clearInterval(spinInterval);
			es.close();
		});
	});

	function formatPrice(price: number): string {
		return `$${price.toFixed(2)}`;
	}

	function decklistToText(deck: FlatDeck): string {
		const lines = [
			...deck.decklist.mainboard.map((c) => `${c.quantity} ${c.name}`),
			'',
			...deck.decklist.sideboard.map((c) => `${c.quantity} ${c.name}`)
		];
		return lines.join('\n');
	}

	let copiedIdx = $state<number | null>(null);

	async function copyDecklist(deck: FlatDeck, idx: number) {
		await navigator.clipboard.writeText(decklistToText(deck));
		copiedIdx = idx;
		setTimeout(() => { copiedIdx = null; }, 300);
	}

	function truncate(str: string, max = 50): string {
		return str.length > max ? str.slice(0, max - 1) + '…' : str;
	}

	const ASCII_LOGO = [
		'███    ██ ███████ ████████ ██████  ███████  ██████ ██   ██ ███████ ██████ ',
		'████   ██ ██         ██    ██   ██ ██      ██      ██  ██  ██      ██   ██',
		'██ ██  ██ █████      ██    ██   ██ █████   ██      █████   █████   ██████ ',
		'██  ██ ██ ██         ██    ██   ██ ██      ██      ██  ██  ██      ██   ██',
		'██   ████ ███████    ██    ██████  ███████  ██████ ██   ██ ███████ ██   ██'
	].join('\n');
</script>

<svelte:head>
	<title>netdecker — top standard decks</title>
	<meta name="description" content="Top Standard decks from major tournaments with Manapool-optimized pricing" />
</svelte:head>

<div class="page">
	<div class="grid">
		<header>
			<pre class="logo">{ASCII_LOGO}</pre>
			<div class="tagline">top standard decks</div>
		</header>
	</div>

	{#if error}
		<div class="grid error">{error}</div>
	{/if}

	{#if loading}
		<div class="grid loading">
			<span class="spinner">{SPINNER[spinIdx]}</span> {loadingMsg}
		</div>
	{/if}

	<div class="deck-list">
	{#each flatDecks as deck, deckIndex}
		<section class="archetype-card">
			<div class="card-title">
				<span class="deck-placement">{deck.decklist.placement}</span>
				<a href={deck.decklist.url} target="_blank" rel="noopener" class="deck-archetype">{deck.decklist.archetype}</a>
				<span class="deck-player">{deck.decklist.player}</span>
			</div>
			<div class="card-body">
				<div class="deck-event">
					{deck.tournament.name}  {deck.tournament.players} players  {deck.tournament.date}
				</div>

				<div class="deck-grid">
					<div class="deck-col">
						<div class="deck-title">MAINBOARD ({deck.decklist.mainboard.reduce((s, c) => s + c.quantity, 0)})</div>
						{#each deck.decklist.mainboard as card}
							<div class="card-row">
								<span class="card-qty">{card.quantity}</span>
								<span class="card-name">{card.name}</span>
							</div>
						{/each}
					</div>
					<div class="deck-col">
						<div class="deck-title">SIDEBOARD ({deck.decklist.sideboard.reduce((s, c) => s + c.quantity, 0)})</div>
						{#each deck.decklist.sideboard as card}
							<div class="card-row">
								<span class="card-qty">{card.quantity}</span>
								<span class="card-name">{card.name}</span>
							</div>
						{/each}
					</div>
				</div>

				<div class="pricing">
					{#if deck.optimizer}
						<span class="price-amount">{formatPrice(deck.optimizer.totalPrice)}</span>
						{#if deck.optimizer.unavailableCards.length > 0}
							<span class="price-warn">({deck.optimizer.unavailableCards.length} not on manapool)</span>
						{/if}
						<button class="deck-action" onclick={() => copyDecklist(deck, deckIndex)}>{copiedIdx === deckIndex ? 'copied!' : 'copy decklist'}</button>
						<a class="deck-action" href="https://manapool.com/add-deck" target="_blank" rel="noopener">buy on manapool</a>
					{:else if pricingDone}
						<span class="price-na">pricing unavailable</span>
					{:else}
						{@const msgIdx = (Math.floor(spinIdx / 20) + deckIndex * 3) % LOADING_MESSAGES.length}
						<span class="price-loading"><span class="spinner">{SPINNER[spinIdx]}</span> {LOADING_MESSAGES[msgIdx]}</span>
					{/if}
				</div>
			</div>
		</section>
	{/each}
	</div>

	<footer class="grid footer">
		<div>netdecker.app — netdeck responsibly</div>
		<div class="credits">
			data <a href="https://mtgdecks.net/Standard" target="_blank" rel="noopener">mtgdecks</a>
			 / prices <a href="https://manapool.com" target="_blank" rel="noopener">manapool</a>
			 / cards <a href="https://scryfall.com" target="_blank" rel="noopener">scryfall</a>
		</div>
	</footer>
</div>

<style>
	:global(*) {
		border: 0;
		box-sizing: border-box;
		margin: 0;
		padding: 0;
	}

	:global(body) {
		--bg: #1a1a1a;
		--text: #f0ece4;
		--text-muted: #bbb;
		--text-dim: #999;
		--accent: #e8a349;
		--accent-hover: #f0b860;
		--green: #5cb85c;
		--red: #cc5544;
		--border: #666;
		--hover-bg: #222;

		background: var(--bg);
		color: var(--text);
		font-family: 'GeistMono-Regular', 'JetBrains Mono', 'Courier New', monospace;
		font-size: 13px;
		line-height: 1.5;
	}

	.page {
		max-width: 72ch;
		margin: 0 auto;
		width: 100%;
	}

	.deck-list {
		display: flex;
		flex-direction: column;
	}

	.grid {
		padding: 1lh 2ch;
	}

	header {
		text-align: center;
		padding-top: 2lh;
		padding-bottom: 0;
	}

	.logo {
		color: var(--accent);
		font-size: 8px;
		line-height: 1.0;
		overflow: hidden;
	}

	.tagline {
		color: var(--accent);
		margin-top: 1lh;
	}

	.error {
		color: var(--red);
	}

	.loading {
		color: var(--accent);
	}

	.spinner {
		display: inline-block;
		width: 1ch;
	}

	.archetype-card {
		margin: 1lh 2ch;
		display: flex;
		flex-direction: column;
		box-shadow:
			inset 2px 0 0 0 var(--border),
			inset -2px 0 0 0 var(--border),
			inset 0 -2px 0 0 var(--border);
	}

	.card-title {
		display: flex;
		gap: 1ch;
		align-items: baseline;
		padding: 0.5lh 2ch;
		box-shadow:
			inset 2px 0 0 0 var(--border),
			inset -2px 0 0 0 var(--border),
			inset 0 2px 0 0 var(--border);
	}

	.card-body {
		padding: 0.5lh 2ch 1lh 2ch;
		display: flex;
		flex-direction: column;
		flex: 1;
	}

	.deck-event {
		color: var(--text-muted);
		margin-bottom: 0.5lh;
	}

	.deck-placement {
		color: var(--text);
		font-weight: 700;
	}

	.deck-archetype {
		color: var(--accent);
		text-decoration: none;
		flex: 1;
	}

	.deck-archetype:hover {
		color: var(--accent-hover);
	}

	.deck-player {
		color: var(--text-muted);
	}

	.deck-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0;
		min-width: 0;
		overflow: hidden;
	}

	.deck-col {
		padding: 0.5lh 0;
		min-width: 0;
		overflow: hidden;
	}

	.deck-col:first-child {
		padding-right: 2ch;
	}

	.deck-col:last-child {
		padding-left: 2ch;
	}

	.deck-title {
		color: var(--text-muted);
		margin-bottom: 0.25lh;
	}

	.card-row {
		display: flex;
		gap: 1ch;
	}

	.card-row:hover {
		background: var(--hover-bg);
		color: #fff;
	}

	.card-qty {
		width: 2ch;
		text-align: right;
		flex-shrink: 0;
		color: var(--text-muted);
	}

	.card-name {
		color: var(--text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.card-row:hover .card-qty {
		color: var(--text);
	}

	.pricing {
		margin-top: auto;
		padding-top: 0.5lh;
		display: flex;
		gap: 2ch;
	}

	.price-amount {
		color: var(--green);
	}

	.price-sellers {
		color: var(--text-muted);
	}

	.price-warn {
		color: var(--text-dim);
	}

	.price-loading {
		color: var(--accent);
	}

	.deck-action {
		background: none;
		color: var(--accent);
		font-family: inherit;
		font-size: inherit;
		cursor: pointer;
		text-decoration: none;
	}

	.deck-action:first-of-type {
		margin-left: auto;
	}

	.deck-action:hover {
		color: var(--accent-hover);
	}

	.price-na {
		color: var(--text-dim);
	}

	.footer {
		color: var(--text-dim);
		text-align: center;
		padding-bottom: 2lh;
	}

	.credits {
		margin-top: 0.5lh;
	}

	.credits a {
		color: var(--text-muted);
		text-decoration: none;
	}

	.credits a:hover {
		color: var(--accent);
	}

	@media (min-width: 1400px) {
		.page {
			max-width: 100%;
		}

		.deck-list {
			display: grid;
			grid-template-columns: repeat(3, 1fr);
			padding: 0 2ch;
		}

		.archetype-card {
			margin: 1lh 1ch;
		}
	}

	@media (max-width: 600px) {
		.logo {
			font-size: 5px;
		}

		.deck-grid {
			grid-template-columns: 1fr;
		}

		.deck-col:last-child {
			padding-left: 0;
			border-top: 1px solid var(--border);
			padding-top: 1lh;
		}

		.deck-col:first-child {
			padding-right: 0;
		}

		.archetype-card {
			margin: 1lh 1ch;
		}

		.card-title {
			flex-direction: column;
		}
	}
</style>
