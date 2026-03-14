import type { Card, OptimizerResult } from '$lib/types';
import { manapoolFetch } from './client';

interface OptimizerCartItem {
	type: 'mtg_single';
	name: string;
	quantity_requested: number;
	language_ids: string[];
	finish_ids: string[];
	condition_ids: string[];
}

interface UnavailableItem {
	item: { name: string; index: number };
	total_available: number;
}

export async function optimizeDecklist(
	cards: Card[],
	model: 'balanced' | 'lowest_price' | 'fewest_packages' = 'balanced'
): Promise<OptimizerResult | null> {
	let currentCards = cards;
	const unavailableCards: string[] = [];

	// Retry up to 3 times, removing unavailable cards each time
	for (let attempt = 0; attempt < 3; attempt++) {
		if (currentCards.length === 0) return null;

		const cart: OptimizerCartItem[] = currentCards.map((card) => ({
			type: 'mtg_single',
			name: card.name,
			quantity_requested: card.quantity,
			language_ids: ['EN'],
			finish_ids: ['NF'],
			condition_ids: ['NM', 'LP', 'MP', 'HP']
		}));

		try {
			const res = await manapoolFetch('/buyer/optimizer', {
				method: 'POST',
				body: JSON.stringify({ cart, model, destination_country: 'US' })
			});

			let parsed: Record<string, unknown>;

			try {
				const buf = await res.arrayBuffer();
				const text = new TextDecoder().decode(buf);
				// API sometimes returns NDJSON — take the first line
				const firstLine = text.split('\n').find((l) => l.trim().startsWith('{'));
				if (!firstLine) throw new Error('No JSON object in response');
				parsed = JSON.parse(firstLine);
			} catch (parseErr) {
				console.error(`Manapool JSON parse failed (attempt ${attempt}):`, parseErr);
				return null;
			}

			if (res.ok) {
				const result = parseOptimizerResponse(parsed);
				result.unavailableCards = unavailableCards;
				return result;
			}

			if (res.status === 409) {
				const error = parsed;
				const details: UnavailableItem[] = (error.details as UnavailableItem[]) ?? [];
				const badNames = new Set(details.map((d) => d.item.name));

				if (badNames.size === 0) return null;

				unavailableCards.push(...badNames);
				currentCards = currentCards.filter((c) => !badNames.has(c.name));
				continue;
			}

			console.error(`Manapool optimizer error: ${res.status}`);
			return null;
		} catch (err) {
			console.error('Manapool optimizer failed:', err);
			return null;
		}
	}

	return null;
}

function parseOptimizerResponse(data: Record<string, unknown>): OptimizerResult {
	const sellers = (data.sellers as unknown[]) ?? [];
	let totalPrice = 0;
	const packageCount = sellers.length;

	for (const seller of sellers) {
		const s = seller as Record<string, unknown>;
		totalPrice += (s.subtotal as number) ?? 0;
		totalPrice += (s.shipping as number) ?? 0;
	}

	if (data.total !== undefined) {
		totalPrice = data.total as number;
	}

	return {
		totalPrice,
		sellerCount: packageCount,
		packageCount,
		cartUrl: (data.cart_url as string) ?? null,
		unavailableCards: []
	};
}
