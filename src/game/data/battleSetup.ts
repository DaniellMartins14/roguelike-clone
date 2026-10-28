import type { Position, Unit, UnitDefinition } from '../types';
import { ARCHER, ASSASSIN, CLERIC, MAGE, WARRIOR } from './heroes';
import { GOBLIN, SKELETON, SLIME } from './monsters';

export interface SetupEntry {
  definition: UnitDefinition;
  position: Position;
}

export interface BattleSetup {
  units: Unit[];
  obstacles: Position[];
  /** Texto de abertura do encontro, registrado no log (por exemplo, o andar da campanha). */
  title?: string;
}

/** Cria uma batalha nova a cada chamada. O GameState a usa no início e a cada reinício. */
export type BattleFactory = () => BattleSetup;

/** Cria uma unidade com HP cheio. Heróis olham para cima; monstros, para baixo. */
export function createUnit(definition: UnitDefinition, position: Position, uid: string): Unit {
  const unit: Unit = {
    uid,
    definition,
    hp: definition.maxHp,
    maxHp: definition.maxHp,
    damage: definition.damage,
    position: { col: position.col, row: position.row },
    facing: definition.team === 'hero' ? { col: 0, row: -1 } : { col: 0, row: 1 },
    abilityUsed: false,
    stunned: false,
  };
  // Chefes com ataques telegrafados começam o rodízio do primeiro ataque, sem pausa.
  if (definition.telegraph) unit.telegraph = { cooldown: 0, nextAttack: 0 };
  return unit;
}

/**
 * Formação inicial dos heróis em todo encontro (coluna 0-5, linha 0-5; linha 0 é o topo).
 * A ordem define os uids (`warrior-0`, `assassin-1`...) e a ordem em que atacam.
 */
export const HERO_FORMATION: readonly SetupEntry[] = [
  { definition: WARRIOR, position: { col: 2, row: 4 } },
  { definition: ASSASSIN, position: { col: 4, row: 4 } },
  { definition: ARCHER, position: { col: 1, row: 5 } },
  { definition: MAGE, position: { col: 3, row: 5 } },
  { definition: CLERIC, position: { col: 2, row: 5 } },
];

/** Batalha avulsa usada pelo GameState quando não há campanha (e pelos testes). */
const FIRST_BATTLE: readonly SetupEntry[] = [
  ...HERO_FORMATION,
  // Monstros
  { definition: GOBLIN, position: { col: 1, row: 1 } },
  { definition: SKELETON, position: { col: 4, row: 1 } },
  { definition: SLIME, position: { col: 2, row: 0 } },
];

/**
 * Obstáculos bloqueiam movimento e ataques. A primeira batalha não tem nenhum;
 * para testar, adicione por exemplo { col: 3, row: 3 }.
 */
const FIRST_BATTLE_OBSTACLES: readonly Position[] = [];

export function createInitialBattle(): BattleSetup {
  return {
    units: FIRST_BATTLE.map((entry, index) =>
      createUnit(entry.definition, entry.position, `${entry.definition.id}-${index}`),
    ),
    obstacles: FIRST_BATTLE_OBSTACLES.map((cell) => ({ col: cell.col, row: cell.row })),
  };
}