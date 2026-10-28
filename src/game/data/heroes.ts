import type { UnitDefinition } from '../types';
import {
  AMBUSH,
  EXURA,
  FIREBALL,
  PIERCING_SHOT,
  STOMP,
} from '../core/abilities';

 /* `movement` é a distância de movimentação por ação (em qualquer direção, inclusive diagonal,
 * porque todos os heróis usam movementDirections: 'all'). `attack.range` é o alcance do ataque
 * e não tem relação com o movimento.
 */

export const WARRIOR: UnitDefinition = {
  id: 'warrior',
  name: 'Guerreiro',
  team: 'hero',
  symbol: '⚔',
  color: 0x3b82f6,
  maxHp: 30,
  damage: 6,
  movement: 1,
  movementDirections: 'all',
  attack: { directions: 'orthogonal', range: 1 },
  ability: STOMP,
};

export const ASSASSIN: UnitDefinition = {
  id: 'assassin',
  name: 'Assassino',
  team: 'hero',
  symbol: '☠',
  color: 0x7c3aed,
  maxHp: 18,
  damage: 8,
  movement: 1,
  movementDirections: 'all',
  attack: { directions: 'diagonal', range: 1 },
  ability: AMBUSH,
};

export const ARCHER: UnitDefinition = {
  id: 'archer',
  name: 'Arqueiro',
  team: 'hero',
  symbol: '➶',
  color: 0xf97316,
  maxHp: 20,
  damage: 5,
  movement: 1,
  movementDirections: 'all',
  attack: { directions: 'orthogonal', range: 3 },
  ability: PIERCING_SHOT,
};

export const MAGE: UnitDefinition = {
  id: 'mage',
  name: 'Mago',
  team: 'hero',
  symbol: '✦',
  color: 0x06b6d4,
  maxHp: 16,
  damage: 7,
  movement: 2,
  movementDirections: 'all',
  attack: { shape: 'cross', directions: 'facing', range: 3 },
  ability: FIREBALL,
};

export const CLERIC: UnitDefinition = {
  id: 'cleric',
  name: 'Clérigo',
  team: 'hero',
  symbol: '✚',
  color: 0xec4899,
  maxHp: 22,
  damage: 4,
  movement: 1,
  movementDirections: 'all',
  attack: { directions: 'diagonal', range: 3 },
  ability: EXURA,
};

export const HERO_DEFINITIONS: readonly UnitDefinition[] = [WARRIOR, ASSASSIN, ARCHER, MAGE, CLERIC];