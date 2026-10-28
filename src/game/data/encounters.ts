import type { EncounterType, Position, UnitDefinition } from '../types';
import { ABYSS_IDOL, GOBLIN_CHIEF, CRIMSON_COUNTESS, DRACULA } from './bosses';
import {
  CULTIST,
  INSANE,
  ACOLYTE,
  DEFORMED_DEVOTEE,
  ABYSSAL_SCALED,
  SCALED_GUARDIAN,
  RLYEH_HORROR,
} from './monsters';

/**
 * Configuração dos andares da campanha. Só dados: nada aqui conhece Phaser ou o DOM.
 */

export interface FloorConfig {
  readonly floor: number;
  readonly type: EncounterType;
  readonly name: string;
  readonly monsters: readonly UnitDefinition[];
  readonly obstacles: readonly Position[];
}

export const ENCOUNTER_LABELS: Record<EncounterType, string> = {
  normal: 'Comum',
  'mini-boss': 'Mini-chefe',
  boss: 'Chefe principal',
};

export const SPAWN_SLOTS: readonly Position[] = [
  { col: 2, row: 0 },
  { col: 3, row: 0 },
  { col: 1, row: 1 },
  { col: 4, row: 1 },
  { col: 1, row: 0 },
  { col: 4, row: 0 },
  { col: 2, row: 1 },
  { col: 3, row: 1 },
  { col: 0, row: 0 },
  { col: 5, row: 0 },
  { col: 0, row: 1 },
  { col: 5, row: 1 },
];

/** Reforça um tipo de monstro sem alterar sua identidade ou comportamento. */
function stronger(base: UnitDefinition, hp: number, damage: number): UnitDefinition {
  return { ...base, maxHp: base.maxHp + hp, damage: base.damage + damage };
}

function floor(
  number: number,
  name: string,
  monsters: readonly UnitDefinition[],
  obstacles: readonly Position[] = [],
  type: EncounterType = 'normal',
): FloorConfig {
  return { floor: number, type, name, monsters, obstacles };
}

const cultist2 = stronger(CULTIST, 2, 0);
const insane2 = stronger(INSANE, 2, 0);
const acolyte2 = stronger(ACOLYTE, 2, 0);
const devotee2 = stronger(DEFORMED_DEVOTEE, 2, 0);
const scaled2 = stronger(ABYSSAL_SCALED, 2, 0);
const guardian2 = stronger(SCALED_GUARDIAN, 2, 0);
const horror2 = stronger(RLYEH_HORROR, 2, 0);
const scaled4 = stronger(ABYSSAL_SCALED, 4, 1);
const guardian4 = stronger(SCALED_GUARDIAN, 4, 1);
const horror4 = stronger(RLYEH_HORROR, 4, 1);

export const CAMPAIGN_FLOORS: readonly FloorConfig[] = [
  floor(1, 'Portão da Masmorra', [CULTIST, INSANE]),
  floor(2, 'Corredor Escuro', [CULTIST, CULTIST, ACOLYTE]),
  floor(3, 'Sala do Ritual', [cultist2, insane2, acolyte2]),
  floor(4, 'Galeria Profana', [acolyte2, devotee2, cultist2, insane2], [
    { col: 1, row: 3 },
    { col: 4, row: 3 },
  ]),
  floor(5, 'Covil da Criatura Sombria', [GOBLIN_CHIEF, insane2, devotee2], [], 'mini-boss'),
  floor(6, 'Câmara Profunda', [ABYSSAL_SCALED, SCALED_GUARDIAN, RLYEH_HORROR]),
  floor(7, 'Ponte Quebrada', [scaled4, guardian2, horror2], [
    { col: 2, row: 3 },
    { col: 3, row: 2 },
  ]),
  floor(8, 'Salão das Sombras', [scaled2, scaled2, guardian2, horror2]),
  floor(9, 'Antecâmara do Abismo', [scaled4, guardian4, horror4, scaled4], [
    { col: 0, row: 3 },
    { col: 5, row: 3 },
  ]),
  floor(10, 'Altar do Ídolo do Abismo', [ABYSS_IDOL, scaled2, guardian2], [], 'boss'),
];