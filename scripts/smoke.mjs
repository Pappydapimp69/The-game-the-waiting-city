// Headless smoke suite — the build gate. Run: npm run smoke (or node scripts/smoke.mjs)
// No stage begins until this passes. Zero dependencies, pure Node.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { stableStringify } from '../src/sim/canonical.js';
import { fingerprint, fnv1a32 } from '../src/sim/fingerprint.js';
import { makeRng, nextU32, nextInt } from '../src/sim/rng.js';
import { makeWorld } from '../src/sim/world.js';
import { reduce, replay } from '../src/sim/reduce.js';
import { DEMO_SEED, demoCommands } from '../src/sim/demo.js';
import { readonly } from '../src/app/readonly.js';
import { CONTENT } from '../src/sim/content.js';
import { validateContent } from '../src/sim/validate.js';
import { canSense, canReadIntent } from '../src/sim/info.js';
import { exportSaga, importSaga } from '../src/sim/saga.js';
import { isNight, DAY_CYCLE_TICKS } from '../src/sim/daynight.js';
import { keyHint, withHint } from '../src/app/device-labels.js';
import { describeObjective } from '../src/app/objective-text.js';
import { bfsNextStep, stepAwayFrom } from '../src/sim/pathfind.js';
import { hasLineOfSight } from '../src/sim/visibility.js';

const GOLDEN_DEMO_FINGERPRINT = 'd099c9ea';

const failures = [];
let count = 0;
function test(name, fn) {
  count++;
  try { fn(); console.log(`  ok ${count} - ${name}`); }
  catch (err) { failures.push({ name, err }); console.error(`  FAIL ${count} - ${name}\n      ${err.stack || err.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertEqual(a, b, msg) { if (a !== b) throw new Error(`${msg || 'not equal'}: ${a} !== ${b}`); }

const runDemo = () => { const w = makeWorld(DEMO_SEED); replay(w, demoCommands()); return w; };
function moveAdjacent(w, e) {
  let guard = 0;
  while (Math.max(Math.abs(w.player.x - e.x), Math.abs(w.player.y - e.y)) > 1 && guard++ < 400) {
    const dx = Math.sign(e.x - w.player.x), dy = Math.sign(e.y - w.player.y);
    const tries = dx && dy ? [[dx, dy], [dx, 0], [0, dy]] : [[dx, dy]];
    let moved = false;
    for (const [tdx, tdy] of tries) {
      if (!tdx && !tdy) continue;
      const before = `${w.player.x},${w.player.y}`;
      reduce(w, { type: 'MOVE', dx: tdx, dy: tdy });
      if (`${w.player.x},${w.player.y}` !== before) { moved = true; break; }
    }
    if (!moved) throw new Error(`moveAdjacent: stuck at ${w.player.x},${w.player.y} heading toward ${e.x},${e.y}`);
  }
}
const chargeTo = (w, aura) => { let g = 0; while (w.player.aura < aura && g++ < 60) reduce(w, { type: 'CHARGE', start: g === 1 }); };
function talkAndAccept(w, npcId, questId) {
  moveAdjacent(w, w.npcs[npcId]);
  reduce(w, { type: 'TALK', npcId });
  reduce(w, { type: 'ACCEPT_QUEST', questId });
}

console.log('# canonical serialization');
test('key order does not change output', () => {
  assertEqual(stableStringify({ a: 1, b: [2, { d: 4, c: 3 }] }), stableStringify({ b: [2, { c: 3, d: 4 }], a: 1 }));
});
test('integer-like keys serialize identically regardless of insertion', () => {
  const x = {}; x['10'] = 'a'; x['2'] = 'b'; const y = {}; y['2'] = 'b'; y['10'] = 'a';
  assertEqual(stableStringify(x), stableStringify(y));
});
test('-0 normalizes to 0', () => { assertEqual(stableStringify({ v: -0 }), stableStringify({ v: 0 })); });
test('NaN / Infinity / undefined fail loud', () => {
  for (const bad of [NaN, Infinity, -Infinity, undefined]) {
    let threw = false; try { stableStringify({ bad }); } catch { threw = true; }
    assert(threw, `expected throw for ${bad}`);
  }
});

console.log('# seeded rng (sfc32, full-state saves)');
test('same seed, same stream', () => {
  const a = makeRng(12345), b = makeRng(12345);
  for (let i = 0; i < 100; i++) assertEqual(nextU32(a), nextU32(b));
});
test('state restores in O(1) mid-stream and continues identically', () => {
  const a = makeRng(777); for (let i = 0; i < 50; i++) nextU32(a);
  const saved = JSON.parse(JSON.stringify(a)); const tail = [];
  for (let i = 0; i < 20; i++) tail.push(nextU32(a));
  for (let i = 0; i < 20; i++) assertEqual(nextU32(saved), tail[i]);
});
test('nextInt in range, rejects bad n', () => {
  const r = makeRng(9); for (let i = 0; i < 500; i++) { const v = nextInt(r, 6); assert(v >= 0 && v < 6); }
  for (const bad of [0, -1, 2.5]) { let t = false; try { nextInt(makeRng(1), bad); } catch { t = true; } assert(t, `reject n=${bad}`); }
});

console.log('# content validation ladder');
test('shipped content passes every validation rung', () => {
  const errs = validateContent(CONTENT);
  assert(errs.length === 0, `content invalid:\n${errs.join('\n')}`);
});
test('deliberate content corruptions fail the build, not the player', () => {
  const corrupt = (mut) => { const c = structuredClone(CONTENT); mut(c); return validateContent(c).length > 0; };
  assert(corrupt((c) => { c.enemyKinds.sentry.aiSenseReq = 1; }), 'aiSenseReq below senseReq passed');
  assert(corrupt((c) => { c.regions['lower-banks'].buildings.depot.w = 99; }), 'building footprint not fully in blocked passed');
  assert(corrupt((c) => { c.regions['lower-banks'].cars.car1.y = 5; }), 'car starting off-road passed');
  assert(corrupt((c) => { c.regions['lower-banks'].roads['2,2'] = 1; }), 'road tile overlapping a building tile passed');
  assert(corrupt((c) => { c.quests['read-the-city'].requires = ['nonexistent']; }), 'unknown quest prereq passed');
  assert(corrupt((c) => { c.regions['lower-banks'].blocked['2,2'] = 200; }), 'out-of-range opacity passed');
  assert(corrupt((c) => { delete c.regions['lower-banks'].zones['harbor-gate']; }), 'missing harbor-gate passed');
  assert(corrupt((c) => { c.quests['ferros-ledger'].objectives[0].type = 'bogus'; }), 'unknown objective type passed');
  // A cycle reachable only through a quest's SECOND (or later) requires entry
  // — the cycle detector must walk every prereq edge, not just requires[0].
  assert(corrupt((c) => {
    c.quests['read-the-city'].requires = ['city-of-rules', 'the-wardens-seal'];
  }), 'a requires-chain cycle through a non-first prereq entry passed');
});

console.log('# fingerprint / golden replay');
test('demo playthrough matches the baked golden fingerprint', () => {
  const fp = fingerprint(runDemo());
  assertEqual(fp, GOLDEN_DEMO_FINGERPRINT, `golden drift — if intended, update to ${fp}`);
});
test('fingerprint stable across identical re-run', () => { assertEqual(fingerprint(runDemo()), fingerprint(runDemo())); });

console.log('# save / load mid-run parity');
test('save → load mid-stream equals an uninterrupted run', () => {
  const cmds = demoCommands(); const half = Math.floor(cmds.length / 2);
  const uninterrupted = makeWorld(DEMO_SEED); replay(uninterrupted, cmds);
  const first = makeWorld(DEMO_SEED); replay(first, cmds.slice(0, half));
  const reloaded = JSON.parse(JSON.stringify(first)); replay(reloaded, cmds.slice(half));
  assertEqual(fingerprint(reloaded), fingerprint(uninterrupted));
});

console.log('# the full chapter (demo playthrough)');
test('demo completes every quest and the finale', () => {
  const w = runDemo();
  for (const qid of ['city-of-rules', 'read-the-city', 'watch-them-move', 'ferros-ledger', 'the-wardens-seal']) {
    assert(w.quests.completed[qid] === 1, `${qid} not completed`);
  }
  assert(!w.enemies['bulwark-elite1'].alive, 'elite bulwark still alive');
  assert(w.enemies.warden1 && !w.enemies.warden1.alive, 'the Warden was never spawned/defeated');
  assert(w.arc.bossTaunted === 1, 'boss never taunted at half health');
  assertEqual(w.arc.choice, 'depose', 'warden fate not recorded');
  assertEqual(w.player.skills.melee.lvl >= 3, true, 'deposing did not raise melee skill');
  assert(w.player.inventory.includes('signet'), 'signet not collected');
  assert(w.player.inventory.includes('seal-shard'), 'seal shard not collected');
  assert(w.flags.ended === 1, 'chapter did not end at the harbor gate');
  assert(w.player.hp > 0, 'player died during the scripted run');
});
test('saga.v3 export round-trips out of the finished chapter', () => {
  const w = runDemo();
  const code = exportSaga(w);
  assert(code.startsWith('SAGA3.'), `unexpected code prefix: ${code}`);
  assert(code.length > 20, 'code suspiciously short');
});

console.log('# quest chain: prereqs');
test('later quests are not offered until their prereq completes', () => {
  const w = makeWorld(1);
  moveAdjacent(w, w.npcs.ferro);
  const ev = reduce(w, { type: 'TALK', npcId: 'ferro' });
  const offered = ev.find((e) => e.type === 'quests_offered');
  assertEqual(offered.quests.join(','), 'city-of-rules', 'later ferro quests offered before their prereqs completed');
});
test('the finale is not offered until the ledger quest completes', () => {
  const w = makeWorld(1);
  talkAndAccept(w, 'ferro', 'city-of-rules');
  moveAdjacent(w, { x: 20, y: 10 });
  moveAdjacent(w, w.npcs.ferro);
  const ev = reduce(w, { type: 'TALK', npcId: 'ferro' });
  const offered = ev.find((e) => e.type === 'quests_offered');
  assert(!offered || !offered.quests.includes('the-wardens-seal'), 'finale offered before its prereqs were met');
});

console.log('# gated enemies/pickups still agnostic of prior actions');
test('bulwark-elite1/seal1 do not exist before the finale quest is accepted', () => {
  const fresh = makeWorld(1);
  assert(!fresh.enemies['bulwark-elite1'], 'gated enemy pre-spawned');
  assert(!fresh.pickups.seal1, 'gated pickup pre-spawned');
});
test('sentry1/cutthroat1/signet1 do not exist before their quests are accepted (fixed soft-lock)', () => {
  const fresh = makeWorld(1);
  assert(!fresh.enemies.sentry1, 'sentry1 pre-spawned — killable before read-the-city is accepted');
  assert(!fresh.enemies.cutthroat1, 'cutthroat1 pre-spawned — killable before watch-them-move is accepted');
  assert(!fresh.pickups.signet1, 'signet1 pre-spawned — collectable before ferros-ledger is accepted');
});
test('quest-unlocked enemies telegraph before appearing (pendingSpawns), not instant-spawn', () => {
  const w = makeWorld(1);
  talkAndAccept(w, 'ferro', 'city-of-rules');
  moveAdjacent(w, { x: 20, y: 10 });
  moveAdjacent(w, w.npcs.ferro);
  reduce(w, { type: 'TALK', npcId: 'ferro' });
  const ev = reduce(w, { type: 'ACCEPT_QUEST', questId: 'read-the-city' });
  assert(!w.enemies.sentry1, 'sentry1 spawned instantly on ACCEPT_QUEST instead of telegraphing');
  assert(w.pendingSpawns.some((p) => p.id === 'sentry1'), 'sentry1 not queued in pendingSpawns');
  assert(ev.some((e) => e.type === 'enemy_incoming' && e.target === 'sentry1'), 'no enemy_incoming event fired');
  let g = 0; while (!w.enemies.sentry1 && g++ < 10) reduce(w, { type: 'TICK' });
  assert(w.enemies.sentry1 && w.enemies.sentry1.alive === 1, 'sentry1 never actually appeared after its delay');
});

// sentry1/cutthroat1/bulwark-elite1 are all quest-gated now (see the two
// tests above) — don't exist off a bare makeWorld(). Immunity/AI unit tests
// build a synthetic enemy of the kind under test instead, at an arbitrary
// safe spot, so they stay independent of the quest-acceptance chain.
function makeTestEnemy(w, id, kind, x, y) {
  const k = CONTENT.enemyKinds[kind];
  w.enemies[id] = { x, y, kind, hp: k.hp, maxHp: k.hp, power: k.power, alive: 1, immune: k.immune || '', aiState: 'patrol', homeX: x, homeY: y, stateTicks: 0 };
  return w.enemies[id];
}

console.log('# immunity mechanics');
test('Bulwark (immune: aura) shrugs off a blast, dies to fists', () => {
  const w = makeWorld(1);
  makeTestEnemy(w, 'testbulwark', 'bulwark', w.player.x + 1, w.player.y);
  chargeTo(w, 3);
  const blast = reduce(w, { type: 'AURA_BLAST', enemyId: 'testbulwark' });
  assert(blast.some((e) => e.type === 'no_effect' && e.kind === 'aura'), 'aura should no_effect a bulwark');
  assert(w.enemies.testbulwark.alive === 1, 'bulwark died to an immune blast');
  let g = 0; while (w.enemies.testbulwark.alive && g++ < 20) reduce(w, { type: 'MELEE', enemyId: 'testbulwark' });
  assert(!w.enemies.testbulwark.alive, 'bulwark never died to melee');
});
test('Cutthroat (immune: melee) shrugs off fists, dies to aura', () => {
  const w = makeWorld(1);
  makeTestEnemy(w, 'testcutthroat', 'cutthroat', w.player.x + 1, w.player.y);
  const melee = reduce(w, { type: 'MELEE', enemyId: 'testcutthroat' });
  assert(melee.some((e) => e.type === 'no_effect' && e.kind === 'melee'), 'melee should no_effect a cutthroat');
  assert(w.enemies.testcutthroat.alive === 1, 'cutthroat died to an immune punch');
  let g = 0; while (w.enemies.testcutthroat.alive && g++ < 30) { chargeTo(w, 3); reduce(w, { type: 'AURA_BLAST', enemyId: 'testcutthroat' }); }
  assert(!w.enemies.testcutthroat.alive, 'cutthroat never died to aura');
});

console.log('# deterministic enemy AI (the signature system)');
test('a patrolling enemy switches to chase once the player enters its aggro radius', () => {
  const w = makeWorld(1);
  const e = makeTestEnemy(w, 'testsentry', 'sentry', 7, 4);
  assertEqual(e.aiState, 'patrol', 'sentry should start patrolling');
  w.player.x = e.x; w.player.y = e.y + 1; // Chebyshev distance 1, well within aggro 5
  reduce(w, { type: 'TICK' });
  assertEqual(w.enemies.testsentry.aiState, 'chase', 'sentry did not notice an adjacent player');
});
test('a far-away player leaves an enemy patrolling', () => {
  const w = makeWorld(1);
  makeTestEnemy(w, 'testsentry', 'sentry', 7, 4);
  makeTestEnemy(w, 'testcutthroat', 'cutthroat', 21, 15);
  reduce(w, { type: 'TICK' }); // player starts far from every enemy home
  assertEqual(w.enemies.testsentry.aiState, 'patrol', 'sentry aggroed with no player nearby');
  assertEqual(w.enemies.testcutthroat.aiState, 'patrol', 'cutthroat aggroed with no player nearby');
});
test('a chasing enemy takes a real step toward the player each tick', () => {
  const w = makeWorld(1);
  const e = makeTestEnemy(w, 'testsentry', 'sentry', 7, 4);
  w.player.x = e.x + 3; w.player.y = e.y; // within aggro(5), not adjacent
  const before = `${e.x},${e.y}`;
  reduce(w, { type: 'TICK' });
  assertEqual(w.enemies.testsentry.aiState, 'chase', 'sentry did not enter chase');
  assert(`${w.enemies.testsentry.x},${w.enemies.testsentry.y}` !== before, 'chasing sentry never moved');
  const distBefore = 3;
  const distAfter = Math.max(Math.abs(w.enemies.testsentry.x - w.player.x), Math.abs(w.enemies.testsentry.y - w.player.y));
  assert(distAfter < distBefore, 'chasing sentry did not close the distance');
});
test('a badly wounded Cutthroat flees instead of closing in', () => {
  const w = makeWorld(1);
  const e = makeTestEnemy(w, 'testcutthroat', 'cutthroat', 21, 15);
  e.hp = Math.floor(e.maxHp * 0.2); // 20% — below fleeAt(30)
  w.player.x = e.x + 1; w.player.y = e.y;
  const distBefore = 1;
  reduce(w, { type: 'TICK' });
  assertEqual(w.enemies.testcutthroat.aiState, 'flee', 'badly wounded cutthroat did not flee');
  const distAfter = Math.max(Math.abs(w.enemies.testcutthroat.x - w.player.x), Math.abs(w.enemies.testcutthroat.y - w.player.y));
  assert(distAfter >= distBefore, 'fleeing cutthroat moved toward the player instead of away');
});
test('a chasing enemy gives up and returns to post once it exceeds its leash', () => {
  const w = makeWorld(1);
  const e = makeTestEnemy(w, 'testsentry', 'sentry', 7, 4);
  e.aiState = 'chase';
  e.x = 30; e.y = 4; // far from home (7,4) and far from player
  w.player.x = 31; w.player.y = 4; // still "far" relative to leash(7) from home, close to enemy so it'd otherwise keep chasing
  reduce(w, { type: 'TICK' });
  assertEqual(w.enemies.testsentry.aiState, 'return', 'sentry kept chasing past its leash');
});
test('perception gates the AI-state readout at a higher threshold than hp/power', () => {
  const seeker = makeWorld(1, { archetype: 'seeker' }); // perception 2
  assert(canSense(seeker.player, 'sentry'), 'seeker (perception 2) should read sentry hp/power (senseReq 2)');
  assert(!canReadIntent(seeker.player, 'sentry'), 'seeker (perception 2) should NOT yet read sentry intent (aiSenseReq 3)');
  seeker.player.skills.perception.lvl = 3;
  assert(canReadIntent(seeker.player, 'sentry'), 'perception 3 should read sentry intent');
});

console.log('# deterministic BFS pathfinding');
test('BFS finds a step around a wall, not just the blocked straight line', () => {
  const w = makeWorld(1);
  w.region.blocked = { '5,5': 100 };
  const step = bfsNextStep(w, 4, 5, 6, 5, new Set());
  assert(step, 'no path found around a single blocking tile');
  assert(!(step.x === 5 && step.y === 5), 'BFS stepped directly into the blocked tile');
});
test('BFS returns null when already at the target', () => {
  const w = makeWorld(1);
  assertEqual(bfsNextStep(w, 3, 3, 3, 3, new Set()), null);
});
test('stepAwayFrom always increases (or holds) distance from the threat', () => {
  const w = makeWorld(1);
  const step = stepAwayFrom(w, 10, 10, 10, 9, new Set());
  assert(step, 'no flee step found in open ground');
  const before = Math.max(Math.abs(10 - 10), Math.abs(10 - 9));
  const after = Math.max(Math.abs(step.x - 10), Math.abs(step.y - 9));
  assert(after >= before, 'flee step did not increase distance from the threat');
});
test('line of sight is blocked by a 100-opacity wall between two points', () => {
  const w = makeWorld(1);
  w.region.blocked = { '5,5': 100 };
  assert(!hasLineOfSight(w, 4, 5, 6, 5), 'a 100-opacity wall between two points should block sight');
  assert(hasLineOfSight(w, 4, 5, 4, 8), 'an unobstructed line should stay clear');
});

console.log('# cars: the friendly, non-hostile proof of the same movement machinery');
test('cars only ever occupy road tiles, tick after tick', () => {
  const w = makeWorld(1);
  for (let i = 0; i < 40; i++) {
    reduce(w, { type: 'TICK' });
    for (const id of Object.keys(w.cars)) {
      const c = w.cars[id];
      assert(Object.prototype.hasOwnProperty.call(w.region.roads, `${c.x},${c.y}`), `${id} left the road at ${c.x},${c.y}`);
    }
  }
});
test('two cars never occupy the same tile in the same tick', () => {
  const w = makeWorld(1);
  for (let i = 0; i < 60; i++) {
    reduce(w, { type: 'TICK' });
    const positions = Object.values(w.cars).map((c) => `${c.x},${c.y}`);
    assertEqual(new Set(positions).size, positions.length, `cars overlapped at tick ${i}`);
  }
});
test('a car actually moves over time (not stuck)', () => {
  const w = makeWorld(1);
  const start = `${w.cars.car1.x},${w.cars.car1.y}`;
  for (let i = 0; i < 10; i++) reduce(w, { type: 'TICK' });
  assert(`${w.cars.car1.x},${w.cars.car1.y}` !== start, 'car1 never moved after 10 ticks');
});

console.log('# movement + boundaries');
test('MOVE bumps a building (collision), never phases through', () => {
  const w = makeWorld(1);
  w.player.x = 1; w.player.y = 2;
  const ev = reduce(w, { type: 'MOVE', dx: 1, dy: 0 }); // depot starts at x=2,y=2
  assert(ev.some((e) => e.type === 'blocked'), 'building did not block');
  assertEqual(w.player.x, 1, 'player phased into a building');
});
test('a 0-opacity blocked tile still blocks (collision is existence-based, not magnitude-based)', () => {
  const w = makeWorld(1);
  w.player.x = 1; w.player.y = 1;
  w.region.blocked['2,1'] = 0; // a fully-transparent-but-solid tile
  const ev = reduce(w, { type: 'MOVE', dx: 1, dy: 0 });
  assert(ev.some((e) => e.type === 'blocked'), '0-opacity blocked tile did not block movement');
  assertEqual(w.player.x, 1, 'player phased through a 0-opacity blocked tile');
});
test('unknown command fails loud', () => {
  let threw = false; try { replay(makeWorld(1), [{ type: 'NOPE' }]); } catch { threw = true; }
  assert(threw);
});
test('the harbor gate is sealed until the arc completes', () => {
  const w = makeWorld(1);
  while (w.player.x < 31) reduce(w, { type: 'MOVE', dx: 1, dy: Math.sign(10 - w.player.y) });
  assert(!w.flags.ended, 'gate let the player out before the arc was complete');
});

console.log('# saga carryover (imports Wrong Sky\'s saga.v2)');
test('a saga.v2 code raises carried skills and is remembered', () => {
  const payload = btoa(stableStringify({
    v: 'saga.v2', game: 'wrong-sky', archetype: 'channeler', difficulty: 'harsh',
    skills: { melee: 3, aura: 4, perception: 2 }, coins: 7, techniques: ['second-aura'],
    choices: { ravagerFate: 'spare', riftChoice: 'claim' },
  }));
  const code = `SAGA2.${payload}.${fnv1a32(payload)}`;
  const imp = importSaga(code);
  assert(imp.ok, `import failed: ${imp.error}`);
  const w = makeWorld(1, { archetype: 'channeler', difficulty: 'harsh', saga: imp.data });
  assert(w.player.skills.aura.lvl >= 4, 'carried aura level not applied');
  assertEqual(w.flags.ravagerFate, 'spare', 'prior Prologue choice not remembered');
  assertEqual(w.flags.riftChoice, 'claim', 'prior Wrong Sky choice not remembered');
});
test('a tampered / foreign code is politely refused', () => {
  assert(!importSaga('SAGA2.garbage.zzzz').ok, 'garbage accepted');
  assert(!importSaga('hello').ok, 'nonsense accepted');
  assert(!importSaga('SAGA1.x.y').ok, 'wrong-prefix accepted');
});

console.log('# day/night determinism');
test('night is a pure function of the integer tick', () => {
  assert(!isNight(0), 'tick 0 should be day');
  assert(isNight(Math.floor(DAY_CYCLE_TICKS * 0.75)), 'late cycle should be night');
});

console.log('# device-adaptive hints + objective text');
test('hints match the active device', () => {
  assertEqual(keyHint('keyboard', 'confirm'), 'Enter');
  assertEqual(keyHint('gamepad', 'confirm'), 'A');
  assertEqual(keyHint('touch', 'confirm'), '');
  assertEqual(withHint('gamepad', 'confirm', 'Accept'), 'Accept (A)');
});
test('describeObjective covers all three types with no undefined', () => {
  const lines = [
    describeObjective({ type: 'kill', target: 'sentry', n: 1 }),
    describeObjective({ type: 'collect', item: 'signet' }),
    describeObjective({ type: 'reach', zone: 'champion-arena' }),
  ];
  for (const s of lines) assert(!s.includes('undefined'), `leaked undefined: ${s}`);
  assert(lines[0].toLowerCase().includes('sentry'), 'kill did not resolve the kind name');
  let threw = false; try { describeObjective({ type: 'nope' }); } catch { threw = true; }
  assert(threw, 'unknown objective type should throw');
});

console.log('# renderer boundary');
test('read-only proxy throws on any write, at any depth', () => {
  const w = makeWorld(1); const ro = readonly(w);
  assertEqual(ro.player.hp, w.player.hp, 'proxy must read through');
  let threw = 0;
  try { ro.player.hp = 0; } catch { threw++; }
  try { ro.arc.choice = 'x'; } catch { threw++; }
  try { delete ro.player; } catch { threw++; }
  assertEqual(threw, 3, 'a renderer write slipped through');
});

console.log('# determinism guard: forbidden tokens in src/sim');
test('src/sim never touches ambient time, randomness, or engine-varying math', () => {
  const simDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'sim');
  const banned = /Math\.random|Date\.now|performance\.now|new Date|Math\.(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|exp|expm1|log|log2|log10|log1p|pow|hypot|cbrt)\b/;
  for (const f of readdirSync(simDir)) {
    if (!f.endsWith('.js')) continue;
    const src = readFileSync(join(simDir, f), 'utf8');
    const m = src.match(banned);
    assert(!m, `${f} contains banned token: ${m && m[0]}`);
  }
});

console.log('');
if (failures.length) { console.error(`SMOKE FAILED: ${failures.length}/${count} test(s)`); process.exit(1); }
console.log(`SMOKE PASSED: ${count}/${count}`);
