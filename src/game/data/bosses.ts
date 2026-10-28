import type { UnitDefinition } from '../types';
import { SIZE_2X2 } from './sizes';
import { ABYSS_IDOL_TELEGRAPH, CRIMSON_COUNTESS_TELEGRAPH, DRACULA_TELEGRAPH } from './telegraphs';

/**
 * Mini-chefe e chefe principal: usam a lógica de combate comum (movimento ortogonal e ataque
 * corpo a corpo). O Ídolo do Abismo também tem ataques telegrafados (data/telegraphs.ts).
 */

export const GOBLIN_CHIEF: UnitDefinition = {
  id: 'shadow-creature',
  name: 'Criatura Sombria',
  team: 'monster',
  symbol: '♜',
  color: 0x4b5563,
  maxHp: 48,
  damage: 6,
  movement: 2,
  attack: { directions: 'orthogonal', range: 1 },
  rank: 'mini-boss',
};

export const ABYSS_IDOL: UnitDefinition = {
  id: 'abyss-idol',
  name: 'Ídolo do Abismo',
  team: 'monster',
  symbol: '♛',
  color: 0x4c1d95,
  maxHp: 170,
  damage: 8,
  movement: 1,
  attack: { directions: 'orthogonal', range: 1 },
  rank: 'boss',
  size: SIZE_2X2,
  telegraph: ABYSS_IDOL_TELEGRAPH,
};

export const CRIMSON_COUNTESS: UnitDefinition = {
  id: 'crimson-countess', name: 'Condessa Carmesim', team: 'monster', symbol: '♕', color: 0xbe123c,
  maxHp: 125, damage: 14, movement: 2,
  attack: { directions: 'orthogonal', range: 1 },
  rank: 'mini-boss', telegraph: CRIMSON_COUNTESS_TELEGRAPH,
};

export const DRACULA: UnitDefinition = {
  id: 'dracula', name: 'Drácula, Senhor da Noite', team: 'monster', symbol: '♛', color: 0x7f1d1d,
  maxHp: 480, damage: 18, movement: 2,
  attack: { directions: 'orthogonal', range: 1 },
  rank: 'boss', telegraph: DRACULA_TELEGRAPH,
};
