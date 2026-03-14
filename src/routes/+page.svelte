<script lang="ts">
	import { onMount } from 'svelte';
	import type { ArchetypeWithDeck } from '$lib/types';

	let { data } = $props();
	let archetypes = $state<ArchetypeWithDeck[]>([]);
	let loading = $state(true);
	let pricingDone = $state(false);
	let error = $state<string | null>(null);
	let loadingMsg = $state('');

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
			archetypes = JSON.parse(e.data);
			loading = false;
			clearInterval(msgInterval);
		});

		es.addEventListener('price', (e) => {
			const { index, optimizer } = JSON.parse(e.data);
			archetypes[index] = { ...archetypes[index], optimizer };
		});

		es.addEventListener('done', () => {
			pricingDone = true;
			clearInterval(spinInterval);
			es.close();
		});

		es.addEventListener('error', () => {
			error = 'Failed to load metagame data. Please try again later.';
			loading = false;
			clearInterval(msgInterval);
			clearInterval(spinInterval);
			es.close();
		});
	});

	function trendSymbol(trend: number): string {
		if (trend > 0) return `▲ +${trend.toFixed(2)}%`;
		if (trend < 0) return `▼ ${trend.toFixed(2)}%`;
		return `${trend.toFixed(2)}%`;
	}

	function formatPrice(price: number): string {
		return `$${price.toFixed(2)}`;
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
	<title>netdecker — Standard Metagame Tracker</title>
	<meta name="description" content="Top 5 Standard archetypes with Manapool-optimized pricing" />
</svelte:head>

<div class="page">
	<div class="grid">
		<header>
			<pre class="logo">{ASCII_LOGO}</pre>
			<div class="tagline">top standard decks</div>
			<div class="meta">pls netdeck responsibly</div>
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

	{#each archetypes as arch, i}
		<section class="archetype-card">
			<div class="card-title">
				<span class="arch-rank">#{i + 1}</span>
				<span class="arch-name">{arch.name}</span>
				<span class="arch-meta">{arch.deckCount} decks  {arch.metaShare.toFixed(1)}%</span>
				<span class="arch-trend" class:trend-up={arch.trend > 0} class:trend-down={arch.trend < 0}>{trendSymbol(arch.trend)}</span>
			</div>
			<div class="card-body">
				<div class="arch-event">
					<a href={arch.decklist.url} target="_blank" rel="noopener">{arch.decklist.placement} by {arch.decklist.player}</a> — {truncate(arch.decklist.event, 45)}, {arch.decklist.date}
				</div>

				<div class="deck-grid">
					<div class="deck-col">
						<div class="deck-title">MAINBOARD ({arch.decklist.mainboard.reduce((s, c) => s + c.quantity, 0)})</div>
						{#each arch.decklist.mainboard as card}
							<div class="card-row">
								<span class="card-qty">{card.quantity}</span>
								<span class="card-name">{card.name}</span>
							</div>
						{/each}
					</div>
					<div class="deck-col">
						<div class="deck-title">SIDEBOARD ({arch.decklist.sideboard.reduce((s, c) => s + c.quantity, 0)})</div>
						{#each arch.decklist.sideboard as card}
							<div class="card-row">
								<span class="card-qty">{card.quantity}</span>
								<span class="card-name">{card.name}</span>
							</div>
						{/each}
					</div>
				</div>

				<div class="pricing">
					{#if arch.optimizer}
						<div class="price-result">
							<span class="price-amount">{formatPrice(arch.optimizer.totalPrice)}</span>
							<span class="price-sellers">{arch.optimizer.sellerCount} sellers</span>
						</div>
						{#if arch.optimizer.unavailableCards.length > 0}
							<div class="price-warn">not on manapool: {arch.optimizer.unavailableCards.join(', ')}</div>
						{/if}
					{:else if pricingDone}
						<div class="price-na">pricing unavailable</div>
					{:else}
						<div class="price-loading"><span class="spinner">{SPINNER[spinIdx]}</span> optimizing price</div>
					{/if}
				</div>
			</div>
		</section>
	{/each}
	<footer class="grid footer">
		<div>netdecker.app</div>
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

	.grid {
		padding: 1lh 2ch;
	}

	header {
		text-align: center;
		padding-top: 2lh;
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

	.meta {
		color: var(--text-muted);
	}

	.error {
		color: #cc5544;
	}

	.loading {
		color: var(--accent);
	}

	.spinner {
		display: inline-block;
		width: 1ch;
	}

	.archetype-card {
		margin: 1.5lh 2ch;
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
	}

	.arch-rank {
		color: var(--text-muted);
	}

	.arch-name {
		color: var(--accent);
		font-weight: 700;
		flex: 1;
	}

	.arch-meta {
		color: var(--text);
	}

	.arch-trend {
		color: var(--text-muted);
		width: 10ch;
		text-align: right;
	}

	.trend-up {
		color: var(--green);
	}

	.trend-down {
		color: var(--red);
	}

	.arch-event {
		color: var(--text-muted);
		margin-bottom: 0.5lh;
	}

	.arch-event a {
		color: var(--text);
		text-decoration: none;
	}

	.arch-event a:hover {
		color: var(--accent);
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
		margin-top: 0.5lh;
	}

	.price-result {
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
		color: var(--text-muted);
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

	@media (max-width: 600px) {
		.logo {
			font-size: 5px;
		}

		.deck-grid {
			grid-template-columns: 1fr;
		}

		.deck-col:last-child {
			border-left: none;
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
	}
</style>
