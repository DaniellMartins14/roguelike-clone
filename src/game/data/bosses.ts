import type { UnitDefinition } from '../types';
import { SIZE_2X2 } from './sizes';
import { ABYSS_IDOL_TELEGRAPH } from './telegraphs';

/**
 * Mini-chefe e chefe principal: usam a lógica de combate comum (movimento ortogonal e ataque
 * corpo a corpo). O Ídolo do Abismo também tem ataques telegrafados (data/telegraphs.ts).
 */

export const GOBLIN_CHIEF: UnitDefinition = {
  id: 'goblin-chief',
  name: 'Capitão Goblin',
  team: 'monster',
  symbol: '♜',
  color: 0xb45309,
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
  maxHp: 85,
  damage: 8,
  movement: 1,
  attack: { directions: 'orthogonal', range: 1 },
  rank: 'boss',
  size: SIZE_2X2,
  telegraph: ABYSS_IDOL_TELEGRAPH,
};