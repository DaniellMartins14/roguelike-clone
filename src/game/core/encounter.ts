import { HERO_FORMATION, createUnit } from '../data/battleSetup';
import type { BattleSetup } from '../data/battleSetup';
import { SPAWN_SLOTS } from '../data/encounters';
import type { FloorConfig } from '../data/encounters';
import type { Position, Unit } from '../types';
import { footprintCells, footprintFits, isInsideBoard, isSupportedSize, positionKey, sizeOf } from './board';

/**
 * Preparação de encontros: cria o grupo de heróis, o recoloca a cada andar e monta as unidades
 * de um andar a partir da sua configuração. Sem Phaser e sem estado próprio.
 */

/** Cria os cinco heróis, com PV cheio, já na formação inicial. */
export function createParty(): Unit[] {
  return HERO_FORMATION.map((entry, index) =>
    createUnit(entry.definition, entry.position, `${entry.definition.id}-${index}`),
  );
}

/**
 * Prepara o grupo para um novo encontro. O que muda: heróis vivos voltam à formação inicial e
 * viradas para cima, a habilidade especial fica disponível de novo (uma vez por encontro) e
 * qualquer atordoamento some. O PV NÃO é restaurado, e heróis derrotados continuam derrotados.
 */
export function prepareParty(party: readonly Unit[]): void {
  for (const hero of party) {
    hero.abilityUsed = false;
    hero.stunned = false;
    hero.facing = { col: 0, row: -1 };

    const formation = HERO_FORMATION.find((entry) => entry.definition.id === hero.definition.id);
    if (formation && hero.hp > 0) {
      hero.position = { col: formation.position.col, row: formation.position.row };
    }
  }
}

/** As primeiras `count` casas de surgimento. Lança erro se o encontro tiver monstros demais. */
export function spawnPositions(count: number): Position[] {
  if (count > SPAWN_SLOTS.length) {
    throw new RangeError(
      `Encontro com ${count} monstros, mas só existem ${SPAWN_SLOTS.length} casas de surgimento.`,
    );
  }
  return SPAWN_SLOTS.slice(0, count).map((slot) => ({ col: slot.col, row: slot.row }));
}

/**
 * Monta o encontro de um andar: o grupo recebido (as MESMAS unidades, com o PV atual) mais
 * monstros novos, com PV cheio, nas casas de surgimento. Os uids dos monstros incluem o andar,
 * então nunca se confundem com os de outro andar.
 */
export function buildEncounter(config: FloorConfig, party: readonly Unit[]): BattleSetup {
  spawnPositions(config.monsters.length); // erro claro se houver monstros demais
  const taken = new Set<string>(config.obstacles.map(positionKey));
  for (const hero of party) {
    if (hero.hp > 0) {
      for (const cell of footprintCells(hero.position, sizeOf(hero.definition))) taken.add(positionKey(cell));
    }
  }

  // Cada monstro ocupa a primeira casa de surgimento onde a ÁREA INTEIRA dele cabe no tabuleiro e
  // está livre (para monstros 1×1 isso é simplesmente a próxima casa da lista).
  const monsters = config.monsters.map((definition, index) => {
    const size = sizeOf(definition);
    const slot = SPAWN_SLOTS.find((candidate) => {
      if (!footprintFits(candidate, size)) return false;
      return footprintCells(candidate, size).every((cell) => !taken.has(positionKey(cell)));
    });
    if (!slot) throw new RangeError(`Sem espaço para posicionar ${definition.name} no andar ${config.floor}.`);
    for (const cell of footprintCells(slot, size)) taken.add(positionKey(cell));
    return createUnit(definition, slot, `f${config.floor}-${definition.id}-${index}`);
  });

  return {
    units: [...party, ...monsters],
    obstacles: config.obstacles.map((cell) => ({ col: cell.col, row: cell.row })),
  };
}

/** Confere uma configuração de andar. Retorna a lista de problemas (vazia se estiver tudo certo). */
export function validateFloor(config: FloorConfig): string[] {
  const problems: string[] = [];
  const where = `Andar ${config.floor}`;

  if (!Number.isInteger(config.floor) || config.floor < 1) {
    problems.push(`${where}: número de andar inválido.`);
  }
  if (config.monsters.length < 1) {
    problems.push(`${where}: o encontro precisa de pelo menos um monstro.`);
  }
  if (config.monsters.length > SPAWN_SLOTS.length) {
    problems.push(`${where}: monstros demais (${config.monsters.length} para ${SPAWN_SLOTS.length} casas).`);
  }

  for (const monster of config.monsters) {
    if (monster.team !== 'monster') problems.push(`${where}: ${monster.name} não é um monstro.`);
    if (!isSupportedSize(sizeOf(monster))) {
      problems.push(`${where}: ${monster.name} tem tamanho não suportado (só 1×1 e 2×2).`);
    }
    if (monster.maxHp <= 0 || monster.damage <= 0) {
      problems.push(`${where}: ${monster.name} tem PV ou dano inválido.`);
    }
  }

  const bosses = config.monsters.filter((m) => m.rank === 'boss').length;
  const miniBosses = config.monsters.filter((m) => m.rank === 'mini-boss').length;
  if (config.type === 'normal' && (bosses > 0 || miniBosses > 0)) {
    problems.push(`${where}: encontro comum não pode ter chefes.`);
  }
  if (config.type === 'mini-boss' && !(miniBosses === 1 && bosses === 0)) {
    problems.push(`${where}: encontro de mini-chefe precisa de exatamente um mini-chefe.`);
  }
  if (config.type === 'boss' && !(bosses === 1 && miniBosses === 0)) {
    problems.push(`${where}: encontro de chefe precisa de exatamente um chefe principal.`);
  }

  const formationKeys = new Set(HERO_FORMATION.map((entry) => positionKey(entry.position)));
  const slotKeys = new Set(SPAWN_SLOTS.map((slot) => positionKey(slot)));
  const seen = new Set<string>();
  for (const obstacle of config.obstacles) {
    const key = positionKey(obstacle);
    if (!isInsideBoard(obstacle)) problems.push(`${where}: obstáculo fora do tabuleiro (${key}).`);
    if (seen.has(key)) problems.push(`${where}: obstáculo duplicado (${key}).`);
    if (formationKeys.has(key)) problems.push(`${where}: obstáculo sobre a formação dos heróis (${key}).`);
    if (slotKeys.has(key)) problems.push(`${where}: obstáculo sobre uma casa de surgimento (${key}).`);
    if (obstacle.row < 2 || obstacle.row > 3) {
      problems.push(`${where}: obstáculos só podem ficar nas linhas 2 e 3 (${key}).`);
    }
    seen.add(key);
  }

  return problems;
}