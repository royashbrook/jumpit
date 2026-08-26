# Level data

`levels.js` is the authored v2 campaign: four levels in each of Garden Walk,
Rooftop Rain, Workshop Loft, Lantern Market, and Beacon Keep. Coordinates are
integer tile units and `TILE` is 32 CSS pixels at 1× scale.

- `size`: `[width, height]`
- `spawn`: `[x, y]`
- `finish`: `[id, x, y]` (always the finish bell)
- `terrain`: `[id, kind, x, y, width, height]`
- `objects`: `[id, kind, x, y]`

Point coordinates occupy the tile immediately above their supporting terrain.
The validator treats three empty horizontal tiles, three upward tiles, and six
downward tiles as the conservative jump envelope. Every finish, seed, and
checkpoint must be connected to spawn by that graph.

All layouts, place names, creatures, and mechanics were authored for Jumpit.
They borrow only the general run-and-jump genre verbs; they do not copy a map,
character, name, art treatment, or trade dress from another game.
