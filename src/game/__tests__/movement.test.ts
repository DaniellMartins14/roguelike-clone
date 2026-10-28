import { describe, expect, it } from 'vitest';
import { ARCHER, ASSASSIN, CLERIC, MAGE, WARRIOR } from '../data/heroes';
import { GOBLIN, SKELETON, SLIME } from '../data/monsters';
import type { Position, Unit, UnitDefinition } from '../types';
import { stateWith, unit } from './helpers';

const key = (pos: Position) => `${pos.col},${pos.row}`;
const cell = (col: number, row: number): Position => ({ col, row });
const keys = (positions: Position[]) => positions.map(key).sort();
const chebyshev = (a: Position, b: Position) => Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));

/** Movimentos válidos de uma unidade em (col,row), com unidades extras e obstáculos opcionais. */
function movesOf(
  definition: UnitDefinition,
  col: number,
  row: number,
  extras: () => Unit[] = () => [],
  obstacles: Position[] = [],
): Position[] {
  const state = stateWith(() => [unit(definition, col, row), ...extras()], obstacles);
  return state.getValidMoves(state.roster[0]);
}

const ONE_STEP_HEROES: UnitDefinition[] = [WARRIOR, ASSASSIN, ARCHER, CLERIC];

describe('Distância de movimentação', () => {
  it('Guerreiro, Assassino, Arqueiro e Clérigo andam 1 casa; Mago anda 2', () => {
    expect(WARRIOR.movement).toBe(1);
    expect(ASSASSIN.movement).toBe(1);
    expect(ARCHER.movement).toBe(1);
    expect(CLERIC.movement).toBe(1);
    expect(MAGE.movement).toBe(2);
  });

  it('heróis de 1 casa alcançam exatamente as 8 casas vizinhas, diagonais incluídas', () => {
    const neighbors = [
      { col: 1, row: 1 }, { col: 2, row: 1 }, { col: 3, row: 1 },
      { col: 1, row: 2 }, { col: 3, row: 2 },
      { col: 1, row: 3 }, { col: 2, row: 3 }, { col: 3, row: 3 },
    ];
    for (const hero of ONE_STEP_HEROES) {
      expect(keys(movesOf(hero, 2, 2))).toEqual(keys(neighbors));
    }
  });

  it('o Assassino não anda duas casas, nem em linha reta nem em diagonal', () => {
    const moves = movesOf(ASSASSIN, 2, 2);
    expect(moves.some((m) => chebyshev(m, { col: 2, row: 2 }) > 1)).toBe(false);
    expect(moves.some((m) => key(m) === '2,0')).toBe(false);
    expect(moves.some((m) => key(m) === '4,4')).toBe(false);
  });

  it('o Mago alcança todas as casas a até 2 passos (24 num campo aberto), inclusive diagonais', () => {
    const moves = movesOf(MAGE, 2, 2);
    expect(moves).toHaveLength(24);
    expect(moves.every((m) => chebyshev(m, { col: 2, row: 2 }) <= 2)).toBe(true);
    expect(moves.some((m) => key(m) === '4,4')).toBe(true);
    expect(moves.some((m) => key(m) === '0,0')).toBe(true);
    expect(moves.some((m) => key(m) === '2,2')).toBe(false); // a própria casa não conta
  });

  it('distância de movimento não se confunde com alcance de ataque (Arqueiro: anda 1, atira 3)', () => {
    expect(ARCHER.attack.range).toBe(3);
    expect(movesOf(ARCHER, 2, 2).every((m) => chebyshev(m, { col: 2, row: 2 }) === 1)).toBe(true);
  });
});

describe('Limites e casas bloqueadas', () => {
  it('não permite sair do tabuleiro', () => {
    expect(movesOf(WARRIOR, 0, 0)).toHaveLength(3);
    expect(movesOf(MAGE, 0, 0)).toHaveLength(8);
    for (const move of movesOf(MAGE, 5, 5)) {
      expect(move.col).toBeGreaterThan(-1);
      expect(move.col).toBeLessThan(6);
      expect(move.row).toBeGreaterThan(-1);
      expect(move.row).toBeLessThan(6);
    }
  });

  it('não permite terminar em casa ocupada por herói ou monstro', () => {
    const moves = movesOf(WARRIOR, 2, 2, () => [unit(CLERIC, 3, 2), unit(GOBLIN, 2, 3), unit(SLIME, 1, 1)]);
    expect(keys(moves)).toEqual(keys([
      { col: 2, row: 1 }, { col: 3, row: 1 },
      { col: 1, row: 2 },
      { col: 1, row: 3 }, { col: 3, row: 3 },
    ]));
  });

  it('respeita obstáculos', () => {
    const moves = movesOf(WARRIOR, 2, 2, () => [], [{ col: 2, row: 1 }, { col: 3, row: 3 }]);
    expect(moves).toHaveLength(6);
    expect(moves.some((m) => key(m) === '2,1')).toBe(false);
    expect(moves.some((m) => key(m) === '3,3')).toBe(false);
  });

  it('unidades derrotadas não ocupam casas', () => {
    const state = stateWith(() => [unit(WARRIOR, 2, 2), unit(GOBLIN, 2, 3)]);
    state.monsters[0].hp = 0;
    expect(state.getValidMoves(state.heroes[0])).toHaveLength(8);
  });
});

describe('Mago não atravessa personagens nem obstáculos', () => {
  it('não passa por cima de unidades: com a linha da frente bloqueada, não chega ao outro lado', () => {
    // Três unidades lado a lado fecham todos os caminhos de 2 passos até a linha 3.
    const moves = movesOf(MAGE, 2, 5, () => [unit(GOBLIN, 1, 4), unit(SLIME, 2, 4), unit(SKELETON, 3, 4)]);
    expect(moves.some((m) => m.row <= 3)).toBe(false);
    expect(moves.some((m) => key(m) === '2,4')).toBe(false); // ocupada
    expect(moves.some((m) => key(m) === '2,5')).toBe(false);
  });

  it('não passa por cima de obstáculos: com a linha da frente bloqueada, não chega ao outro lado', () => {
    const moves = movesOf(MAGE, 2, 5, () => [], [cell(1, 4), cell(2, 4), cell(3, 4)]);
    expect(moves.some((m) => m.row <= 3)).toBe(false);
  });

  it('uma muralha de unidades e obstáculos impede de chegar ao outro lado', () => {
    const moves = movesOf(
      MAGE,
      0,
      2,
      () => [unit(WARRIOR, 1, 1), unit(GOBLIN, 1, 2)],
      [{ col: 1, row: 3 }],
    );
    // Todas as casas da coluna 1 ao redor estão bloqueadas: nada da coluna 2 é alcançável.
    expect(moves.some((m) => m.col >= 2)).toBe(false);
    expect(moves.some((m) => key(m) === '0,1')).toBe(true);
  });

  it('chega a 2 casas quando o caminho está livre, inclusive contornando pela diagonal', () => {
    const moves = movesOf(MAGE, 2, 5, () => [unit(GOBLIN, 2, 4)]);
    expect(moves.some((m) => key(m) === '3,3')).toBe(true); // (2,5) -> (3,4) -> (3,3)
    expect(moves.some((m) => key(m) === '1,3')).toBe(true);
  });
});

describe('Quando é permitido mover', () => {
  it('mover consome a ação do turno e inicia a resolução', () => {
    const state = stateWith(() => [unit(ASSASSIN, 2, 4), unit(GOBLIN, 0, 0)]);
    state.toggleSelection(state.heroes[0].uid);

    expect(state.moveSelectedUnit({ col: 3, row: 3 })).toBe(true); // diagonal
    expect(state.phase).toBe('heroes');
    expect(state.moveSelectedUnit({ col: 4, row: 2 })).toBe(false); // segunda ação no mesmo turno
  });

  it('o Assassino não consegue andar duas casas pelo fluxo do jogo', () => {
    const state = stateWith(() => [unit(ASSASSIN, 2, 4), unit(GOBLIN, 0, 0)]);
    state.toggleSelection(state.heroes[0].uid);

    expect(state.moveSelectedUnit({ col: 2, row: 2 })).toBe(false);
    expect(state.moveSelectedUnit({ col: 4, row: 2 })).toBe(false);
    expect(state.phase).toBe('player');
    expect(state.heroes[0].position).toEqual({ col: 2, row: 4 });
  });

  it('é recusado durante a resolução, depois da morte e depois do fim do combate', () => {
    const resolving = stateWith(() => [unit(WARRIOR, 2, 4), unit(GOBLIN, 0, 0)]);
    resolving.toggleSelection(resolving.heroes[0].uid);
    resolving.passTurn();
    expect(resolving.moveSelectedUnit({ col: 2, row: 3 })).toBe(false);

    const dead = stateWith(() => [unit(WARRIOR, 2, 4), unit(CLERIC, 4, 4), unit(GOBLIN, 0, 0)]);
    const warrior = dead.heroes[0];
    warrior.hp = 0;
    dead.toggleSelection(warrior.uid);
    expect(dead.getValidMoves(warrior)).toHaveLength(0);
    expect(dead.moveSelectedUnit({ col: 2, row: 3 })).toBe(false);

    const over = stateWith(() => [unit(WARRIOR, 2, 4), unit(GOBLIN, 2, 3)]);
    over.monsters[0].hp = 1;
    over.passTurn();
    over.resolveAll();
    expect(over.isOver).toBe(true);
    expect(over.moveSelectedUnit({ col: 3, row: 4 })).toBe(false);
  });
});

describe('Monstros continuam andando só na ortogonal', () => {
  it('um monstro de 1 casa tem 4 movimentos; um de 2 casas tem 12', () => {
    const slime = stateWith(() => [unit(SLIME, 2, 2), unit(WARRIOR, 5, 5)]);
    expect(slime.getValidMoves(slime.monsters[0])).toHaveLength(4);

    const goblin = stateWith(() => [unit(GOBLIN, 2, 2), unit(WARRIOR, 5, 5)]);
    expect(goblin.getValidMoves(goblin.monsters[0])).toHaveLength(12);
  });
});

describe('Direção do Mago depois de andar', () => {
  it('passa a olhar na direção geral do deslocamento, inclusive na diagonal', () => {
    const straight = stateWith(() => [unit(MAGE, 1, 3), unit(GOBLIN, 0, 0)]);
    straight.toggleSelection(straight.heroes[0].uid);
    straight.moveSelectedUnit({ col: 3, row: 3 }); // 2 casas à direita
    expect(straight.heroes[0].facing).toEqual({ col: 1, row: 0 });

    const diagonal = stateWith(() => [unit(MAGE, 3, 5), unit(GOBLIN, 0, 0)]);
    diagonal.toggleSelection(diagonal.heroes[0].uid);
    diagonal.moveSelectedUnit({ col: 4, row: 4 });
    expect(diagonal.heroes[0].facing).toEqual({ col: 1, row: -1 });
  });
});
