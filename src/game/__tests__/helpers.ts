import { GameState } from '../core/GameState';
import { createUnit } from '../data/battleSetup';
import type { Position, Unit, UnitDefinition } from '../types';

/** Cria uma unidade de teste. O uid é derivado da definição e da casa (estável entre reinícios). */
export function unit(
  definition: UnitDefinition,
  col: number,
  row: number,
  facing?: Position,
): Unit {
  const created = createUnit(definition, { col, row }, `${definition.id}@${col},${row}`);
  if (facing) created.facing = facing;
  return created;
}

/** Contexto de ataque para chamar as regras diretamente. */
export function context(units: Unit[], obstacles: Position[] = []) {
  return { units, obstacles };
}

/**
 * GameState com uma batalha montada pelo teste. `build` roda a cada (re)início,
 * então o reinício recebe unidades novas.
 */
export function stateWith(build: () => Unit[], obstacles: Position[] = []): GameState {
  return new GameState(() => ({
    units: build(),
    obstacles: obstacles.map((cell) => ({ col: cell.col, row: cell.row })),
  }));
}

export function uids(units: readonly Unit[]): string[] {
  return units.map((u) => u.uid).sort();
}

/** Variante de uma definição com outro PV máximo (alvos resistentes, valores ímpares...). */
export function withMaxHp(definition: UnitDefinition, maxHp: number): UnitDefinition {
  return { ...definition, id: `${definition.id}-${maxHp}hp`, maxHp };
}

/**
 * Seleciona o herói, abre a habilidade, escolhe as casas dadas (em ordem) e confirma.
 * Retorna true se a habilidade foi usada. A Pisada, que não pede alvo, é usada ao abrir.
 */
export function castAbility(state: GameState, hero: Unit, cells: Position[] = []): boolean {
  state.toggleSelection(hero.uid);
  if (!state.beginAbility()) return false;
  if (state.phase !== 'player') return true;
  for (const cell of cells) state.chooseAbilityCell(cell);
  return state.confirmAbility();
}

export const UP: Position = { col: 0, row: -1 };
export const RIGHT: Position = { col: 1, row: 0 };
export const DOWN: Position = { col: 0, row: 1 };
export const LEFT: Position = { col: -1, row: 0 };