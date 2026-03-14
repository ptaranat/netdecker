import type { Card } from '$lib/types';

const SCRYFALL_COLLECTION_URL = 'https://api.scryfall.com/cards/collection';
const SCRYFALL_FUZZY_URL = 'https://api.scryfall.com/cards/named';
const SCRYFALL_HEADERS = {
	'User-Agent': 'Netdecker/1.0 (netdecker.app)',
	Accept: 'application/json'
};

// Persistent name cache — survives across archetype calls
const nameCache = new Map<string, string>();

/**
 * Resolves card names to their full Scryfall names.
 * Handles DFC/Adventure (front face → "Front // Back") and
 * OM1 renames (fuzzy match fallback for not_found cards).
 * Results are cached in-memory so repeated cards skip Scryfall.
 */
export async function resolveCardNames(cards: Card[]): Promise<Card[]> {
	const uniqueNames = [...new Set(cards.map((c) => c.name))];
	const uncached = uniqueNames.filter((n) => !nameCache.has(n));

	if (uncached.length > 0) {
		await resolveFromScryfall(uncached);
	}

	return cards.map((c) => ({
		...c,
		name: nameCache.get(c.name) ?? c.name
	}));
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
					nameCache.set(inputName, card.name);
				}
			}

			for (const nf of data.not_found ?? []) {
				notFound.push(nf.name);
			}
		} catch (err) {
			console.error('Scryfall collection request failed:', err);
		}
	}

	// Fuzzy search fallback for not_found cards (OM1 renames etc.)
	for (const name of notFound) {
		try {
			const res = await fetch(
				`${SCRYFALL_FUZZY_URL}?fuzzy=${encodeURIComponent(name)}`,
				{ headers: SCRYFALL_HEADERS }
			);
			if (res.ok) {
				const card = await res.json();
				nameCache.set(name, card.name ?? name);
			} else {
				nameCache.set(name, name); // Cache miss too, so we don't retry
			}
			await new Promise((r) => setTimeout(r, 100));
		} catch {
			nameCache.set(name, name);
		}
	}

	const resolutions = Object.fromEntries(
		[...nameCache].filter(([k, v]) => k !== v)
	);
	if (Object.keys(resolutions).length > 0) {
		console.log('Card name resolutions:', resolutions);
	}
}
