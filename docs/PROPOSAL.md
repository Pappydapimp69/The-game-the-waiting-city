# Phase 3 Proposal — "The Waiting City"

Compiled from: a direct audit of both existing repos' code and docs, a local Brain query (`memory/PITFALLS.md`, `ideas/idea-repository.md`), and two external research passes (deterministic enemy-AI architecture; narrative precedent for "an intelligence gaining capability" as theme). Provenance is marked inline — ✅ verified first-hand from repo/doc text, 🔎 external research finding, 💡 synthesis/judgment call.

Status: this proposal shaped the actual Stage 0 build (see `docs/STAGES.md` for what was built and where the implementation diverged from or refined the plan below).

---

## 0. TL;DR

- Phase 3 is the **"tyrant" arc** in the saga's own 5-part structure (home → rival → **tyrant** → artificial threat → apocalyptic, `docs/PROPOSAL.md:15-16` in the Prologue repo ✅). It opens exactly where Wrong Sky's epilogue left off: a besieged city, an unknown banner, someone who's "been waiting a very long time."
- The mechanical mandate is explicit and already written into Wrong Sky's own fiction: the dying boss says *"I haven't learned to move yet. The next one will."* (`content.js:170` ✅). Phase 3 ships **real enemy AI** — the first time anything in this saga moves or decides on its own.
- 💡 **Key synthesis, and the answer to "keep it about your growth without replacing the game's objectives":** the Prologue's own roadmap already reserves the *"artificial threat"* narrative beat for **Phase 4**, not Phase 3. That means Phase 3 gets to ship the technical leap (real AI) **without having to be a story about AI at all** — the in-fiction explanation for "these enemies are suddenly competent" is simply *"a tyrant's trained soldiers, not the feral things in the Reach."* Mundane, load-bearing, zero lampshading. The richer "an intelligence gains agency" theme gets saved for Phase 4.
- Signature system: not another "wells" chain. Instead, 💡 **extend the existing `perception` skill into AI-legibility** — perception already gates what the player can see about an enemy (`src/sim/info.js` ✅ in both repos); Phase 3 grows it to also reveal *behavioral* tells, turning "enemies got smart" into "you got better at reading them."
- Enemy AI itself: a small per-kind integer state machine, decided **inside `reduce()`'s `TICK` case**, pathed by a small deterministic BFS.

---

## 1. Where we left off (continuity — ✅ verified verbatim from both repos)

Wrong Sky's finale (`src/sim/content.js:172-177`, Wrong Sky repo):

> "The Second lies still. The wrong sky, mended behind you, holds its new colour."
> "You did what none of the Firstborn lived to explain — and there was no one to see it."
> "Beyond the rift, a city burns under a banner you have never seen."
> "Someone down there has been waiting a very long time for you to arrive."

The boss's dying tease:

> "\"I haven't learned to move yet,\" it admits. \"The next one will.\""

**Saga contract Phase 3 accepts** (✅ verified from Wrong Sky's `src/sim/saga.js`): a `saga.v2` code, prefix `SAGA2`, containing `archetype`, `difficulty`, `skills.{melee,aura,perception}`, `coins`, `techniques`, and `choices.{ravagerFate, riftChoice}`. Doctrine: *"every sequel accepts a code OR a fresh start — the code is a courtesy, never a wall."*

**What was deliberately NOT repeated:** Wrong Sky's "restore one facet at a time" wells chain. This game keeps the combat/skill spine (melee/aura dual-immunity, use-based skill growth, offer-not-push quests) as the trilogy's stable identity, but gives its new fate choice (spare/depose the Warden) real mechanical teeth from the start (a skill bump + a named technique), matching Wrong Sky's `claim` as the new baseline rather than the exception.

---

## 2. Narrative premise

The player arrives at the Lower Banks, a district of a tyrant-held city. Ferro (a contact who has "been waiting") sends the player to Ossa, a trainer who explains how to read a fight rather than just win one. Deliberately **not** the theme: an awakening machine intelligence, a Skynet turn, a "the enemies became conscious" reveal — reserved for Phase 4's "artificial threat" arc. All "learning" language in this game's fiction stays in the vocabulary of *training, drilling, discipline* — never *consciousness* or *artificial*.

---

## 3. The core addition: real enemy AI (as built)

Plain per-kind integer FSM (`patrol → chase → attack` (display-only) `→ return`, plus a `flee` clause on exactly one kind), decided inside `reduce()`'s `TICK` case (`src/sim/ai.js`), iterating `Object.keys(state.enemies).sort()` — never computed by the presentation layer and shipped as a command, so the golden-fingerprint replay actually exercises the AI logic and any future tuning is caught by it. Pathfinding is a small integer BFS (`src/sim/pathfind.js`, hardcoded 8-directional neighbor order, FIFO frontier, first-write-wins). Same-tick multi-entity movement (enemies AND cars) is resolved via a shared `claimed` tile-occupancy Set snapshotted at tick start, so two movers can never claim one tile in the same tick regardless of iteration happenstance. Patrol wander and car turn choices draw from `state.rng` via `nextInt`, never `Math.random()`.

Cars (`src/sim/ai.js`'s `decideCarStep`) are the friendly, non-hostile proof of the exact same movement machinery — no aggro, just "follow the road, roll a direction at each junction."

---

## 4. Signature system: perception → AI-legibility (as built)

`src/sim/info.js` extends the existing `perception` skill with a second, higher threshold (`aiSenseReq`, always ≥ `senseReq`) that reveals an enemy's live AI state as text (e.g. "closing in", "breaking off") alongside its hp/power. No new mechanic — the trilogy's existing stat just does more as it levels.

---

## 5. Visual signature: buildings that fade when you walk behind them

Multi-tile building footprints (`region.buildings`) draw as a facade extending upward from their footprint; when the player's tile sits north of a building's footprint (and within its width), the facade fades to partial alpha — the classic "walk behind a tall object" reveal, now applied to real architecture (`src/app/renderer.js`). Pure presentation, no sim/determinism involvement, no offscreen-buffer compositing needed (unlike Wrong Sky's grayscale reveal) since `globalAlpha` on a plain `fillRect` is cheap per call.

---

## 6. Brain provenance

- Queried `memory/PITFALLS.md` and `ideas/idea-repository.md` before scoping. The saga carryover contract is itself a previously-filed idea (already implemented here, per doctrine). No existing PITFALLS entries on sequel-scoping or enemy-AI-in-a-deterministic-sim at proposal time — see `docs/STAGES.md` for the memory write-back filed after this build.
