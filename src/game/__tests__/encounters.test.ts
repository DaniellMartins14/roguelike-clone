import { describe, expect, it } from 'vitest';
import { Campaign } from '../core/Campaign';
import { isInsideBoard, positionKey } from '../core/board';
import { buildEncounter, createParty, prepareParty, spawnPositions, validateFloor } from '../core/encounter';
import { HERO_FORMATION } from '../data/battleSetup';
import { ABYSS_IDOL, GOBLIN_CHIEF } from '../data/bosses';
import { CAMPAIGN_FLOORS, SPAWN_SLOTS } from '../data/encounters';
import type { FloorConfig } from '../data/encounters';
import { GOBLIN, SKELETON, SLIME } from '../data/monsters';
import type { Position } from '../types';

const BASE: FloorConfig = {
  floor: 1,
  type: 'normal',
  name: 'Teste',
  monsters: [GOBLIN, SLIME],
  obstacles: [],
};

const cell = (col: number, row: number): Position => ({ col, row });

describe('Configuração dos andares', () => {
  it('os 10 andares da campanha de teste são válidos', () => {
    expect(CAMPAIGN_FLOORS).toHaveLength(10);
    for (const config of CAMPAIGN_FLOORS) {
      expect(validateFloor(config)).toEqual([]);
    }
  });

  it('os andares são numerados de 1 a 10 e têm os tipos esperados', () => {
    CAMPAIGN_FLOORS.forEach((config, index) => {
      expect(config.floor).toBe(index + 1);
      const expected = config.floor === 5 ? 'mini-boss' : config.floor === 10 ? 'boss' : 'normal';
      expect(config.type).toBe(expected);
    });
  });

  it('o mini-chefe e o chefe são distinguíveis dos monstros comuns', () => {
    expect(GOBLIN_CHIEF.rank).toBe('mini-boss');
    expect(ABYSS_IDOL.rank).toBe('boss');
    expect(ABYSS_IDOL.name).toBe('Ídolo do Abismo');
    for (const common of [GOBLIN, SKELETON, SLIME]) expect(common.rank === undefined).toBe(true);
    expect(ABYSS_IDOL.maxHp).toBeGreaterThan(GOBLIN_CHIEF.maxHp);
    expect(GOBLIN_CHIEF.maxHp).toBeGreaterThan(SKELETON.maxHp);
    expect(new Set([GOBLIN.symbol, GOBLIN_CHIEF.symbol, ABYSS_IDOL.symbol]).size).toBe(3);
  });

  it('as casas de surgimento são válidas, únicas, no topo e longe da formação dos heróis', () => {
    const keys = SPAWN_SLOTS.map(positionKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const slot of SPAWN_SLOTS) {
      expect(isInsideBoard(slot)).toBe(true);
      expect(slot.row).toBeLessThan(2);
      for (const hero of HERO_FORMATION) {
        const distance = Math.max(Math.abs(slot.col - hero.position.col), Math.abs(slot.row - hero.position.row));
        expect(distance).toBeGreaterThan(2);
      }
    }
  });

  it('a dificuldade cresce ao longo dos andares comuns (1-4 e 6-9)', () => {
    const threat = (config: FloorConfig) =>
      config.monsters.reduce((sum, m) => sum + m.maxHp + 5 * m.damage, 0);
    const byFloor = (n: number) => threat(CAMPAIGN_FLOORS[n - 1]);

    for (const [from, to] of [[1, 4], [6, 9]]) {
      for (let n = from; n < to; n++) expect(byFloor(n + 1)).toBeGreaterThan(byFloor(n) - 1);
    }
    expect(byFloor(10)).toBeGreaterThan(byFloor(5));
    expect(byFloor(9)).toBeGreaterThan(byFloor(1));
  });
});

describe('Validação de andares', () => {
  it('aceita uma configuração correta', () => {
    expect(validateFloor(BASE)).toEqual([]);
  });

  it('recusa obstáculos fora do tabuleiro, duplicados, na formação, nas casas de surgimento ou fora das linhas centrais', () => {
    expect(validateFloor({ ...BASE, obstacles: [cell(6, 3)] }).length).toBeGreaterThan(0);
    expect(validateFloor({ ...BASE, obstacles: [cell(2, 3), cell(2, 3)] }).length).toBeGreaterThan(0);
    expect(validateFloor({ ...BASE, obstacles: [cell(2, 4)] }).length).toBeGreaterThan(0); // herói
    expect(validateFloor({ ...BASE, obstacles: [cell(2, 0)] }).length).toBeGreaterThan(0); // surgimento
    expect(validateFloor({ ...BASE, obstacles: [cell(0, 4)] }).length).toBeGreaterThan(0); // linha 4
  });

  it('recusa encontros vazios ou com monstros demais', () => {
    expect(validateFloor({ ...BASE, monsters: [] }).length).toBeGreaterThan(0);
    const tooMany = Array.from({ length: SPAWN_SLOTS.length + 1 }, () => GOBLIN);
    expect(validateFloor({ ...BASE, monsters: tooMany }).length).toBeGreaterThan(0);
  });

  it('exige que o tipo do encontro combine com os chefes presentes', () => {
    expect(validateFloor({ ...BASE, monsters: [GOBLIN_CHIEF] }).length).toBeGreaterThan(0); // comum com chefe
    expect(validateFloor({ ...BASE, type: 'mini-boss' }).length).toBeGreaterThan(0); // sem mini-chefe
    expect(validateFloor({ ...BASE, type: 'boss', monsters: [ABYSS_IDOL, ABYSS_IDOL] }).length).toBeGreaterThan(0);
    expect(validateFloor({ ...BASE, type: 'boss', monsters: [GOBLIN_CHIEF] }).length).toBeGreaterThan(0);
    expect(validateFloor({ ...BASE, type: 'mini-boss', monsters: [GOBLIN_CHIEF, GOBLIN] })).toEqual([]);
    expect(validateFloor({ ...BASE, type: 'boss', monsters: [ABYSS_IDOL, SKELETON] })).toEqual([]);
  });

  it('spawnPositions recusa mais monstros que casas', () => {
    expect(spawnPositions(3)).toHaveLength(3);
    let error: unknown = null;
    try {
      spawnPositions(SPAWN_SLOTS.length + 1);
    } catch (caught) {
      error = caught;
    }
    expect(error instanceof RangeError).toBe(true);
  });

  it('a Campaign recusa configurações inválidas', () => {
    const attempt = (floors: readonly FloorConfig[]): boolean => {
      try {
        new Campaign(floors);
        return false;
      } catch {
        return true;
      }
    };
    expect(attempt([])).toBe(true);
    expect(attempt([{ ...BASE, floor: 2 }])).toBe(true); // numeração errada
    expect(attempt([{ ...BASE, obstacles: [cell(2, 4)] }])).toBe(true);
    expect(attempt([BASE])).toBe(false);
  });
});

describe('Preparação do grupo e do encontro', () => {
  it('createParty cria os cinco heróis na formação, com PV cheio e uids únicos', () => {
    const party = createParty();
    expect(party).toHaveLength(5);
    expect(new Set(party.map((u) => u.uid)).size).toBe(5);
    party.forEach((hero, index) => {
      expect(hero.hp).toBe(hero.maxHp);
      expect(hero.position).toEqual(HERO_FORMATION[index].position);
      expect(hero.abilityUsed).toBe(false);
    });
  });

  it('prepareParty reinicia posição, direção, habilidade e atordoamento, mas não o PV', () => {
    const party = createParty();
    const [warrior, assassin] = party;
    warrior.hp = 7;
    warrior.position = cell(0, 0);
    warrior.facing = cell(1, 0);
    warrior.abilityUsed = true;
    warrior.stunned = true;
    assassin.hp = 0;
    assassin.position = cell(5, 5);

    prepareParty(party);

    expect(warrior.hp).toBe(7);
    expect(warrior.position).toEqual(HERO_FORMATION[0].position);
    expect(warrior.facing).toEqual(cell(0, -1));
    expect(warrior.abilityUsed).toBe(false);
    expect(warrior.stunned).toBe(false);
    expect(assassin.hp).toBe(0); // quem morreu continua morto
  });

  it('buildEncounter reaproveita os mesmos heróis e cria monstros novos com PV cheio e uids do andar', () => {
    const party = createParty();
    const config = CAMPAIGN_FLOORS[2];
    const setup = buildEncounter(config, party);

    expect(setup.units.slice(0, 5)).toEqual(party);
    expect(setup.units[0]).toBe(party[0]); // o mesmo objeto, não uma cópia
    const monsters = setup.units.slice(5);
    expect(monsters).toHaveLength(config.monsters.length);
    for (const monster of monsters) {
      expect(monster.hp).toBe(monster.maxHp);
      expect(monster.uid.startsWith('f3-')).toBe(true);
    }
    expect(new Set(setup.units.map((u) => u.uid)).size).toBe(setup.units.length);
  });
});
