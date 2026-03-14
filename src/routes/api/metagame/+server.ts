import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getMetagameData } from '$lib/server/pipeline';

export const GET: RequestHandler = async () => {
	try {
		const data = await getMetagameData();
		return json(data);
	} catch (err) {
		console.error('Metagame API error:', err);
		return json({ error: 'Failed to load metagame data' }, { status: 500 });
	}
};
