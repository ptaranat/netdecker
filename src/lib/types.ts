export interface Archetype {
	name: string;
	slug: string;
	url: string;
	metaShare: number;
	trend: number;
	tier: string;
	deckCount: number;
}

export interface Card {
	name: string;
	quantity: number;
}

export interface Decklist {
	mainboard: Card[];
	sideboard: Card[];
	player: string;
	placement: string;
	event: string;
	platform: string;
	date: string;
	url: string;
}

export interface OptimizerResult {
	totalPrice: number;
	sellerCount: number;
	packageCount: number;
	cartUrl: string | null;
	unavailableCards: string[];
}

export interface ArchetypeWithDeck extends Archetype {
	decklist: Decklist;
	optimizer: OptimizerResult | null;
}
