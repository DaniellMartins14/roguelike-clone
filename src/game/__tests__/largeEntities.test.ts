import { describe, expect, it } from 'vitest';
import { Campaign } from '../core/Campaign';
import type { GameState } from '../core/GameState';
import { stompTargets, ambushDestinations, pierceTargets } from '../core/abilities';
import { chooseMonsterMove } from '../core/ai';
import {
  findPlacementProblems,
  footprintCells,
  footprintFits,
  isSupportedSize,
  occupies,
  positionKey,
  sizeOf,
  unitCells,
  unitDistance,
} from '../core/board';
import { findAttackTargets } from '../core/combat';
import { buildEncounter, createParty, validateFloor } from '../core/encounter';
import { chooseTelegraphTarget } from '../core/telegraph';
import { ABYSS_IDOL, GOBLIN_CHIEF } from '../data/bosses';
import { CAMPAIGN_FLOORS } from '../data/encounters';
import type { FloorConfig } from '../data/encounters';
import { ARCHER, ASSASSIN, CLERIC, HERO_DEFINITIONS, MAGE, WARRIOR } from '../data/heroes';
import { GOBLIN, MONSTER_DEFINITIONS, SKELETON, SLIME } from '../data/monsters';
import { SIZE_1X1, SIZE_2X2 } from '../data/sizes';
import type { Position, TelegraphedAttack, UnitDefinition } from '../types';
import { castAbility, context, stateWith, unit, uids } from './helpers';

const cell = (col: number, row: number): Position => ({ col, row });
const keys = (cells: readonly Position[]) => cells.map(positionKey).sort();

/** Criaturas grandes SÓ para teste: nenhuma entidade do jogo é 2×2 nesta etapa. */
const COLOSSUS: UnitDefinition = {
  ...SKELETON,
  id: 'colossus',
  name: 'Colosso',
  maxHp: 60,
  damage: 5,
  movement: 1,
  size: SIZE_2X2,
};
const BIG_WARRIOR: UnitDefinition = { ...WARRIOR, id: 'big-warrior', name: 'Guerreiro Gigante', size: SIZE_2X2 };

function find(state: GameState, id: string) {
  const found = state.roster.find((u) => u.definition.id === id);
  if (!found) throw new Error(`unidade não encontrada: ${id}`);
  return found;
}

// ---------------------------------------------------------------------------------------------
describe('Tamanho e área ocupada', () => {
it('o Ídolo do Abismo é 2×2 e as demais entidades mantêm o tamanho padrão', () => {
  const everyone = [
    ...HERO_DEFINITIONS,
    ...MONSTER_DEFINITIONS,
    ABYSS_IDOL,
    GOBLIN_CHIEF,
    ...CAMPAIGN_FLOORS.flatMap((floor) => floor.monsters),
  ];

  for (const definition of everyone) {
    if (definition.id === 'abyss-idol') {
      expect(sizeOf(definition)).toEqual(SIZE_2X2);
    } else {
      expect(definition.size === undefined).toBe(true);
      expect(sizeOf(definition)).toEqual(SIZE_1X1);
    }
  }
});


  it('uma entidade 2×2 ocupa exatamente quatro casas distintas, a partir da casa superior esquerda', () => {
    const colossus = unit(COLOSSUS, 2, 3);
    expect(keys(unitCells(colossus))).toEqual(keys([cell(2, 3), cell(3, 3), cell(2, 4), cell(3, 4)]));
    for (const own of unitCells(colossus)) expect(occupies(colossus, own)).toBe(true);
    for (const other of [cell(1, 3), cell(4, 3), cell(2, 2), cell(2, 5), cell(4, 5)]) {
      expect(occupies(colossus, other)).toBe(false);
    }
    expect(footprintCells(cell(0, 0), SIZE_2X2)).toHaveLength(4);
  });

  it('só 1×1 e 2×2 são tamanhos suportados', () => {
    expect(isSupportedSize(SIZE_1X1)).toBe(true);
    expect(isSupportedSize(SIZE_2X2)).toBe(true);
    expect(isSupportedSize({ width: 3, height: 3 })).toBe(false);
    expect(isSupportedSize({ width: 1, height: 2 })).toBe(false);
  });

  it('a área inteira precisa caber no tabuleiro', () => {
    expect(footprintFits(cell(4, 4), SIZE_2X2)).toBe(true);
    expect(footprintFits(cell(0, 0), SIZE_2X2)).toBe(true);
    for (const bad of [cell(5, 4), cell(4, 5), cell(5, 5), cell(-1, 0), cell(0, -1)]) {
      expect(footprintFits(bad, SIZE_2X2)).toBe(false);
    }
    expect(footprintFits(cell(5, 5), SIZE_1X1)).toBe(true);
  });

  it('a distância entre unidades conta a área ocupada, não só a casa de referência', () => {
    expect(unitDistance(unit(COLOSSUS, 2, 2), unit(WARRIOR, 5, 2))).toBe(2); // (3,2) -> (5,2)
    expect(unitDistance(unit(WARRIOR, 0, 0), unit(WARRIOR, 3, 0))).toBe(3);
  });
});

// ---------------------------------------------------------------------------------------------
describe('Posicionamento e colisão', () => {
  it('detecta área fora do tabuleiro, sobreposição de unidades e de obstáculos', () => {
    expect(findPlacementProblems([unit(COLOSSUS, 2, 2), unit(WARRIOR, 5, 5)], [])).toEqual([]);
    expect(findPlacementProblems([unit(COLOSSUS, 5, 5)], []).length).toBeGreaterThan(0); // fora
    expect(findPlacementProblems([unit(COLOSSUS, 4, 0)], []).length).toBe(0); // cabe
    expect(findPlacementProblems([unit(COLOSSUS, 5, 0)], []).length).toBeGreaterThan(0);
    expect(findPlacementProblems([unit(COLOSSUS, 2, 2), unit(WARRIOR, 3, 3)], []).length).toBeGreaterThan(0);
    expect(findPlacementProblems([unit(COLOSSUS, 2, 2)], [cell(3, 2)]).length).toBeGreaterThan(0);
    expect(findPlacementProblems([unit(COLOSSUS, 2, 2), unit(COLOSSUS, 3, 3)], []).length).toBeGreaterThan(0);
    expect(findPlacementProblems([unit(WARRIOR, 1, 1), unit(GOBLIN, 1, 1)], []).length).toBeGreaterThan(0); // 1×1
    expect(findPlacementProblems([unit(COLOSSUS, 2, 2)], [cell(4, 2)])).toEqual([]);
  });

  it('unidades derrotadas não ocupam casas no posicionamento', () => {
    const dead = unit(WARRIOR, 3, 3);
    dead.hp = 0;
    expect(findPlacementProblems([unit(COLOSSUS, 2, 2), dead], [])).toEqual([]);
  });

  it('o GameState recusa um encontro com posicionamento inválido', () => {
    let failed = false;
    try {
      stateWith(() => [unit(COLOSSUS, 5, 5), unit(WARRIOR, 0, 0)]);
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
    let overlapFailed = false;
    try {
      stateWith(() => [unit(COLOSSUS, 2, 2), unit(WARRIOR, 3, 2)]);
    } catch {
      overlapFailed = true;
    }
    expect(overlapFailed).toBe(true);
  });

  it('cada uma das quatro casas responde pela mesma unidade; as vizinhas, não', () => {
    const state = stateWith(() => [unit(COLOSSUS, 2, 2), unit(WARRIOR, 0, 5)]);
    const colossus = find(state, 'colossus');
    for (const own of [cell(2, 2), cell(3, 2), cell(2, 3), cell(3, 3)]) {
      expect(state.getUnitAt(own)).toBe(colossus);
    }
    for (const other of [cell(1, 2), cell(4, 3), cell(2, 4), cell(3, 1)]) {
      expect(state.getUnitAt(other)).toBeNull();
    }
    expect(state.roster.filter((u) => u.definition.id === 'colossus')).toHaveLength(1); // uma unidade só
  });

  it('o nascimento no encontro respeita o tamanho: o monstro grande ganha uma área livre dentro do tabuleiro', () => {
    const config: FloorConfig = {
      floor: 1,
      type: 'normal',
      name: 'Teste',
      monsters: [COLOSSUS, GOBLIN, GOBLIN, SLIME],
      obstacles: [],
    };
    expect(validateFloor(config)).toEqual([]);
    const setup = buildEncounter(config, createParty());
    expect(findPlacementProblems(setup.units, setup.obstacles)).toEqual([]);
    expect(setup.units.filter((u) => u.definition.id === 'colossus')).toHaveLength(1);
    expect(validateFloor({ ...config, monsters: [{ ...COLOSSUS, size: { width: 3, height: 3 } }] }).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------------
describe('Nascimento sem espaço', () => {
  it('se não há área livre e dentro do tabuleiro para o monstro grande, o encontro falha com erro claro', () => {
    const config: FloorConfig = {
      floor: 1,
      type: 'normal',
      name: 'Lotado',
      monsters: [GOBLIN, GOBLIN, GOBLIN, GOBLIN, GOBLIN, GOBLIN, GOBLIN, GOBLIN, COLOSSUS],
      obstacles: [],
    };
    let error: unknown = null;
    try {
      buildEncounter(config, createParty());
    } catch (caught) {
      error = caught;
    }
    expect(error instanceof RangeError).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
describe('Movimentação de entidades grandes', () => {
  const movesAt = (col: number, row: number, extras: () => ReturnType<typeof unit>[] = () => [], obstacles: Position[] = []) => {
    const state = stateWith(() => [unit(COLOSSUS, col, row), ...extras(), unit(WARRIOR, 0, 5)], obstacles);
    return state.getValidMoves(find(state, 'colossus'));
  };

  it('só anda para posições em que as quatro casas existem e estão livres', () => {
    expect(keys(movesAt(2, 2))).toEqual(keys([cell(2, 1), cell(3, 2), cell(2, 3), cell(1, 2)]));
    // nos cantos, nunca fica parcialmente fora do tabuleiro
    expect(keys(movesAt(4, 0))).toEqual(keys([cell(3, 0), cell(4, 1)]));
    expect(keys(movesAt(4, 3))).toEqual(keys([cell(4, 2), cell(3, 3), cell(4, 4)]));
    for (const move of movesAt(3, 3)) expect(footprintFits(move, SIZE_2X2)).toBe(true);
  });

  it('não sobrepõe heróis, outros monstros nem obstáculos', () => {
    const withHero = movesAt(2, 2, () => [unit(CLERIC, 4, 2)]); // direita: (3,2) ocuparia (4,2)
    expect(keys(withHero)).toEqual(keys([cell(2, 1), cell(2, 3), cell(1, 2)]));

    const withMonster = movesAt(2, 2, () => [unit(GOBLIN, 2, 4)]); // baixo: (2,3) ocuparia (2,4)
    expect(withMonster.some((m) => positionKey(m) === '2,3')).toBe(false);

    const withObstacle = movesAt(2, 2, () => [], [cell(1, 3)]); // esquerda: (1,2) ocuparia (1,3)
    expect(withObstacle.some((m) => positionKey(m) === '1,2')).toBe(false);
  });

  it('pode andar para uma posição que sobrepõe o próprio corpo anterior', () => {
    expect(movesAt(2, 2).some((m) => positionKey(m) === '3,2')).toBe(true); // (3,2) reaproveita a coluna 3
  });

  it('não atravessa barreiras: com uma muralha de obstáculos ele não passa para o outro lado', () => {
    const wall = [0, 1, 2, 3, 4, 5].map((row) => cell(3, row));
    const state = stateWith(() => [unit({ ...COLOSSUS, movement: 2 }, 0, 2), unit(WARRIOR, 5, 5)], wall);
    const moves = state.getValidMoves(find(state, 'colossus'));
    expect(moves.every((m) => m.col <= 1)).toBe(true); // a coluna 3 é uma parede
    expect(moves.length).toBeGreaterThan(0);
  });

  it('um herói 1×1 não pode entrar numa casa de uma entidade grande, e passa a poder quando ela morre', () => {
    const state = stateWith(() => [unit(COLOSSUS, 2, 2), unit(WARRIOR, 4, 2), unit(SLIME, 0, 0)]);
    const warrior = find(state, 'warrior');
    expect(state.getValidMoves(warrior).some((m) => positionKey(m) === '3,2')).toBe(false);
    find(state, 'colossus').hp = 0;
    expect(state.getValidMoves(warrior).some((m) => positionKey(m) === '3,2')).toBe(true);
  });

  it('a IA aproxima a criatura grande sem colisões nem áreas fora do tabuleiro, e ela chega a atacar', () => {
    const state = stateWith(
      () => [unit(COLOSSUS, 2, 0), unit(WARRIOR, 3, 5)],
      [cell(0, 3), cell(5, 2)],
    );
    const warrior = find(state, 'warrior');
    warrior.hp = 999;

    for (let turn = 0; turn < 12 && !state.isOver; turn++) {
      state.passTurn();
      state.resolveAll();
      expect(findPlacementProblems(state.units, state.obstacles)).toEqual([]);
    }
    expect(warrior.hp).toBeLessThan(999);
  });

  it('chooseMonsterMove só escolhe posições com a área inteira livre', () => {
    const colossus = unit(COLOSSUS, 0, 0);
    const hero = unit(WARRIOR, 5, 5);
    const move = chooseMonsterMove(colossus, context([colossus, hero], [cell(2, 0)]));
    expect(move === null || footprintFits(move.position, SIZE_2X2)).toBe(true);
    if (move) {
      expect(unitCells(colossus, move.position).some((c) => positionKey(c) === '2,0')).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe('Morte, remoção e reinício', () => {
  it('quando morre, libera as quatro casas', () => {
    const state = stateWith(() => [unit(COLOSSUS, 2, 2), unit(WARRIOR, 1, 2)]);
    const colossus = find(state, 'colossus');
    colossus.hp = WARRIOR.damage; // o ataque automático do Guerreiro (ao lado) o mata

    state.passTurn();
    state.resolveAll();

    expect(colossus.hp).toBe(0);
    for (const own of [cell(2, 2), cell(3, 2), cell(2, 3), cell(3, 3)]) {
      expect(state.getUnitAt(own)).toBeNull();
    }
    expect(state.monsters).toHaveLength(0);
    expect(state.units.map((u) => u.definition.id)).toEqual(['warrior']);
  });

  it('o reinício devolve a criatura inteira, com as quatro casas, sem duplicar nada', () => {
    const state = stateWith(() => [unit(COLOSSUS, 2, 2), unit(WARRIOR, 0, 5), unit(SLIME, 5, 0)]);
    find(state, 'colossus').hp = 0;
    expect(state.getUnitAt(cell(3, 3))).toBeNull();

    state.reset();

    const colossus = find(state, 'colossus');
    expect(colossus.hp).toBe(colossus.maxHp);
    expect(colossus.position).toEqual(cell(2, 2));
    for (const own of [cell(2, 2), cell(3, 2), cell(2, 3), cell(3, 3)]) {
      expect(state.getUnitAt(own)).toBe(colossus);
    }
    expect(state.roster).toHaveLength(3);
    expect(findPlacementProblems(state.units, state.obstacles)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
describe('Ataques contra entidades grandes: um alvo, um acerto', () => {
  it('ataque normal em linha ou adjacente atinge a criatura uma única vez', () => {
    const adjacent = stateWith(() => [unit(COLOSSUS, 2, 2), unit(WARRIOR, 1, 2)]);
    expect(findAttackTargets(find(adjacent, 'warrior'), context(adjacent.units))).toHaveLength(1);

    const archer = unit(ARCHER, 0, 2);
    const colossus = unit(COLOSSUS, 2, 2);
    expect(findAttackTargets(archer, context([archer, colossus]))).toEqual([colossus]);

    const state = stateWith(() => [unit(COLOSSUS, 2, 2), unit(WARRIOR, 1, 2)]);
    state.passTurn();
    state.resolveAll();
    expect(find(state, 'colossus').hp).toBe(COLOSSUS.maxHp - WARRIOR.damage); // 6 de dano, uma vez
  });

  it('a cruz do Mago que cobre várias casas da criatura causa o dano uma só vez', () => {
    // Centro em (3,2); a cruz cobre (3,1), (2,2) e (3,2), três casas da criatura em (2..3, 1..2).
    const state = stateWith(() => [unit(MAGE, 3, 5), unit(COLOSSUS, 2, 1)]);
    const colossus = find(state, 'colossus');
    expect(findAttackTargets(find(state, 'mage'), context(state.units))).toEqual([colossus]);

    state.passTurn();
    state.step(); // o Mago ataca
    expect(colossus.hp).toBe(COLOSSUS.maxHp - MAGE.damage);
    expect(state.lastDamage).toHaveLength(1);
  });

  it('Tiro Perfurante atravessa a criatura grande e a atinge uma vez só, e segue para o que está atrás', () => {
    const state = stateWith(() => [unit(ARCHER, 0, 2), unit(COLOSSUS, 2, 2), unit(SLIME, 5, 2)]);
    const archer = find(state, 'archer');
    expect(pierceTargets(archer, cell(1, 0), state.units).map((u) => u.definition.id)).toEqual(['colossus', 'slime']);

    expect(castAbility(state, archer, [cell(1, 2)])).toBe(true);
    expect(find(state, 'colossus').hp).toBe(COLOSSUS.maxHp - 9);
    expect(find(state, 'slime').hp).toBe(SLIME.maxHp - 9);
    expect(state.lastDamage).toHaveLength(2);
  });

  it('Bola de Fogo com as quatro casas na área causa um único dano', () => {
    const state = stateWith(() => [unit(MAGE, 0, 5), unit(COLOSSUS, 2, 2), unit(SLIME, 5, 0)]);
    expect(castAbility(state, find(state, 'mage'), [cell(2, 2)])).toBe(true);
    expect(find(state, 'colossus').hp).toBe(COLOSSUS.maxHp - 10);
    expect(state.lastDamage.filter((e) => e.targetUid === find(state, 'colossus').uid)).toHaveLength(1);
  });

  it('Bola de Fogo que só tira uma ponta da criatura também a atinge', () => {
    const state = stateWith(() => [unit(MAGE, 0, 5), unit(COLOSSUS, 2, 2), unit(SLIME, 5, 0)]);
    castAbility(state, find(state, 'mage'), [cell(4, 4)]); // área (3..5, 3..5) toca só a casa (3,3)
    expect(find(state, 'colossus').hp).toBe(COLOSSUS.maxHp - 10);
  });

  it('Pisada atordoa a criatura uma vez mesmo tocando várias casas dela', () => {
    const state = stateWith(() => [unit(WARRIOR, 1, 2), unit(COLOSSUS, 2, 2), unit(SLIME, 5, 0)]);
    expect(stompTargets(find(state, 'warrior'), state.units).map((u) => u.definition.id)).toEqual(['colossus']);
    castAbility(state, find(state, 'warrior'));
    expect(find(state, 'colossus').stunned).toBe(true);
  });

  it('Pisada atinge a criatura quando o herói só encosta numa casa que não é a de referência', () => {
    const state = stateWith(() => [unit(WARRIOR, 4, 3), unit(COLOSSUS, 2, 2), unit(SLIME, 0, 0)]);
    expect(stompTargets(find(state, 'warrior'), state.units).map((u) => u.definition.id)).toEqual(['colossus']);
    castAbility(state, find(state, 'warrior'));
    expect(find(state, 'colossus').stunned).toBe(true);
    expect(find(state, 'slime').stunned).toBe(false);
  });

  it('Emboscada em alvo grande: destinos nas diagonais das casas dele e dois golpes completos', () => {
    const state = stateWith(() => [unit(ASSASSIN, 0, 0), unit(COLOSSUS, 3, 3)]);
    const assassin = find(state, 'assassin');
    state.toggleSelection(assassin.uid);
    state.beginAbility();
    state.chooseAbilityCell(cell(3, 3));
    const options = keys(state.abilityPreview?.selectable ?? []);
    for (const corner of ['2,2', '5,2', '2,5', '5,5']) expect(options).toContain(corner);
    expect(options).toContain('2,3'); // ao lado: ainda tem uma casa do alvo na diagonal
    expect(options).not.toContain('3,3'); // dentro do alvo
    expect(options).not.toContain('0,0');

    state.chooseAbilityCell(cell(2, 2));
    expect(state.confirmAbility()).toBe(true);
    expect(find(state, 'colossus').hp).toBe(COLOSSUS.maxHp - ASSASSIN.damage * 2);
    expect(state.lastDamage).toHaveLength(2); // dois ataques, cada um uma vez
    expect(ambushDestinations(assassin, find(state, 'colossus'), context(state.units)).length).toBeGreaterThan(0);
  });

  it('a criatura grande ataca heróis ao lado de QUALQUER das suas casas, cada herói uma vez', () => {
    const big = unit(COLOSSUS, 2, 2);
    const east = unit(WARRIOR, 4, 3);
    const south = unit(CLERIC, 2, 4);
    const diagonalOnly = unit(MAGE, 4, 4);
    const ally = unit(SLIME, 1, 2);
    const targets = findAttackTargets(big, context([big, east, south, diagonalOnly, ally]));
    expect(uids(targets)).toEqual(uids([east, south]));
  });
});

// ---------------------------------------------------------------------------------------------
describe('Ataques telegrafados com entidades grandes', () => {
  const SWEEP: TelegraphedAttack = {
    id: 't-sweep',
    name: 'Varredura de Teste',
    pattern: 'row',
    targeting: 'nearest-hero',
    damage: 9,
  };
  const bossDef = (size?: typeof SIZE_2X2): UnitDefinition => ({
    ...ABYSS_IDOL,
    id: 'test-boss',
    name: 'Chefe de Teste',
    maxHp: 200,
    damage: 1,
    size,
    telegraph: { attacks: [SWEEP], cooldownTurns: 99 },
  });

  it('um alvo grande é coberto por inteiro e atingido uma única vez', () => {
    const state = stateWith(() => [unit(bossDef(), 0, 0), unit(BIG_WARRIOR, 2, 3), unit(MAGE, 5, 5)]);
    const intent = state.telegraphs[0];
    // linhas 3 e 4 inteiras (o corpo do herói ocupa as duas): 12 casas, sem repetição
    expect(intent.cells).toHaveLength(12);
    expect(new Set(intent.cells.map(positionKey)).size).toBe(12);
    const big = find(state, 'big-warrior');

    state.passTurn();
    state.resolveAll();

    expect(big.hp).toBe(BIG_WARRIOR.maxHp - 9); // uma vez, apesar de 4 casas na área
    expect(state.log.filter((e) => e.message.startsWith('Varredura de Teste atingiu'))).toHaveLength(1);
  });

  it('a área anunciada não muda quando o alvo grande se move, e quem saiu por completo não é atingido', () => {
    const state = stateWith(() => [unit(bossDef(), 0, 0), unit({ ...BIG_WARRIOR, movement: 2 }, 2, 3), unit(MAGE, 5, 5)]);
    const intent = state.telegraphs[0];
    const before = keys(intent.cells);
    const big = find(state, 'big-warrior');
    state.toggleSelection(big.uid);
    expect(state.moveSelectedUnit(cell(2, 1))).toBe(true); // sobe duas casas: sai das linhas 3-4
    state.resolveAll();
    expect(keys(intent.cells)).toEqual(before);
    expect(big.hp).toBe(BIG_WARRIOR.maxHp);
  });

  it('um alvo grande só parcialmente na área ainda é atingido, uma vez', () => {
    // O chefe fica longe da criatura: o alvo mais próximo é o Guerreiro 1×1 em (5,2) -> linha 2.
    const state = stateWith(() => [unit(bossDef(), 5, 0), unit(WARRIOR, 5, 2), unit(BIG_WARRIOR, 2, 3)]);
    expect(keys(state.telegraphs[0].cells)).toEqual(keys([0, 1, 2, 3, 4, 5].map((c) => cell(c, 2))));
    const big = find(state, 'big-warrior');
    expect(state.isThreatened(cell(2, 3))).toBe(false); // ainda fora da linha

    state.toggleSelection(big.uid);
    expect(state.moveSelectedUnit(cell(2, 2))).toBe(true); // corpo em (2..3, 2..3): metade na linha 2
    state.resolveAll();

    expect(big.hp).toBe(BIG_WARRIOR.maxHp - 9); // atingido uma vez, mesmo com 2 casas na linha
  });

  it('é atingido mesmo quando só uma casa que NÃO é a de referência está na área', () => {
    // Linha 3 anunciada (alvo: Guerreiro 1×1 em (5,3)). A criatura termina em (2..3, 2..3):
    // a casa de referência (2,2) fica fora da linha, mas as casas (2,3) e (3,3) estão dentro.
    const state = stateWith(() => [unit(bossDef(), 5, 0), unit(WARRIOR, 5, 3), unit(BIG_WARRIOR, 2, 1)]);
    expect(keys(state.telegraphs[0].cells)).toEqual(keys([0, 1, 2, 3, 4, 5].map((c) => cell(c, 3))));
    const big = find(state, 'big-warrior');

    state.toggleSelection(big.uid);
    expect(state.moveSelectedUnit(cell(2, 2))).toBe(true);
    expect(big.position.row).toBe(2);
    state.resolveAll();

    expect(big.hp).toBe(BIG_WARRIOR.maxHp - 9);
  });

  it('um chefe grande anuncia o golpe, usa a distância pela área e, ao morrer, cancela e libera as casas', () => {
    const state = stateWith(() => [unit(bossDef(SIZE_2X2), 2, 1), unit(WARRIOR, 2, 3), unit(SLIME, 5, 5)]);
    expect(state.pendingTelegraphs).toHaveLength(1);
    const boss = find(state, 'test-boss');
    expect(chooseTelegraphTarget(boss, state.heroes, 'nearest-hero')).toBe(find(state, 'warrior'));

    boss.hp = WARRIOR.damage; // o Guerreiro (embaixo) o mata
    state.passTurn();
    state.step();

    expect(boss.hp).toBe(0);
    expect(state.telegraphs[0].status).toBe('cancelled');
    for (const own of [cell(2, 1), cell(3, 1), cell(2, 2), cell(3, 2)]) expect(state.getUnitAt(own)).toBeNull();
    state.resolveAll();
    expect(find(state, 'warrior').hp).toBe(WARRIOR.maxHp);
  });
});

// ---------------------------------------------------------------------------------------------
describe('Sem regressões na campanha atual', () => {
  it('todos os monstros dos 10 andares nascem 1×1 em casas válidas', () => {
    const campaign = new Campaign();
    for (let floor = 1; floor <= 10; floor++) {
      const battle = campaign.battle;
      expect(findPlacementProblems(battle.units, battle.obstacles)).toEqual([]);
      for (const u of battle.units) expect(unitCells(u)).toHaveLength(1);
      if (floor < 10) {
        for (const monster of battle.monsters) monster.hp = 0;
        battle.passTurn();
        battle.resolveAll();
        expect(campaign.advance()).toBe(true);
      }
    }
    expect(campaign.battle.pendingTelegraphs).toHaveLength(1); // o Ídolo continua telegrafando
  });
});
