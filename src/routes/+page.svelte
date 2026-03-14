<script lang="ts">
	import { onMount } from 'svelte';
	import type { ArchetypeWithDeck } from '$lib/types';

	let { data } = $props();
	let archetypes = $state<ArchetypeWithDeck[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let loadingMsg = $state('');
	let progress = $state(0);

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

	let msgInterval: ReturnType<typeof setInterval>;

	onMount(() => {
		let msgIndex = Math.floor(Math.random() * LOADING_MESSAGES.length);
		loadingMsg = LOADING_MESSAGES[msgIndex];
		msgInterval = setInterval(() => {
			msgIndex = (msgIndex + 1) % LOADING_MESSAGES.length;
			loadingMsg = LOADING_MESSAGES[msgIndex];
		}, 2000);

		const es = new EventSource('/api/metagame');

		es.addEventListener('progress', (e) => {
			const { pct } = JSON.parse(e.data);
			progress = pct;
		});

		es.addEventListener('done', (e) => {
			archetypes = JSON.parse(e.data);
			loading = false;
			clearInterval(msgInterval);
			es.close();
		});

		es.addEventListener('error', () => {
			error = 'Failed to load metagame data. Please try again later.';
			loading = false;
			clearInterval(msgInterval);
			es.close();
		});
	});

	function trendSymbol(trend: number): string {
		if (trend > 0) return `▲ +${trend.toFixed(2)}%`;
		if (trend < 0) return `▼ ${trend.toFixed(2)}%`;
		return `= ${trend.toFixed(2)}%`;
	}

	function formatPrice(price: number): string {
		return `$${price.toFixed(2)}`;
	}

	function truncate(str: string, max = 40): string {
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

<div class="terminal">
	<header>
		<pre class="logo">{ASCII_LOGO}</pre>
		<p class="tagline">standard metagame tracker · prices by manapool</p>
		<p class="meta">
			source: mtgdecks.net · major events (last 30 days) · updated: {new Date(
				data.lastUpdated
			).toLocaleDateString()}
		</p>
	</header>

	{#if error}
		<div class="error">
			<pre>ERROR: {error}</pre>
		</div>
	{/if}

	{#if loading}
		<pre class="loading">&gt; {loadingMsg}  [{progress}%]</pre>
	{/if}

	<div class="archetypes">
		{#each archetypes as arch, i}
			<section class="archetype">
				<div class="archetype-header">
					<pre>───────────────────────────────────────────────────────</pre>
					<pre class="arch-name">#{i + 1} {arch.name}  [{arch.tier}]</pre>
					<pre class="arch-stats">meta: {arch.metaShare.toFixed(2)}%  {trendSymbol(arch.trend)}  ·  {arch.deckCount} decks</pre>
				</div>

				<div class="deck-meta">
					<pre>  {arch.decklist.placement} by {arch.decklist.player}  ·  {arch.decklist.platform}  ·  {arch.decklist.date}</pre>
					<pre>  {truncate(arch.decklist.event, 60)}</pre>
				</div>

				<div class="deck-content">
					<div class="mainboard">
						<pre class="section-title">─── mainboard ({arch.decklist.mainboard.reduce((s, c) => s + c.quantity, 0)}) ───</pre>
						{#each arch.decklist.mainboard as card}
							<pre class="card-line">{String(card.quantity).padStart(2)} {card.name}</pre>
						{/each}
					</div>
					<div class="sideboard">
						<pre class="section-title">─── sideboard ({arch.decklist.sideboard.reduce((s, c) => s + c.quantity, 0)}) ───</pre>
						{#each arch.decklist.sideboard as card}
							<pre class="card-line">{String(card.quantity).padStart(2)} {card.name}</pre>
						{/each}
					</div>
				</div>

				<div class="pricing">
					{#if arch.optimizer}
						<pre class="price-box">─── manapool optimizer (balanced) ───</pre>
						<pre class="price-line">total: {formatPrice(arch.optimizer.totalPrice)}  ·  {arch.optimizer.sellerCount} sellers  ·  {arch.optimizer.packageCount} packages</pre>
						{#if arch.optimizer.unavailableCards.length > 0}
							<pre class="price-warn">  not on manapool: {arch.optimizer.unavailableCards.join(', ')}</pre>
						{/if}
						{#if arch.optimizer.cartUrl}
							<pre class="buy-link"><a href={arch.optimizer.cartUrl} target="_blank" rel="noopener">[buy on manapool]</a></pre>
						{/if}
					{:else}
						<pre class="price-unavailable">pricing unavailable</pre>
					{/if}
				</div>
			</section>
		{/each}
	</div>

	<footer>
		<pre class="footer-text">
───────────────────────────────────────────────────────────────────────────
  netdecker.app · powered by manapool.com · data from mtgdecks.net
───────────────────────────────────────────────────────────────────────────</pre>
	</footer>
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		background: #1a1a1a;
		color: #e8e4dc;
		font-family: 'JetBrains Mono', 'IBM Plex Mono', 'Courier New', Courier, monospace;
		font-size: 13px;
		line-height: 1.5;
	}

	.terminal {
		max-width: 80ch;
		margin: 0 auto;
		padding: 2rem 1rem;
	}

	pre {
		font-family: inherit;
		font-size: inherit;
		line-height: inherit;
	}

	header {
		text-align: center;
		margin-bottom: 2rem;
	}

	.logo {
		color: #e8a349;
		font-size: 8px;
		line-height: 1.0;
		margin: 0;
		overflow-x: auto;
	}

	.tagline {
		color: #e8a349;
		margin: 0.75rem 0 0 0;
	}

	.meta {
		color: #777;
		margin: 0.25rem 0 0 0;
	}

	.error pre {
		color: #cc5544;
	}

	.loading {
		color: #e8a349;
		text-align: center;
	}

	.archetypes {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.archetype {
		border: none;
	}

	.archetype-header pre {
		color: #777;
		margin: 0;
		overflow-x: auto;
	}

	.arch-name {
		color: #e8a349;
		font-weight: bold;
	}

	.arch-stats {
		color: #999;
	}

	.deck-meta pre {
		color: #777;
		margin: 0;
	}

	.deck-content {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		margin: 0.5rem 0;
	}

	.section-title {
		color: #e8a349;
		margin: 0 0 0.25rem 0;
	}

	.card-line {
		margin: 0;
		color: #e8e4dc;
	}

	.card-line:hover {
		color: #ffffff;
		background: #252525;
	}

	.price-box {
		color: #e8a349;
		margin: 0;
	}

	.price-line {
		color: #e8e4dc;
		margin: 0;
	}

	.price-warn {
		color: #996633;
		margin: 0;
	}

	.price-unavailable {
		color: #666;
		margin: 0;
	}

	.buy-link {
		margin: 0;
	}

	.pricing a {
		color: #e8a349;
		text-decoration: none;
	}

	.pricing a:hover {
		color: #f0b860;
		text-decoration: underline;
	}

	footer {
		margin-top: 2rem;
	}

	.footer-text {
		color: #444;
		text-align: center;
		margin: 0;
	}

	@media (max-width: 600px) {
		.logo {
			font-size: 6px;
		}

		.deck-content {
			grid-template-columns: 1fr;
		}

		.terminal {
			font-size: 12px;
		}
	}
</style>
