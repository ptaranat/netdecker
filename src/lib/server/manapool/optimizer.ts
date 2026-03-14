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

const MAX_RETRIES = 3;
const LANGUAGE_IDS = ['EN'];
const FINISH_IDS = ['NF'];
const CONDITION_IDS = ['NM', 'LP', 'MP', 'HP'];

interface OptimizerResponse {
	totals: {
		subtotal_cents: number;
		shipping_cents: number;
		buyer_fee_cents: number;
		total_cents: number;
		seller_count: number;
	};
	objective_gap: number;
}

export async function optimizeDecklist(
	cards: Card[],
	model: 'balanced' | 'lowest_price' | 'fewest_packages' = 'balanced'
): Promise<OptimizerResult | null> {
	let currentCards = cards;
	const unavailableCards: string[] = [];

	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		if (currentCards.length === 0) return null;

		const cart: OptimizerCartItem[] = currentCards.map((card) => ({
			type: 'mtg_single',
			name: card.name,
			quantity_requested: card.quantity,
			language_ids: LANGUAGE_IDS,
			finish_ids: FINISH_IDS,
			condition_ids: CONDITION_IDS
		}));

		try {
			const res = await manapoolFetch('/buyer/optimizer', {
				method: 'POST',
				body: JSON.stringify({ cart, model, destination_country: 'US' })
			});

			const buf = await res.arrayBuffer();
			const text = new TextDecoder().decode(buf);

			if (res.ok) {
				// API returns NDJSON — streaming progressively better solutions.
				// Take the 2nd result (near-optimal, fast) or 1st if only one.
				const lines = text.trim().split('\n').filter((l) => l.trim());
				const lastLine = lines.length >= 2 ? lines[1] : lines[0];

				let parsed: OptimizerResponse;
				try {
					parsed = JSON.parse(lastLine);
				} catch {
					console.error('Failed to parse optimizer response');
					return null;
				}

				return {
					totalPrice: parsed.totals.total_cents / 100,
					sellerCount: parsed.totals.seller_count,
					packageCount: parsed.totals.seller_count,
					cartUrl: null,
					unavailableCards
				};
			}

			if (res.status === 409) {
				let errorData: Record<string, unknown>;
				try {
					errorData = JSON.parse(text);
				} catch {
					console.error('Failed to parse 409 response');
					return null;
				}

				const details = (errorData.details as UnavailableItem[]) ?? [];
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
