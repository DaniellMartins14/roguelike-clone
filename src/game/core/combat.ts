import type { Position, Unit } from '../types';
import {
  DIAGONAL_DIRECTIONS,
  ORTHOGONAL_DIRECTIONS,
  isInsideBoard,
  occupies,
  positionsEqual,
  unitCells,
} from './board';

/** O que o cálculo de ataque precisa saber do campo de batalha. */
export interface AttackContext {
  /** Unidades em campo. Unidades derrotadas (hp <= 0) são ignoradas. */
  units: readonly Unit[];
  obstacles: readonly Position[];
}

export function isAlive(unit: Unit): boolean {
  return unit.hp > 0;
}

/** Direções cobertas pelo ataque normal da unidade. */
export function getAttackDirections(attacker: Unit): readonly Position[] {
  switch (attacker.definition.attack.directions) {
    case 'orthogonal':
      return ORTHOGONAL_DIRECTIONS;
    case 'diagonal':
      return DIAGONAL_DIRECTIONS;
    case 'facing':
      return [attacker.facing];
  }
}

function isObstacleAt(context: AttackContext, cell: Position): boolean {
  return context.obstacles.some((obstacle) => positionsEqual(obstacle, cell));
}

/** Unidade viva que ocupa a casa (uma entidade grande ocupa várias casas, mas é UMA unidade). */
function unitAt(context: AttackContext, cell: Position, ignore: Unit): Unit | undefined {
  return context.units.find((unit) => unit !== ignore && isAlive(unit) && occupies(unit, cell));
}

/**
 * Casas de onde o ataque "sai" na direção `dir`: as casas do corpo do atacante cuja vizinha nessa
 * direção está fora do corpo. Para 1×1 é só a própria casa; para 2×2 são as casas da borda.
 */
function originCells(attacker: Unit, from: Position, dir: Position): Position[] {
  const body = unitCells(attacker, from);
  return body.filter(
    (cell) => !body.some((other) => other.col === cell.col + dir.col && other.row === cell.row + dir.row),
  );
}

/**
 * Alvos do ataque normal da unidade (apenas inimigos vivos).
 * `from` permite simular o ataque a partir de outra casa (usado pela IA).
 */
export function findAttackTargets(
  attacker: Unit,
  context: AttackContext,
  from: Position = attacker.position,
): Unit[] {
  return attacker.definition.attack.shape === 'cross'
    ? findCrossTargets(attacker, context, from)
    : findLineTargets(attacker, context, from);
}

/**
 * Ataque em linha. Em cada direção, a "linha de tiro" avança casa a casa
 * até o alcance e termina na primeira coisa encontrada:
 *  - borda do tabuleiro ou obstáculo: nada é atingido;
 *  - unidade aliada: bloqueia, nada é atingido;
 *  - unidade inimiga: é o alvo daquela direção.
 * Com alcance 1, isso equivale a "casas adjacentes".
 */
function findLineTargets(attacker: Unit, context: AttackContext, from: Position): Unit[] {
  const targets: Unit[] = [];
  const { range } = attacker.definition.attack;

  for (const dir of getAttackDirections(attacker)) {
    for (const origin of originCells(attacker, from, dir)) {
      for (let step = 1; step <= range; step++) {
        const cell: Position = { col: origin.col + dir.col * step, row: origin.row + dir.row * step };

        if (!isInsideBoard(cell) || isObstacleAt(context, cell)) break;

        const occupant = unitAt(context, cell, attacker);
        if (!occupant) continue;

        // Uma entidade grande pode ser atravessada por vários raios, mas é um alvo só.
        if (occupant.definition.team !== attacker.definition.team && !targets.includes(occupant)) {
          targets.push(occupant);
        }
        break;
      }
    }
  }

  return targets;
}

/**
 * Ataque em cruz de 5 casas. Para cada direção do ataque:
 *  - o centro da cruz fica exatamente `range` casas à frente e precisa estar dentro do tabuleiro;
 *  - o caminho até o centro precisa estar livre: qualquer obstáculo ou qualquer unidade
 *    (aliada ou inimiga) nas casas anteriores ao centro bloqueia o ataque inteiro, e um
 *    obstáculo sobre o próprio centro também;
 *  - sendo livre, atingem-se os inimigos no centro e nos quatro vizinhos ortogonais do centro
 *    (casas fora do tabuleiro são ignoradas). Aliados dentro da cruz não sofrem dano.
 */
function findCrossTargets(attacker: Unit, context: AttackContext, from: Position): Unit[] {
  const targets: Unit[] = [];
  const { range } = attacker.definition.attack;

  for (const dir of getAttackDirections(attacker)) {
    for (const origin of originCells(attacker, from, dir)) {
      const center: Position = { col: origin.col + dir.col * range, row: origin.row + dir.row * range };
      if (!isInsideBoard(center)) continue;

      let blocked = false;
      for (let step = 1; step <= range; step++) {
        const cell: Position = { col: origin.col + dir.col * step, row: origin.row + dir.row * step };
        if (isObstacleAt(context, cell) || (step < range && unitAt(context, cell, attacker))) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      const area: Position[] = [
        center,
        ...ORTHOGONAL_DIRECTIONS.map((d) => ({ col: center.col + d.col, row: center.row + d.row })),
      ];
      for (const cell of area) {
        if (!isInsideBoard(cell)) continue;
        const occupant = unitAt(context, cell, attacker);
        if (
          occupant &&
          occupant.definition.team !== attacker.definition.team &&
          !targets.includes(occupant)
        ) {
          targets.push(occupant);
        }
      }
    }
  }

  return targets;
}