import type { RequestHandler } from './$types';
import { getMetagameDataStreaming } from '$lib/server/pipeline';

export const GET: RequestHandler = async () => {
	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();

			function send(event: string, data: unknown) {
				controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
			}

			try {
				await getMetagameDataStreaming({
					onDecks: (tournaments) => send('decks', tournaments),
					onPrice: (tournamentIdx, deckIdx, optimizer) =>
						send('price', { tournamentIdx, deckIdx, optimizer }),
					onDone: () => send('done', {})
				});
			} catch (err) {
				console.error('Metagame SSE error:', err);
				send('error', { message: 'Failed to load metagame data' });
			}

			controller.close();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
