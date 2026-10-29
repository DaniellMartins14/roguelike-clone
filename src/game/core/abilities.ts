import type { AbilityDefinition, Position, Unit } from '../types';
import {
  ALL_DIRECTIONS,
  DIAGONAL_DIRECTIONS,
  ORTHOGONAL_DIRECTIONS,
  isInsideBoard,
  occupies,
  positionsEqual,
  unitCells,
} from './board';
import type { AttackContext } from './combat';
import { isAlive } from './combat';
export const ABILITY_BALANCE = {
  ambushAttacks: 2,
  exuraHealRatio: 0.65,
} as const;

export const STOMP: AbilityDefinition = {
  id: 'stomp',
  name: 'Pisada',
  description: 'Atordoa os monstros ao redor por uma ação.',
  target: 'none',
};

export const AMBUSH: AbilityDefinition = {
  id: 'ambush',
  name: 'Emboscada',
  description: 'Salta para uma casa diagonal ao alvo e ataca até duas vezes.',
  target: 'monster',
};

export const PIERCING_SHOT: AbilityDefinition = {
  id: 'piercing-shot',
  name: 'Tiro Perfurante',
  description: 'Dispara em linha reta, atravessando todas as unidades e causando dano igual ao dano atual do Arqueiro.',
  target: 'direction',
};

export const FIREBALL: AbilityDefinition = {
  id: 'fireball',
  name: 'Bola de Fogo',
  description: 'Causa dano igual ao dano atual do Mago em uma área de 3×3 casas.',
  target: 'cell',
};

export const EXURA: AbilityDefinition = {
  id: 'exura',
  name: 'Exura',
  description: 'Recupera PV equivalentes a 65% dos PV máximos do próprio Clérigo.',
  target: 'hero',
};
/**
 * Regras puras das habilidades especiais: dizem QUEM e ONDE cada habilidade afeta.
 * Aplicar dano, cura e atordoamento é trabalho do GameState.
 */

function offset(from: Position, dir: Position, steps = 1): Position {
  return { col: from.col + dir.col * steps, row: from.row + dir.row * steps };
}

// ---------- Pisada (Guerreiro) ----------

/** As casas ao redor do herói (as 8 vizinhas se for 1×1) que estão dentro do tabuleiro. */
export function stompArea(hero: Unit): Position[] {
  const body = unitCells(hero);
  const area: Position[] = [];
  for (const cell of body) {
    for (const dir of ALL_DIRECTIONS) {
      const around = offset(cell, dir);
      if (
        isInsideBoard(around) &&
        !body.some((own) => positionsEqual(own, around)) &&
        !area.some((known) => positionsEqual(known, around))
      ) {
        area.push(around);
      }
    }
  }
  return area;
}

/** Monstros vivos ao redor (cada um uma vez, mesmo que seja grande). Heróis nunca são afetados. */
export function stompTargets(hero: Unit, units: readonly Unit[]): Unit[] {
  const area = stompArea(hero);
  return units.filter(
    (unit) =>
      isAlive(unit) &&
      unit.definition.team === 'monster' &&
      unitCells(unit).some((cell) => area.some((around) => positionsEqual(around, cell))),
  );
}

// ---------- Emboscada (Assassino) ----------

/**
 * Casas válidas para o Assassino saltar: casas que têm uma casa do alvo na diagonal (as 4
 * diagonais se o alvo é 1×1), dentro do tabuleiro, fora do alvo, sem obstáculo e sem outra
 * unidade viva. A casa atual do próprio Assassino conta como livre (se ele já está numa diagonal
 * do alvo, pode ficar onde está e só atacar).
 */
export function ambushDestinations(
  assassin: Unit,
  target: Unit,
  context: AttackContext,
): Position[] {
  const body = unitCells(target);
  const candidates: Position[] = [];
  for (const bodyCell of body) {
    for (const dir of DIAGONAL_DIRECTIONS) {
      const cell = offset(bodyCell, dir);
      if (!body.some((own) => positionsEqual(own, cell)) && !candidates.some((c) => positionsEqual(c, cell))) {
        candidates.push(cell);
      }
    }
  }
  return candidates.filter(
    (cell) =>
      isInsideBoard(cell) &&
      !context.obstacles.some((obstacle) => positionsEqual(obstacle, cell)) &&
      !context.units.some((unit) => unit !== assassin && isAlive(unit) && occupies(unit, cell)),
  );
}

// ---------- Tiro Perfurante (Arqueiro) ----------

/** Todas as casas da trajetória: da casa seguinte ao arqueiro até a borda do tabuleiro. */
export function pierceLine(from: Position, direction: Position): Position[] {
  const line: Position[] = [];
  for (let step = 1; ; step++) {
    const cell = offset(from, direction, step);
    if (!isInsideBoard(cell)) break;
    line.push(cell);
  }
  return line;
}

/**
 * Personagens vivos atingidos, na ordem da trajetória. O projétil atravessa tudo (unidades e
 * obstáculos) e atinge aliados e inimigos; o próprio arqueiro nunca é atingido.
 */
export function pierceTargets(archer: Unit, direction: Position, units: readonly Unit[]): Unit[] {
  const targets: Unit[] = [];
  for (const cell of pierceLine(archer.position, direction)) {
    const unit = units.find((candidate) => candidate !== archer && isAlive(candidate) && occupies(candidate, cell));
    // Uma entidade grande aparece em várias casas da linha, mas é atingida uma única vez.
    if (unit && !targets.includes(unit)) targets.push(unit);
  }
  return targets;
}

// ---------- Bola de Fogo (Mago) ----------

/** Quadrado 3×3 centrado em `center`, recortado para ficar dentro do tabuleiro. */
export function fireballArea(center: Position): Position[] {
  const area: Position[] = [];
  for (let dRow = -1; dRow <= 1; dRow++) {
    for (let dCol = -1; dCol <= 1; dCol++) {
      const cell: Position = { col: center.col + dCol, row: center.row + dRow };
      if (isInsideBoard(cell)) area.push(cell);
    }
  }
  return area;
}

/** Todos os personagens vivos na área, aliados e o próprio Mago incluídos. Ignora obstáculos. */
export function fireballTargets(center: Position, units: readonly Unit[]): Unit[] {
  const area = fireballArea(center);
  return units.filter(
    (unit) => isAlive(unit) && unitCells(unit).some((own) => area.some((cell) => positionsEqual(cell, own))),
  );
}

// ---------- Exura (Clérigo) ----------

/**
 * Quantidade efetivamente curada: `ratio` do PV máximo arredondada para cima, limitada ao que
 * falta para o PV máximo. Retorna 0 se o alvo já está com a vida cheia.
 */
export function healAmount(target: Unit, ratio: number, source: Unit = target): number {
  const wanted = Math.ceil(source.maxHp * ratio);
  return Math.max(0, Math.min(wanted, target.maxHp - target.hp));
}

// ---------- Utilidades ----------

/** Nome da direção ortogonal, para o log. */
export function directionName(direction: Position): string {
  const match = ORTHOGONAL_DIRECTIONS.findIndex((dir) => positionsEqual(dir, direction));
  return ['cima', 'a direita', 'baixo', 'a esquerda'][match] ?? 'direção desconhecida';
}