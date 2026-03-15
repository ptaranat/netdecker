import { json, type RequestEvent } from '@sveltejs/kit';
import type { ManapoolCardPrice } from '$lib/types';
import { manapoolFetch } from '$lib/server/manapool/client';

interface CacheEntry {
	data: ManapoolCardPrice;
	expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

export async function POST({ request }: RequestEvent) {
	const { scryfallIds } = await request.json();

	if (!Array.isArray(scryfallIds) || scryfallIds.length === 0) {
		return json({});
	}

	const now = Date.now();
	const result: Record<string, ManapoolCardPrice> = {};
	const uncached: string[] = [];

	for (const id of scryfallIds) {
		const entry = cache.get(id);
		if (entry && entry.expiresAt > now) {
			result[id] = entry.data;
		} else {
			uncached.push(id);
		}
	}

	// Batch into groups of 100
	for (let i = 0; i < uncached.length; i += 100) {
		const batch = uncached.slice(i, i + 100);
		const params = batch.map((id) => `scryfall_ids=${encodeURIComponent(id)}`).join('&');

		try {
			console.log(`[prices] fetching ${batch.length} cards from Manapool`);
			const res = await manapoolFetch(`/products/singles?${params}`);
			if (!res.ok) {
				const body = await res.text();
				console.error(`[prices] Manapool API error: ${res.status}`, body);
				continue;
			}

			const products = await res.json();
			for (const product of Array.isArray(products) ? products : (products.data ?? [])) {
				const scryfallId = product.scryfall_id;
				if (!scryfallId) continue;

				const price: ManapoolCardPrice = {
					priceCentsLow: product.price_cents ?? null,
					priceCentsNm: product.price_cents_nm ?? null,
					priceMarket: product.price_market ?? null,
					availableQty: product.available_quantity ?? 0,
					url: product.url ?? `https://manapool.com/products/${product.scryfall_id}`
				};

				result[scryfallId] = price;
				cache.set(scryfallId, { data: price, expiresAt: now + CACHE_TTL });
			}
		} catch (err) {
			console.error('[prices] Manapool fetch failed:', err);
		}
	}

	return json(result);
};
