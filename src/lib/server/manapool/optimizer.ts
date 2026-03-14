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

export async function optimizeDecklist(
	cards: Card[],
	model: 'balanced' | 'lowest_price' | 'fewest_packages' = 'balanced'
): Promise<OptimizerResult | null> {
	const cart: OptimizerCartItem[] = cards.map((card) => ({
		type: 'mtg_single',
		name: card.name,
		quantity_requested: card.quantity,
		language_ids: ['EN'],
		finish_ids: ['NF'],
		condition_ids: ['NM', 'LP']
	}));

	try {
		const res = await manapoolFetch('/buyer/optimizer', {
			method: 'POST',
			body: JSON.stringify({
				cart,
				model,
				destination_country: 'US'
			})
		});

		if (!res.ok) {
			console.error(`Manapool optimizer error: ${res.status} ${await res.text()}`);
			return null;
		}

		const data = await res.json();
		return parseOptimizerResponse(data);
	} catch (err) {
		console.error('Manapool optimizer failed:', err);
		return null;
	}
}

function parseOptimizerResponse(data: Record<string, unknown>): OptimizerResult {
	// The optimizer response structure varies — extract what we can
	const sellers = (data.sellers as unknown[]) ?? [];
	let totalPrice = 0;
	let packageCount = sellers.length;

	for (const seller of sellers) {
		const s = seller as Record<string, unknown>;
		totalPrice += (s.subtotal as number) ?? 0;
		totalPrice += (s.shipping as number) ?? 0;
	}

	// Fall back to top-level total if available
	if (data.total !== undefined) {
		totalPrice = data.total as number;
	}

	return {
		totalPrice,
		sellerCount: packageCount,
		packageCount,
		cartUrl: (data.cart_url as string) ?? null
	};
}
