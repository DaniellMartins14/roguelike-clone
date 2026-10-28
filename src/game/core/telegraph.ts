import { BOARD_COLS, BOARD_ROWS } from '../config';
import type {
  Position,
  TelegraphConfig,
  TelegraphIntent,
  TelegraphPatternId,
  TelegraphTargeting,
  TelegraphedAttack,
  Unit,
} from '../types';
import { ORTHOGONAL_DIRECTIONS, isInsideBoard, positionKey, unitCells, unitDistance } from './board';
import { isAlive } from './combat';

/**
 * Regras puras dos ataques telegrafados: padrões de área, escolha do alvo e criação da intenção.
 * Anunciar, resolver e cancelar (e os efeitos no HP) ficam no GameState.
 */

/** Gera a área de um padrão a partir da posição do chefe e do herói escolhido. */
type PatternFn = (origin: Position, target: Position) => Position[];

/**
 * Padrões de área disponíveis. Para um novo formato de golpe, acrescente uma entrada aqui (e o
 * id em `TelegraphPatternId`): nada mais precisa mudar.
 */
export const TELEGRAPH_PATTERNS: Record<TelegraphPatternId, PatternFn> = {
  /** A linha inteira do herói. */
  row: (_origin, target) =>
    Array.from({ length: BOARD_COLS }, (_unused, col) => ({ col, row: target.row })),
  /** A coluna inteira do herói. */
  column: (_origin, target) =>
    Array.from({ length: BOARD_ROWS }, (_unused, row) => ({ col: target.col, row })),
  /** A casa do herói e as quatro vizinhas ortogonais. */
  cross: (_origin, target) => [
    { col: target.col, row: target.row },
    ...ORTHOGONAL_DIRECTIONS.map((dir) => ({ col: target.col + dir.col, row: target.row + dir.row })),
  ],
};

/** Área do padrão, sempre recortada para ficar dentro do tabuleiro. */
export function patternCells(pattern: TelegraphPatternId, origin: Position, target: Position): Position[] {
  return TELEGRAPH_PATTERNS[pattern](origin, target).filter(isInsideBoard);
}

/**
 * Herói em torno do qual o golpe é montado (null se não houver herói vivo). Determinístico:
 * 'nearest-hero' escolhe o mais próximo do chefe; 'lowest-hp-hero', o de menor PV (empate: o mais
 * próximo). Em novo empate vale a ordem da lista.
 */
export function chooseTelegraphTarget(
  boss: Unit,
  heroes: readonly Unit[],
  strategy: TelegraphTargeting,
): Unit | null {
  const living = heroes.filter((hero) => isAlive(hero) && hero.definition.team === 'hero');
  if (living.length === 0) return null;

  const better = (candidate: Unit, best: Unit): boolean => {
    const nearer = unitDistance(candidate, boss) < unitDistance(best, boss);
    if (strategy === 'lowest-hp-hero') {
      if (candidate.hp !== best.hp) return candidate.hp < best.hp;
    }
    return nearer;
  };

  return living.reduce((best, candidate) => (better(candidate, best) ? candidate : best));
}

/** Ataque da vez no rodízio do chefe. */
export function selectTelegraphedAttack(boss: Unit, config: TelegraphConfig): TelegraphedAttack | null {
  const state = boss.telegraph;
  if (!state || config.attacks.length === 0) return null;
  return config.attacks[state.nextAttack % config.attacks.length];
}

/**
 * Cria a intenção de ataque. A área é calculada AQUI, uma única vez, e congelada: depois disso
 * nada (nem o movimento dos heróis) a altera. O resultado só muda o campo `status`.
 */
export function createTelegraphIntent(
  id: string,
  boss: Unit,
  attack: TelegraphedAttack,
  target: Unit,
  turn: number,
): TelegraphIntent {
  // Para um alvo grande, o padrão é aplicado a cada casa do corpo dele e as áreas são unidas
  // (sem repetir casas): assim o golpe cobre o alvo inteiro. Para 1×1 é o padrão de uma casa só.
  const seen = new Set<string>();
  const cells: Position[] = [];
  for (const bodyCell of unitCells(target)) {
    for (const cell of patternCells(attack.pattern, boss.position, bodyCell)) {
      if (seen.has(positionKey(cell))) continue;
      seen.add(positionKey(cell));
      cells.push(Object.freeze({ col: cell.col, row: cell.row }));
    }
  }

  return {
    id,
    bossUid: boss.uid,
    bossName: boss.definition.name,
    attackId: attack.id,
    attackName: attack.name,
    pattern: attack.pattern,
    targetUid: target.uid,
    cells: Object.freeze(cells),
    damage: attack.damage,
    friendlyFire: attack.friendlyFire ?? false,
    announcedTurn: turn,
    status: 'pending',
  };
}