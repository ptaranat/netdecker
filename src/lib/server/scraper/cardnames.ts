import type { Card } from '$lib/types';

const SCRYFALL_COLLECTION_URL = 'https://api.scryfall.com/cards/collection';
const SCRYFALL_FUZZY_URL = 'https://api.scryfall.com/cards/named';
const SCRYFALL_HEADERS = {
	'User-Agent': 'Netdecker/1.0 (netdecker.app)',
	Accept: 'application/json'
};

interface CardInfo {
	name: string;
	priceUsd: number | null;
}

// Persistent cache — survives across calls
const cardCache = new Map<string, CardInfo>();

export async function resolveCardNames(cards: Card[]): Promise<Card[]> {
	const uniqueNames = [...new Set(cards.map((c) => c.name))];
	const uncached = uniqueNames.filter((n) => !cardCache.has(n));

	if (uncached.length > 0) {
		await resolveFromScryfall(uncached);
	}

	return cards.map((c) => {
		const info = cardCache.get(c.name);
		return {
			...c,
			name: info?.name ?? c.name,
			priceUsd: info?.priceUsd ?? null
		};
	});
}

async function resolveFromScryfall(names: string[]): Promise<void> {
	const notFound: string[] = [];

	for (let i = 0; i < names.length; i += 75) {
		const batch = names.slice(i, i + 75);
		const identifiers = batch.map((name) => ({ name }));

		try {
			const res = await fetch(SCRYFALL_COLLECTION_URL, {
				method: 'POST',
				headers: { ...SCRYFALL_HEADERS, 'Content-Type': 'application/json' },
				body: JSON.stringify({ identifiers })
			});

			if (!res.ok) {
				console.error(`Scryfall collection error: ${res.status}`);
				continue;
			}

			const data = await res.json();

			for (const card of data.data ?? []) {
				const inputName = batch.find(
					(n) => card.name.toLowerCase().startsWith(n.toLowerCase())
				);
				if (inputName) {
					const price = card.prices?.usd ? parseFloat(card.prices.usd) : null;
					cardCache.set(inputName, { name: card.name, priceUsd: price });
				}
			}

			for (const nf of data.not_found ?? []) {
				notFound.push(nf.name);
			}
		} catch (err) {
			console.error('Scryfall collection request failed:', err);
		}
	}

	for (const name of notFound) {
		try {
			const res = await fetch(
				`${SCRYFALL_FUZZY_URL}?fuzzy=${encodeURIComponent(name)}`,
				{ headers: SCRYFALL_HEADERS }
			);
			if (res.ok) {
				const card = await res.json();
				const price = card.prices?.usd ? parseFloat(card.prices.usd) : null;
				cardCache.set(name, { name: card.name ?? name, priceUsd: price });
			} else {
				cardCache.set(name, { name, priceUsd: null });
			}
			await new Promise((r) => setTimeout(r, 100));
		} catch {
			cardCache.set(name, { name, priceUsd: null });
		}
	}

	const resolutions = [...cardCache].filter(([k, v]) => k !== v.name);
	if (resolutions.length > 0) {
		console.log('Card name resolutions:', Object.fromEntries(resolutions.map(([k, v]) => [k, v.name])));
	}
}
