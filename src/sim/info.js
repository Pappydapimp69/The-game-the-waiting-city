// Skill-gated information: what the player can PERCEIVE is a progression
// reward. The same world renders differently per build — a Seeker reads a
// guard's exact strength (and, one tier higher, its CURRENT INTENT) before a
// Brawler can. Pure read helpers; the renderer consumes these, the sim
// never depends on them.
//
// Two tiers, both gated by the same `perception` skill: `senseReq` (existing,
// carried from the earlier games — exact hp/power) and the NEW `aiSenseReq`
// (always >= senseReq — you learn to read a fight before you learn to read a
// mind) which reveals the enemy's live AI state. This is the game's
// signature system: not a new mystical mechanic, just the trilogy's existing
// perception skill growing a second tier of readable information as it
// levels — "the enemies got smart" becomes "you got better at reading them."

import { CONTENT } from './content.js';

export function canSense(player, enemyKind) {
  const kind = CONTENT.enemyKinds[enemyKind];
  if (!kind) return false;
  return player.skills.perception.lvl >= kind.senseReq;
}

export function canReadIntent(player, enemyKind) {
  const kind = CONTENT.enemyKinds[enemyKind];
  if (!kind) return false;
  return player.skills.perception.lvl >= kind.aiSenseReq;
}

// What the player sees above an enemy's head.
export function enemyReadout(player, enemy) {
  const kind = CONTENT.enemyKinds[enemy.kind];
  if (!enemy.alive) return '';
  if (!canSense(player, enemy.kind)) return '???';
  const base = `${kind.name} ${enemy.hp}/${enemy.maxHp} · pw ${enemy.power}`;
  if (!canReadIntent(player, enemy.kind)) return base;
  return `${base} · ${AI_LABELS[enemy.aiState] || enemy.aiState}`;
}

const AI_LABELS = {
  patrol: 'watching',
  chase: 'closing in',
  attack: 'engaged',
  return: 'standing down',
  flee: 'breaking off',
};
