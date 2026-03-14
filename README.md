# netdecker

top standard decks from major tournaments, priced on manapool. pls netdeck responsibly.

scrapes the latest regional championships and major events from mtgdecks.net, grabs the 1st and 2nd place decklists, resolves card names via scryfall, and optimizes pricing through the manapool api.

## stack

sveltekit, bun, cheerio, sse streaming. deployed on railway.

## run

```
cp .env.example .env  # add your manapool credentials
bun install
bun dev
```

## how it works

1. finds 3 most recent major paper tournaments (big star events on mtgdecks)
2. pulls 1st and 2nd place decklists from each
3. resolves dfc/adventure names and om1 renames via scryfall
4. streams decklists to the client immediately
5. optimizes prices via manapool's buyer/optimizer api in parallel
6. hover any card to see the image, click to flip dfcs
7. basic lands show kamigawa neon dynasty full art (japanese)

## credits

data from [mtgdecks.net](https://mtgdecks.net), prices from [manapool](https://manapool.com), card data from [scryfall](https://scryfall.com)
