// CONTENT — pure data, no functions. This is the authoring surface: adding a
// quest, enemy, NPC, item, road, building, or archetype is an edit HERE and
// nowhere else. Objective TYPES (kill / collect / reach) are the code/content
// seam — a new type is a reducer case; a new instance is data. Every id is
// validated by the smoke ladder (schema -> referential integrity ->
// completability -> headless playthrough), so a typo fails the build, not
// the player.
//
// THE WAITING CITY (saga game 3). Wrong Sky ended: "a city burns under a
// banner you have never seen... someone down there has been waiting a very
// long time for you to arrive." This is that city. Its ruler is a tyrant, not
// an idea — the signature mechanical addition is REAL enemy AI (the Second's
// dying words in game 2: "I haven't learned to move yet. The next one will."),
// framed entirely as mundane in-world competence (trained soldiers, not an
// awakening machine) — the "an intelligence gains real agency" theme is
// deliberately reserved for a later phase, not this one.
//
// No wells this time — that was Wrong Sky's own signature and reusing it
// verbatim was flagged as the single biggest repetition risk. Instead: the
// EXISTING perception skill (already gates enemy hp/power visibility) is
// extended so that at a HIGHER threshold it also reveals an enemy's current
// AI state (patrol/chase/flee/etc) — "the enemies got smart" becomes "you got
// better at reading them," a direct two-sided escalation with no new mystical
// mechanic bolted on.

export const CONTENT = {
  version: 1,

  archetypes: {
    brawler: {
      name: 'Brawler',
      blurb: 'Fists first. Questions later.',
      hp: 26, aura: 9,
      skills: { melee: 2, aura: 1, perception: 1 },
    },
    channeler: {
      name: 'Channeler',
      blurb: 'The aura answers those who listen.',
      hp: 20, aura: 15,
      skills: { melee: 1, aura: 2, perception: 1 },
    },
    seeker: {
      name: 'Seeker',
      blurb: 'Sees what others miss.',
      hp: 22, aura: 11,
      skills: { melee: 1, aura: 1, perception: 2 },
    },
  },
  defaultArchetype: 'brawler',

  items: {
    tonic: { name: 'Tonic', price: 3, heal: 5 },
    emberdraught: { name: 'Emberdraught', price: 6, heal: 11 },
    signet: { name: 'Ferro’s Signet', keyItem: 1 },
    'seal-shard': { name: 'Warden’s Seal-shard', keyItem: 1 },
  },

  // aggro: Chebyshev detection radius. leash: max Chebyshev distance from
  // `home` while chasing before giving up and returning to post. fleeAt/
  // resumeAt: HP percent thresholds (hysteresis) — only kinds that define
  // fleeAt ever enter the flee state. aiSenseReq: perception level needed to
  // read this kind's AI-state tell (patrol/chase/flee/etc); always >= senseReq
  // (you learn to read a fight before you learn to read a mind).
  enemyKinds: {
    sentry: { name: 'Sentry', hp: 10, power: 2, senseReq: 2, aiSenseReq: 3, aggro: 5, leash: 7, patrolRadius: 3 },
    bulwark: { name: 'Bulwark', hp: 12, power: 2, senseReq: 2, aiSenseReq: 3, immune: 'aura', aggro: 5, leash: 7, patrolRadius: 3 },
    cutthroat: {
      name: 'Cutthroat', hp: 11, power: 3, senseReq: 2, aiSenseReq: 3, immune: 'melee',
      aggro: 6, leash: 8, patrolRadius: 3, fleeAt: 30, resumeAt: 45,
    },
    warden: { name: 'The Warden', hp: 44, power: 5, senseReq: 3, aiSenseReq: 4, aggro: 99, leash: 99, patrolRadius: 0 },
  },

  regions: {
    'lower-banks': {
      name: 'Lower Banks',
      w: 32, h: 20,
      spawn: { x: 1, y: 10 },
      // Opacity 0-100 per blocked tile — buildings are fully opaque (100).
      // Collision itself is existence-based (any entry blocks MOVE); opacity
      // only matters to line-of-sight (src/sim/visibility.js), consumed here
      // by enemy AI detection, not by the player's own sight.
      blocked: buildingTiles([
        { id: 'depot', x: 2, y: 2, w: 4, h: 4 },
        { id: 'tenement', x: 2, y: 13, w: 4, h: 4 },
        { id: 'hall', x: 24, y: 2, w: 5, h: 4 },
        { id: 'barracks', x: 24, y: 13, w: 5, h: 4 },
      ]),
      // Building footprints, kept separate from `blocked` for the renderer:
      // it draws each as a sprite taller than its footprint, Y-sort-faded
      // transparent when the player's tile is "behind" (above) it — walking
      // behind a building reveals it instead of just hiding the player.
      buildings: {
        depot: { x: 2, y: 2, w: 4, h: 4, floors: 2 },
        tenement: { x: 2, y: 13, w: 4, h: 4, floors: 2 },
        hall: { x: 24, y: 2, w: 5, h: 4, floors: 3 },
        barracks: { x: 24, y: 13, w: 5, h: 4, floors: 2 },
      },
      // Road tiles: where cars are allowed to be/move, and how the ground
      // renders (asphalt, not sidewalk). One cross: Main Street (full width,
      // y=10) meeting Market Row (full height, x=16) at a single intersection.
      roads: roadTiles(32, 20, 10, 16),
      npcs: {
        ferro: {
          x: 3, y: 10, name: 'Ferro',
          offers: 'city-of-rules',
          dialog: [
            'You made it through the rift. Word crosses faster than people do, out here.',
            'This is the Lower Banks. Everyone above the Hall answers to the Warden — everyone below answers to whoever’s closest.',
            'I’ve been waiting on you specifically. Long story. Ossa can teach you to read this place faster than I can explain it.',
          ],
        },
        ossa: {
          x: 20, y: 10, name: 'Ossa', shop: ['tonic', 'emberdraught'],
          dialog: [
            'Everyone watches for a blade. Almost no one watches for a stance.',
            'A guard who’s about to run looks different from one about to charge you — if you know what to look for.',
            'That’s not a well or a blessing. That’s just paying attention. Keep fighting and it’ll come.',
          ],
        },
      },
      enemies: {
        sentry1: { kind: 'sentry', x: 7, y: 4 },
        cutthroat1: { kind: 'cutthroat', x: 21, y: 15 },
        // Existence-gated (not present until 'the-wardens-seal' is accepted) —
        // see reduce.js ACCEPT_QUEST / world.js gatedEnemyIds. A fresh,
        // guaranteed-killable instance, rather than requiring a kill of a
        // guard that might already be dead from free-roam combat.
        'bulwark-elite1': { kind: 'bulwark', x: 21, y: 14 },
      },
      destructibles: {
        crate1: { x: 14, y: 4, coins: 3 },
      },
      pickups: {
        signet1: { x: 6, y: 3, item: 'signet' },
        // Existence-gated by 'the-wardens-seal' (see enemies note above).
        seal1: { x: 30, y: 15, item: 'seal-shard' },
      },
      zones: {
        'training-yard': { x: 20, y: 10, r: 1 },
        'champion-arena': { x: 29, y: 10, r: 2 },
        'harbor-gate': { x: 31, y: 10, r: 1 },
      },
      // Cars: purely ambient, non-hostile, deterministic lane-followers (see
      // reduce.js TICK / src/sim/ai.js decideCarStep) — the friendly,
      // low-stakes proof that the same movement machinery driving hostile
      // guards works, before it's ever used against the player.
      cars: {
        car1: { x: 2, y: 10, dir: 'E' },
        car2: { x: 16, y: 3, dir: 'S' },
      },
      boss: { id: 'warden1', kind: 'warden', x: 29, y: 9 },
    },
  },
  startRegion: 'lower-banks',

  arc: {
    intro: [
      'LOWER BANKS.',
      'The rift closed behind you onto a city that has clearly been standing a long time.',
      'Streets, real buildings, a banner on the Hall you don’t recognize — and, closer, a man who looks like he’s been waiting since before you arrived.',
      'Somewhere past the Hall, guards who move like they mean it.',
    ],
    guide: {
      talk: 'Someone’s waiting near the road. Speak with Ferro.',
      training: 'Ferro sent you to Ossa, east along Main Street.',
      hunt1: 'Ossa wants proof you can hold your own. Find a fight.',
      hunt2: 'One more — the ones who run teach you more than the ones who don’t.',
      ledger: 'Ferro has more to say. Talk to them again.',
      finale: 'The Warden’s people won’t let this go quietly. Ferro will say what’s left.',
      hunt3: 'Break the Warden’s line — and take back what’s owed.',
      arena: 'The path to the Warden stands open. Walk to the arena at the street’s end.',
      boss: 'The Warden. Whatever happens here decides who this city answers to.',
      choice: 'It kneels, beaten. Decide what becomes of it.',
      gate: 'The way to the harbor stands open. Walk it.',
    },
    bossAppeared: [
      'The Warden waits at the end of the street like they knew the exact hour you’d arrive.',
      '"Ferro talks too much," they say. "I’ve had years to get ready for this conversation."',
    ],
    bossTaunted: [
      'Halfway down, the Warden stops circling and simply attacks — no more testing you.',
      '"You fight like something that only just learned how," they say. "My city taught me that lesson decades ago."',
    ],
    finale: [
      'The Warden goes still. The banner over the Hall means something different now, even if the cloth hasn’t changed.',
      'Ferro was right to wait — this was never going to be settled by anyone who arrived a stranger.',
      'Past the harbor, something answers that was never given a voice to do it with.',
      'No one down there is waiting for you yet. That won’t last.',
    ],
    exportHint: 'Keep this code — the next crossing will ask for it.',
  },

  quests: {
    'city-of-rules': {
      name: 'City of Rules',
      giver: 'ferro',
      objectives: [{ type: 'reach', zone: 'training-yard' }],
      reward: { coins: 4 },
    },
    'read-the-city': {
      name: 'Read the City',
      // All quests route through Ferro, never Ossa — Ossa is a shop NPC, and
      // a shop NPC that also offers quests would race its own 'talked' event
      // (which opens the shop modal) against 'quests_offered' (which
      // unconditionally overwrites view.modal) every time both fire from the
      // same TALK. Keeping the roles on separate NPCs (as established) sidesteps
      // it entirely rather than patching the race.
      giver: 'ferro',
      requires: ['city-of-rules'],
      objectives: [{ type: 'kill', target: 'sentry', n: 1 }],
      reward: { coins: 5 },
    },
    'watch-them-move': {
      name: 'Watch Them Move',
      giver: 'ferro',
      requires: ['read-the-city'],
      objectives: [{ type: 'kill', target: 'cutthroat', n: 1 }],
      reward: { coins: 5 },
    },
    'ferros-ledger': {
      name: 'Ferro’s Ledger',
      giver: 'ferro',
      requires: ['watch-them-move'],
      objectives: [{ type: 'collect', item: 'signet' }],
      reward: { coins: 5 },
    },
    'the-wardens-seal': {
      name: 'The Warden’s Seal',
      giver: 'ferro',
      requires: ['ferros-ledger'],
      objectives: [
        { type: 'kill', target: 'bulwark', n: 1 },
        { type: 'collect', item: 'seal-shard' },
        { type: 'reach', zone: 'champion-arena' },
      ],
      reward: { coins: 16 },
      unlocks: { enemies: ['bulwark-elite1'], pickups: ['seal1'] },
    },
  },
};

// --- content-authoring helpers (pure, evaluated once at module load) -------

function buildingTiles(buildings) {
  const blocked = {};
  for (const b of buildings) {
    for (let dx = 0; dx < b.w; dx++) {
      for (let dy = 0; dy < b.h; dy++) {
        blocked[`${b.x + dx},${b.y + dy}`] = 100;
      }
    }
  }
  return blocked;
}

function roadTiles(w, h, mainStreetY, marketRowX) {
  const roads = {};
  for (let x = 0; x < w; x++) roads[`${x},${mainStreetY}`] = 1;
  for (let y = 0; y < h; y++) roads[`${marketRowX},${y}`] = 1;
  return roads;
}
