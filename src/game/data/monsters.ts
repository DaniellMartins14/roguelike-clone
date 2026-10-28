import type { UnitDefinition } from '../types';

/**
 * Monstros antigos mantidos para a batalha inicial e compatibilidade com testes.
 * Os novos tipos são usados na campanha principal.
 */
export const GOBLIN: UnitDefinition = {
  id: 'goblin',
  name: 'Goblin',
  team: 'monster',
  symbol: 'G',
  color: 0x991b1b,
  maxHp: 12,
  damage: 4,
  movement: 2,
  attack: { directions: 'orthogonal', range: 1 },
};

export const SKELETON: UnitDefinition = {
  id: 'skeleton',
  name: 'Esqueleto',
  team: 'monster',
  symbol: 'E',
  color: 0x7f1d1d,
  maxHp: 16,
  damage: 5,
  movement: 1,
  attack: { directions: 'orthogonal', range: 1 },
};

export const SLIME: UnitDefinition = {
  id: 'slime',
  name: 'Gosma',
  team: 'monster',
  symbol: 'S',
  color: 0x9f1239,
  maxHp: 14,
  damage: 3,
  movement: 1,
  attack: { directions: 'orthogonal', range: 1 },
};

export const CULTIST: UnitDefinition = {
  id: 'cultist',
  name: 'Adorador do Abismo',
  team: 'monster',
  symbol: 'A',
  color: 0x7c3aed,
  maxHp: 12,
  damage: 4,
  movement: 1,
  attack: { directions: 'orthogonal', range: 1 },
};

export const INSANE: UnitDefinition = {
  id: 'insane',
  name: 'Fanático Insano',
  team: 'monster',
  symbol: 'F',
  color: 0xb91c1c,
  maxHp: 10,
  damage: 5,
  movement: 2,
  attack: { directions: 'orthogonal', range: 1 },
};

export const ACOLYTE: UnitDefinition = {
  id: 'acolyte',
  name: 'Acólito Ritualista',
  team: 'monster',
  symbol: 'R',
  color: 0x0f766e,
  maxHp: 16,
  damage: 3,
  movement: 1,
  attack: { directions: 'orthogonal', range: 1 },
};

export const DEFORMED_DEVOTEE: UnitDefinition = {
  id: 'deformed-devotee',
  name: 'Devoto Deformado',
  team: 'monster',
  symbol: 'D',
  color: 0x64748b,
  maxHp: 18,
  damage: 5,
  movement: 1,
  attack: { directions: 'orthogonal', range: 1 },
};

export const ABYSSAL_SCALED: UnitDefinition = {
  id: 'abyssal-scaled',
  name: 'Escamoso do Abismo',
  team: 'monster',
  symbol: 'E',
  color: 0x0e7490,
  maxHp: 18,
  damage: 5,
  movement: 1,
  attack: { directions: 'orthogonal', range: 1 },
};

export const SCALED_GUARDIAN: UnitDefinition = {
  id: 'scaled-guardian',
  name: 'Guardião Escamoso',
  team: 'monster',
  symbol: 'G',
  color: 0x166534,
  maxHp: 22,
  damage: 6,
  movement: 1,
  attack: { directions: 'orthogonal', range: 1 },
};

export const RLYEH_HORROR: UnitDefinition = {
  id: 'rlyeh-horror',
  name: 'Horror de R’lyeh',
  team: 'monster',
  symbol: 'H',
  color: 0x4338ca,
  maxHp: 20,
  damage: 7,
  movement: 1,
  attack: { directions: 'orthogonal', range: 1 },
};

export const MONSTER_DEFINITIONS: readonly UnitDefinition[] = [
  GOBLIN, SKELETON, SLIME,
  CULTIST, INSANE, ACOLYTE, DEFORMED_DEVOTEE,
  ABYSSAL_SCALED, SCALED_GUARDIAN, RLYEH_HORROR,
];
