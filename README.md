# The Waiting City

Game 3 of a single-player offline saga — a direct sequel to
[Wrong Sky](https://github.com/Pappydapimp69/The-game-wrong-sky) and
[The Prologue](https://github.com/Pappydapimp69/The-game-prologue). Open-world
2D top-down action RPG in vanilla JS + HTML5 canvas, zero dependencies, static
hosting.

Wrong Sky's closing line: *"a city burns under a banner you have never seen...
someone down there has been waiting a very long time for you to arrive."* This
is that city — a tyrant-held district where, for the first time in the saga,
enemies actually move and decide on their own (a small deterministic per-kind
AI, driven entirely inside the authoritative reducer so it stays replay-safe).
Streets, multi-tile buildings that fade to translucent when you walk behind
them, and ambient traffic that uses the exact same movement machinery as the
hostile guards — a friendly, non-adversarial proof that the tech works.

The signature system is **not** another "restore one facet at a time" chain
(that was Wrong Sky's). Instead, the trilogy's existing `perception` skill
grows a second tier: at a higher threshold it reveals an enemy's live AI state
(patrol/chase/flee/etc), not just its hp/power — "the enemies got smart"
becomes "you got better at reading them."

**Independent by design.** This repo may reuse the earlier games' assets and
architecture but never edits them and shares no runtime code. Story continuity
travels only through the `saga.v2` import / `saga.v3` export code.

See [`docs/PROPOSAL.md`](docs/PROPOSAL.md) for the full design proposal and
[`docs/STAGES.md`](docs/STAGES.md) for the build log.

## Develop

```
npm run smoke   # deterministic headless test suite
```
