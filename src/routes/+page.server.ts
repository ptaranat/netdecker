import type { PageServerLoad } from './$types';
import { getMetagameData } from '$lib/server/pipeline';
import type { ArchetypeWithDeck } from '$lib/types';

export const load: PageServerLoad = async () => {
	let archetypes: ArchetypeWithDeck[] = [];
	let error: string | null = null;

	try {
		archetypes = await getMetagameData();
	} catch (err) {
		console.error('Failed to load metagame data:', err);
		error = 'Failed to load metagame data. Please try again later.';
	}

	return {
		archetypes,
		error,
		lastUpdated: new Date().toISOString()
	};
};
