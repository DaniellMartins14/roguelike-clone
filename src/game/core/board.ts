import { BOARD_COLS, BOARD_ROWS } from '../config';
import { SIZE_1X1 } from '../data/sizes';
import type { Position, Unit, UnitDefinition, UnitSize } from '../types';

/** Direções ortogonais (cima, direita, baixo, esquerda). */
export const ORTHOGONAL_DIRECTIONS: readonly Position[] = [
  { col: 0, row: -1 },
  { col: 1, row: 0 },
  { col: 0, row: 1 },
  { col: -1, row: 0 },
];

/** Direções diagonais (cima-direita, baixo-direita, baixo-esquerda, cima-esquerda). */
export const DIAGONAL_DIRECTIONS: readonly Position[] = [
  { col: 1, row: -1 },
  { col: 1, row: 1 },
  { col: -1, row: 1 },
  { col: -1, row: -1 },
];

/** As oito direções (ortogonais e diagonais). */
export const ALL_DIRECTIONS: readonly Position[] = [...ORTHOGONAL_DIRECTIONS, ...DIAGONAL_DIRECTIONS];

/** Direções de cada passo de movimento da unidade (padrão: ortogonais). */
export function getMovementDirections(definition: UnitDefinition): readonly Position[] {
  return definition.movementDirections === 'all' ? ALL_DIRECTIONS : ORTHOGONAL_DIRECTIONS;
}

/** Direção geral de `from` para `to`, como vetor unitário (cada eixo vira -1, 0 ou 1). */
export function directionBetween(from: Position, to: Position): Position {
  return { col: Math.sign(to.col - from.col), row: Math.sign(to.row - from.row) };
}

export function isInsideBoard(pos: Position): boolean {
  return pos.col >= 0 && pos.col < BOARD_COLS && pos.row >= 0 && pos.row < BOARD_ROWS;
}

export function positionsEqual(a: Position, b: Position): boolean {
  return a.col === b.col && a.row === b.row;
}

export function positionKey(pos: Position): string {
  return `${pos.col},${pos.row}`;
}

/** Nome amigável da casa, por exemplo "C4" (coluna A-F, linha 1-6 de cima para baixo). */
export function positionLabel(pos: Position): string {
  return `${String.fromCharCode(65 + pos.col)}${pos.row + 1}`;
}

export interface ReachableCell {
  position: Position;
  /** Casa imediatamente anterior no caminho mais curto (define a direção do último passo). */
  from: Position;
  steps: number;
}

/**
 * Casas alcançáveis em até `maxSteps` passos (nas direções dadas; por padrão, ortogonais),
 * sem sair do tabuleiro e sem atravessar casas bloqueadas (cada casa do caminho precisa estar
 * livre). A lista vem ordenada por número de passos.
 */
export function computeReachable(
  start: Position,
  maxSteps: number,
  isBlocked: (pos: Position) => boolean,
  directions: readonly Position[] = ORTHOGONAL_DIRECTIONS,
): ReachableCell[] {
  const result: ReachableCell[] = [];
  const visited = new Set<string>([positionKey(start)]);
  let frontier: Position[] = [start];

  for (let step = 1; step <= maxSteps; step++) {
    const next: Position[] = [];
    for (const current of frontier) {
      for (const dir of directions) {
        const candidate: Position = { col: current.col + dir.col, row: current.row + dir.row };
        const key = positionKey(candidate);
        if (!isInsideBoard(candidate) || visited.has(key) || isBlocked(candidate)) continue;
        visited.add(key);
        next.push(candidate);
        result.push({ position: candidate, from: current, steps: step });
      }
    }
    frontier = next;
  }

  return result;
}

/**
 * Distância (em passos ortogonais) de cada casa livre até a fonte mais próxima.
 * As fontes têm distância 0; casas bloqueadas não são atravessadas.
 */
export function computeDistanceMap(
  sources: readonly Position[],
  isBlocked: (pos: Position) => boolean,
): Map<string, number> {
  const distances = new Map<string, number>();
  const queue: Position[] = [];

  for (const source of sources) {
    distances.set(positionKey(source), 0);
    queue.push(source);
  }

  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    const currentDistance = distances.get(positionKey(current)) ?? 0;
    for (const dir of ORTHOGONAL_DIRECTIONS) {
      const candidate: Position = { col: current.col + dir.col, row: current.row + dir.row };
      const key = positionKey(candidate);
      if (!isInsideBoard(candidate) || distances.has(key) || isBlocked(candidate)) continue;
      distances.set(key, currentDistance + 1);
      queue.push(candidate);
    }
  }

  return distances;
}
// ---------- Área ocupada por entidades (1×1 ou 2×2) ----------
//
// `Unit.position` é sempre a casa superior esquerda da área. TODO cálculo de ocupação, colisão,
// alcance e área de efeito deve passar por estas funções em vez de usar `position` diretamente.

/** Tamanho da entidade (1×1 se a definição não disser nada). */
export function sizeOf(definition: UnitDefinition): UnitSize {
  return definition.size ?? SIZE_1X1;
}

/** Só 1×1 e 2×2 são suportados. */
export function isSupportedSize(size: UnitSize): boolean {
  return size.width === size.height && (size.width === 1 || size.width === 2);
}

/** As casas de uma área de `size` com a casa superior esquerda em `anchor` (sem checar limites). */
export function footprintCells(anchor: Position, size: UnitSize = SIZE_1X1): Position[] {
  const cells: Position[] = [];
  for (let dRow = 0; dRow < size.height; dRow++) {
    for (let dCol = 0; dCol < size.width; dCol++) {
      cells.push({ col: anchor.col + dCol, row: anchor.row + dRow });
    }
  }
  return cells;
}

/** A área inteira cabe no tabuleiro? (uma entidade nunca fica parcialmente fora) */
export function footprintFits(anchor: Position, size: UnitSize = SIZE_1X1): boolean {
  return footprintCells(anchor, size).every(isInsideBoard);
}

/** Casas ocupadas pela unidade (ou que ela ocuparia com a casa de referência em `anchor`). */
export function unitCells(unit: Unit, anchor: Position = unit.position): Position[] {
  return footprintCells(anchor, sizeOf(unit.definition));
}

/** A unidade ocupa esta casa? */
export function occupies(unit: Unit, cell: Position): boolean {
  const size = sizeOf(unit.definition);
  return (
    cell.col >= unit.position.col &&
    cell.col < unit.position.col + size.width &&
    cell.row >= unit.position.row &&
    cell.row < unit.position.row + size.height
  );
}

/** Menor distância (em passos ortogonais) entre as áreas ocupadas por duas unidades. */
export function unitDistance(a: Unit, b: Unit): number {
  let best = Infinity;
  for (const cellA of unitCells(a)) {
    for (const cellB of unitCells(b)) {
      best = Math.min(best, Math.abs(cellA.col - cellB.col) + Math.abs(cellA.row - cellB.row));
    }
  }
  return best;
}

/**
 * Confere o posicionamento de um encontro: tamanho suportado, área inteira dentro do tabuleiro,
 * sem sobrepor obstáculos nem outras unidades. Unidades derrotadas (hp <= 0) não ocupam casas.
 */
export function findPlacementProblems(units: readonly Unit[], obstacles: readonly Position[]): string[] {
  const problems: string[] = [];
  const taken = new Map<string, string>();

  for (const obstacle of obstacles) taken.set(positionKey(obstacle), 'um obstáculo');

  for (const unit of units) {
    if (unit.hp <= 0) continue;
    const name = unit.definition.name;
    if (!isSupportedSize(sizeOf(unit.definition))) {
      problems.push(`${name}: tamanho não suportado (só 1×1 e 2×2).`);
      continue;
    }
    for (const cell of unitCells(unit)) {
      if (!isInsideBoard(cell)) {
        problems.push(`${name}: área fora do tabuleiro (${positionKey(cell)}).`);
        continue;
      }
      const key = positionKey(cell);
      const other = taken.get(key);
      if (other !== undefined) {
        problems.push(`${name}: casa ${key} já ocupada por ${other}.`);
      } else {
        taken.set(key, name);
      }
    }
  }
  return problems;
}