import type { Position, Unit } from '../types';
import type { ReachableCell } from './board';
import {
  computeDistanceMap,
  computeReachable,
  footprintCells,
  footprintFits,
  getMovementDirections,
  occupies,
  positionKey,
  positionsEqual,
  sizeOf,
  unitCells,
} from './board';
import type { AttackContext } from './combat';
import { findAttackTargets, isAlive } from './combat';

/**
 * IA simples dos monstros. Decide para onde o monstro deve andar neste turno:
 *  - se já tem alvo ao alcance, não se move (retorna null);
 *  - senão, escolhe entre as casas alcançáveis a que permite atacar e, na falta
 *    dela, a mais próxima de algum herói (distância real, contornando bloqueios);
 *  - em empate, prefere a casa que exige menos passos.
 * Retorna null também quando nenhuma casa melhora a situação atual.
 */
export function chooseMonsterMove(monster: Unit, context: AttackContext): ReachableCell | null {
  if (findAttackTargets(monster, context).length > 0) return null;

  const heroes = context.units.filter((unit) => isAlive(unit) && unit.definition.team === 'hero');
  if (heroes.length === 0) return null;

  const size = sizeOf(monster.definition);

  // Casa bloqueada para este monstro: obstáculo ou outra unidade viva (o próprio corpo é livre).
  const isCellBlocked = (pos: Position): boolean =>
    context.obstacles.some((obstacle) => positionsEqual(obstacle, pos)) ||
    context.units.some((unit) => unit !== monster && isAlive(unit) && occupies(unit, pos));
  // Posição (casa de referência) bloqueada: a área inteira precisa caber e estar livre.
  const isAnchorBlocked = (anchor: Position): boolean =>
    !footprintFits(anchor, size) || footprintCells(anchor, size).some(isCellBlocked);

  // Distância até o herói mais próximo, contando todas as casas ocupadas pelos heróis.
  const distances = computeDistanceMap(
    heroes.flatMap((hero) => unitCells(hero)),
    isCellBlocked,
  );
  const distanceAt = (anchor: Position): number =>
    Math.min(...footprintCells(anchor, size).map((cell) => distances.get(positionKey(cell)) ?? Infinity));

  const options = computeReachable(
    monster.position,
    monster.definition.movement,
    isAnchorBlocked,
    getMovementDirections(monster.definition),
  );

  let best: ReachableCell | null = null;
  let bestCanAttack = false;
  let bestDistance = distanceAt(monster.position);

  for (const option of options) {
    const canAttack = findAttackTargets(monster, context, option.position).length > 0;
    const distance = distanceAt(option.position);
    const isBetter =
      (canAttack && !bestCanAttack) || (canAttack === bestCanAttack && distance < bestDistance);

    if (isBetter) {
      best = option;
      bestCanAttack = canAttack;
      bestDistance = distance;
    }
  }

  return best;
}