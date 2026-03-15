export interface Card {
	name: string;
	quantity: number;
	priceUsd: number | null;
	scryfallId: string | null;
}

export interface ManapoolCardPrice {
	priceCentsLow: number | null;
	priceCentsNm: number | null;
	priceMarket: number | null;
	availableQty: number;
	url: string;
}

export interface Decklist {
	mainboard: Card[];
	sideboard: Card[];
	player: string;
	placement: string;
	archetype: string;
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

export interface TournamentEvent {
	name: string;
	url: string;
	date: string;
	players: number;
}

export interface DeckEntry {
	decklist: Decklist;
	optimizer: OptimizerResult | null;
}

export interface TournamentWithDecks extends TournamentEvent {
	decks: DeckEntry[];
}

export function allCards(decklist: Decklist): Card[] {
	return [...decklist.mainboard, ...decklist.sideboard];
}
