import { describe, expect, it } from 'vitest';
import { Campaign } from '../core/Campaign';
import type { GameState } from '../core/GameState';
import { isInsideBoard, positionKey } from '../core/board';
import {
  TELEGRAPH_PATTERNS,
  chooseTelegraphTarget,
  patternCells,
  selectTelegraphedAttack,
} from '../core/telegraph';
import { ABYSS_IDOL } from '../data/bosses';
import type { FloorConfig } from '../data/encounters';
import { ABYSS_PILLAR, ABYSS_SWEEP } from '../data/telegraphs';
import { ARCHER, CLERIC, MAGE, WARRIOR } from '../data/heroes';
import { GOBLIN, SLIME } from '../data/monsters';
import type {
  Position,
  TelegraphConfig,
  TelegraphIntent,
  TelegraphPatternId,
  TelegraphedAttack,
  Unit,
  UnitDefinition,
} from '../types';
import { castAbility, stateWith, unit } from './helpers';

const cell = (col: number, row: number): Position => ({ col, row });
const keys = (cells: readonly Position[]) => cells.map(positionKey).sort();

/** Ataque de teste: linha do herói mais próximo, 9 de dano. */
const SWEEP: TelegraphedAttack = {
  id: 't-sweep',
  name: 'Varredura de Teste',
  pattern: 'row',
  targeting: 'nearest-hero',
  damage: 9,
};

/** Chefe de teste: usa o visual do Ídolo, mas com ataques e PV controlados e corpo a corpo fraco. */
function testBoss(
  config: TelegraphConfig,
  options: { maxHp?: number; damage?: number } = {},
): UnitDefinition {
  return {
    ...ABYSS_IDOL,
    id: 'test-boss',
    name: 'Chefe de Teste',
    maxHp: options.maxHp ?? 200,
    damage: options.damage ?? 1,
    telegraph: config,
  };
}

const slowSweep: TelegraphConfig = { attacks: [SWEEP], cooldownTurns: 99 };

function find(state: GameState, id: string): Unit {
  const found = state.roster.find((u) => u.definition.id === id);
  if (!found) throw new Error(`unidade não encontrada: ${id}`);
  return found;
}

function onlyIntent(state: GameState): TelegraphIntent {
  const intents = state.telegraphs;
  if (intents.length === 0) throw new Error('nenhuma intenção registrada');
  return intents[0];
}

const logIndex = (state: GameState, text: string) =>
  state.log.findIndex((entry) => entry.message.includes(text));

/** Chefe em (2,0), Guerreiro em (2,3): a Varredura de Teste mira a linha 3. */
function duel(config: TelegraphConfig = slowSweep) {
  return stateWith(() => [
    unit(testBoss(config), 2, 0),
    unit(WARRIOR, 2, 3),
    unit(MAGE, 4, 5),
  ]);
}

// ---------------------------------------------------------------------------------------------
describe('Padrões de área', () => {
  it('linha e coluna cobrem o tabuleiro inteiro naquele eixo', () => {
    expect(keys(patternCells('row', cell(0, 0), cell(3, 2)))).toEqual(
      keys([0, 1, 2, 3, 4, 5].map((col) => cell(col, 2))),
    );
    expect(keys(patternCells('column', cell(0, 0), cell(3, 2)))).toEqual(
      keys([0, 1, 2, 3, 4, 5].map((row) => cell(3, row))),
    );
  });

  it('a cruz tem 5 casas no meio do tabuleiro', () => {
    expect(keys(patternCells('cross', cell(0, 0), cell(3, 3)))).toEqual(
      keys([cell(3, 3), cell(3, 2), cell(4, 3), cell(3, 4), cell(2, 3)]),
    );
  });

  it('respeita os limites do tabuleiro: cantos e bordas são recortados', () => {
    expect(patternCells('cross', cell(2, 0), cell(0, 0))).toHaveLength(3);
    expect(patternCells('cross', cell(2, 0), cell(5, 5))).toHaveLength(3);
    expect(patternCells('cross', cell(2, 0), cell(0, 3))).toHaveLength(4);
    expect(patternCells('cross', cell(2, 0), cell(3, 0))).toHaveLength(4);
    expect(patternCells('cross', cell(2, 0), cell(3, 5))).toHaveLength(4);
  });

  it('todas as casas de todos os padrões, para qualquer alvo, estão dentro do tabuleiro e sem repetição', () => {
    const patterns = Object.keys(TELEGRAPH_PATTERNS) as TelegraphPatternId[];
    for (const pattern of patterns) {
      for (let col = 0; col < 6; col++) {
        for (let row = 0; row < 6; row++) {
          const cells = patternCells(pattern, cell(2, 0), cell(col, row));
          expect(cells.every(isInsideBoard)).toBe(true);
          expect(new Set(cells.map(positionKey)).size).toBe(cells.length);
          expect(cells.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('as áreas do Ídolo deixam espaço de sobra para esquivar (no máximo 6 das 36 casas)', () => {
    for (const attack of [ABYSS_SWEEP, ABYSS_PILLAR]) {
      for (let col = 0; col < 6; col++) {
        for (let row = 0; row < 6; row++) {
          expect(patternCells(attack.pattern, cell(2, 0), cell(col, row)).length).toBeLessThan(7);
        }
      }
    }
  });
});

describe('Escolha do alvo e do ataque', () => {
  it('"nearest-hero" escolhe o herói mais próximo do chefe', () => {
    const boss = unit(testBoss(slowSweep), 2, 0);
    const near = unit(WARRIOR, 2, 3);
    const far = unit(MAGE, 0, 5);
    expect(chooseTelegraphTarget(boss, [far, near], 'nearest-hero')).toBe(near);
  });

  it('"lowest-hp-hero" escolhe o de menor PV e desempata pelo mais próximo', () => {
    const boss = unit(testBoss(slowSweep), 2, 0);
    const healthy = unit(WARRIOR, 2, 3);
    const hurt = unit(MAGE, 0, 5);
    hurt.hp = 3;
    expect(chooseTelegraphTarget(boss, [healthy, hurt], 'lowest-hp-hero')).toBe(hurt);

    const tieNear = unit(ARCHER, 2, 2);
    const tieFar = unit(CLERIC, 5, 5);
    tieNear.hp = 5;
    tieFar.hp = 5;
    expect(chooseTelegraphTarget(boss, [tieFar, tieNear], 'lowest-hp-hero')).toBe(tieNear);
  });

  it('ignora heróis derrotados e retorna null sem heróis vivos', () => {
    const boss = unit(testBoss(slowSweep), 2, 0);
    const dead = unit(WARRIOR, 2, 3);
    dead.hp = 0;
    expect(chooseTelegraphTarget(boss, [dead], 'nearest-hero')).toBeNull();
  });

  it('os ataques do chefe seguem em rodízio', () => {
    const config: TelegraphConfig = { attacks: [ABYSS_SWEEP, ABYSS_PILLAR], cooldownTurns: 1 };
    const boss = unit(testBoss(config), 2, 0);
    expect(selectTelegraphedAttack(boss, config)?.id).toBe('abyss-sweep');
    if (boss.telegraph) boss.telegraph.nextAttack = 1;
    expect(selectTelegraphedAttack(boss, config)?.id).toBe('abyss-pillar');
    if (boss.telegraph) boss.telegraph.nextAttack = 2;
    expect(selectTelegraphedAttack(boss, config)?.id).toBe('abyss-sweep');
  });

  it('a configuração do Ídolo do Abismo é válida', () => {
    const config = ABYSS_IDOL.telegraph;
    expect(config === undefined).toBe(false);
    expect((config?.attacks.length ?? 0) > 0).toBe(true);
    for (const attack of config?.attacks ?? []) {
      expect(attack.damage).toBeGreaterThan(0);
      expect(attack.pattern in TELEGRAPH_PATTERNS).toBe(true);
    }
    expect((config?.cooldownTurns ?? -1) > -1).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
describe('Anúncio e registro imutável da intenção', () => {
  it('o chefe começa o encontro com um golpe anunciado e a mensagem de preparação no log', () => {
    const state = duel();
    const intent = onlyIntent(state);

    expect(state.pendingTelegraphs).toHaveLength(1);
    expect(intent.status).toBe('pending');
    expect(intent.bossUid).toBe('test-boss@2,0');
    expect(intent.attackId).toBe('t-sweep');
    expect(intent.pattern).toBe('row');
    expect(intent.damage).toBe(9);
    expect(intent.announcedTurn).toBe(1);
    expect(intent.targetUid).toBe(find(state, 'warrior').uid);
    expect(keys(intent.cells)).toEqual(keys([0, 1, 2, 3, 4, 5].map((col) => cell(col, 3))));

    const message = state.log.find((entry) => entry.kind === 'telegraph');
    expect(message?.message.includes('está preparando Varredura de Teste')).toBe(true);
    expect(message?.message.includes('casas em vermelho')).toBe(true);
  });

  it('as casas anunciadas não mudam depois que o jogador se movimenta', () => {
    const state = duel();
    const intent = onlyIntent(state);
    const cellsBefore = intent.cells;
    const keysBefore = keys(intent.cells);

    state.toggleSelection(find(state, 'warrior').uid);
    expect(state.moveSelectedUnit(cell(2, 4))).toBe(true);

    expect(intent.cells).toBe(cellsBefore); // o mesmo registro, não recalculado
    expect(keys(intent.cells)).toEqual(keysBefore);

    state.resolveAll();
    expect(keys(intent.cells)).toEqual(keysBefore); // nem depois da resolução
  });

  it('o registro é congelado: a área não pode ser alterada', () => {
    const intent = onlyIntent(duel());

    let pushFailed = false;
    try {
      (intent.cells as Position[]).push(cell(0, 0));
    } catch {
      pushFailed = true;
    }
    let editFailed = false;
    try {
      (intent.cells[0] as Position).col = 99;
    } catch {
      editFailed = true;
    }

    expect(pushFailed).toBe(true);
    expect(editFailed).toBe(true);
    expect(intent.cells.every(isInsideBoard)).toBe(true);
  });

  it('um chefe só tem um golpe pendente por vez', () => {
    const state = duel({ attacks: [SWEEP], cooldownTurns: 0 });
    for (let turn = 0; turn < 5; turn++) {
      expect(state.pendingTelegraphs.length).toBeLessThan(2);
      state.passTurn();
      state.resolveAll();
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe('Esquiva e dano', () => {
  it('um herói que sai da área antes da resolução não recebe dano', () => {
    const state = duel();
    const warrior = find(state, 'warrior');
    state.toggleSelection(warrior.uid);
    state.moveSelectedUnit(cell(2, 4)); // sai da linha 3
    state.resolveAll();

    expect(warrior.hp).toBe(WARRIOR.maxHp);
    expect(find(state, 'mage').hp).toBe(MAGE.maxHp);
    expect(onlyIntent(state).status).toBe('resolved');
    expect(logIndex(state, 'Ninguém estava nas casas atingidas')).toBeGreaterThan(-1);
  });

  it('um herói que entra na área recebe dano, e quem ficou também', () => {
    const state = stateWith(() => [
      unit(testBoss(slowSweep), 2, 0),
      unit(WARRIOR, 2, 3),
      unit(CLERIC, 2, 4),
    ]);
    const cleric = find(state, 'cleric');
    const warrior = find(state, 'warrior');
    state.toggleSelection(cleric.uid);
    state.moveSelectedUnit(cell(3, 3)); // entra na linha 3
    state.resolveAll();

    expect(cleric.hp).toBe(CLERIC.maxHp - 9);
    expect(warrior.hp).toBe(WARRIOR.maxHp - 9);
  });

  it('o dano é aplicado individualmente, o HP atualiza na hora e as mortes são processadas', () => {
    const state = stateWith(() => [
      unit(testBoss(slowSweep), 2, 0),
      unit(WARRIOR, 2, 3),
      unit(MAGE, 4, 3),
      unit(CLERIC, 0, 5),
    ]);
    const mage = find(state, 'mage');
    mage.hp = 5;

    state.passTurn();
    state.step(); // heróis sem alvo são pulados: este passo já é o golpe do chefe

    expect(find(state, 'warrior').hp).toBe(WARRIOR.maxHp - 9);
    expect(mage.hp).toBe(0);
    expect(state.lastDamage).toHaveLength(2);
    expect(state.lastDamage.some((event) => event.targetUid === mage.uid && event.killed)).toBe(true);
    expect(state.log.some((entry) => entry.message === 'Mago foi derrotado!')).toBe(true);
    expect(state.heroes.map((h) => h.definition.id).includes('mage')).toBe(false);
  });

  it('por padrão só atinge os heróis; com fogo amigo atinge aliados do chefe, nunca o próprio chefe', () => {
    const column: TelegraphedAttack = { ...SWEEP, id: 't-col', pattern: 'column' };
    const build = (friendly: boolean) =>
      stateWith(() => [
        unit(testBoss({ attacks: [{ ...column, friendlyFire: friendly }], cooldownTurns: 99 }), 2, 0),
        unit(WARRIOR, 2, 3),
        unit(SLIME, 2, 5),
      ]);

    const safe = build(false);
    safe.passTurn();
    safe.resolveAll();
    expect(find(safe, 'slime').hp).toBe(SLIME.maxHp);

    const friendly = build(true);
    friendly.passTurn();
    friendly.resolveAll();
    expect(find(friendly, 'slime').hp).toBe(SLIME.maxHp - 9);
    expect(find(friendly, 'test-boss').hp).toBe(200); // nunca o próprio chefe
  });

  it('heróis derrotados na área não são atingidos de novo, e o último herói morto causa derrota', () => {
    const state = stateWith(() => [unit(testBoss(slowSweep), 2, 0), unit(WARRIOR, 2, 3)]);
    find(state, 'warrior').hp = 5;

    state.passTurn();
    state.resolveAll();

    expect(find(state, 'warrior').hp).toBe(0);
    expect(state.outcome).toBe('defeat');
    expect(state.log.filter((entry) => entry.message === 'Guerreiro foi derrotado!')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------
describe('Ordem das fases e travas', () => {
  it('o golpe é resolvido depois dos ataques dos heróis e antes da ação dos monstros', () => {
    const state = stateWith(() => [unit(testBoss(slowSweep), 2, 2), unit(WARRIOR, 2, 3)]);
    const phases: string[] = [];
    state.subscribe(() => phases.push(state.phase));

    state.passTurn();
    state.resolveAll();

    const hero = logIndex(state, 'Guerreiro atacou Chefe de Teste');
    const release = logIndex(state, 'libera Varredura de Teste');
    const hit = logIndex(state, 'Varredura de Teste atingiu');
    const monsters = logIndex(state, 'Os monstros agem.');
    expect(hero).toBeGreaterThan(logIndex(state, 'Os heróis atacam.'));
    expect(release).toBeGreaterThan(hero);
    expect(hit).toBeGreaterThan(release);
    expect(monsters).toBeGreaterThan(hit);

    expect(phases.indexOf('heroes')).toBeLessThan(phases.indexOf('telegraphs'));
    expect(phases.indexOf('telegraphs')).toBeLessThan(phases.indexOf('monsters'));
    expect(state.phase).toBe('player');
    expect(state.turn).toBe(2);
  });

  it('o próximo turno só começa depois de concluir a resolução, e nada é aceito no meio dela', () => {
    const state = duel();
    const warrior = find(state, 'warrior');
    state.passTurn();
    state.step(); // heróis sem alvo: este passo é o golpe do chefe

    expect(state.phase).toBe('telegraphs');
    expect(state.isResolving).toBe(true);
    expect(state.turn).toBe(1);
    expect(state.lastEffect?.id).toBe('telegraph');
    expect(state.lastActor?.definition.id).toBe('test-boss');
    expect(onlyIntent(state).status).toBe('resolved');

    state.toggleSelection(warrior.uid);
    expect(state.selectedUnit).toBeNull();
    expect(state.passTurn()).toBe(false);
    expect(state.moveSelectedUnit(cell(1, 3))).toBe(false);
    expect(state.beginAbility()).toBe(false);

    state.resolveAll();
    expect(state.phase).toBe('player');
    expect(state.turn).toBe(2);
  });

  it('o golpe só é executado uma vez, mesmo com muitos turnos e passos a mais', () => {
    const state = duel(); // pausa de 99 turnos: só o golpe inicial
    const warrior = find(state, 'warrior');
    warrior.hp = 999;

    for (let turn = 0; turn < 5; turn++) {
      state.passTurn();
      state.resolveAll();
    }
    state.step();
    state.step();

    expect(state.telegraphs).toHaveLength(1);
    expect(onlyIntent(state).status).toBe('resolved');
    // Só o Guerreiro estava na linha 3 (o Mago fica na linha 5): exatamente uma vítima, uma vez.
    expect(state.log.filter((entry) => entry.message.startsWith('Varredura de Teste atingiu'))).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------
describe('Cadência dos golpes', () => {
  it('com 1 turno de pausa, um golpe é anunciado a cada dois turnos', () => {
    const state = duel({ attacks: [SWEEP], cooldownTurns: 1 });
    find(state, 'warrior').hp = 999;
    const pendingAtTurnStart: number[] = [];

    for (let turn = 0; turn < 6; turn++) {
      pendingAtTurnStart.push(state.pendingTelegraphs.length);
      state.passTurn();
      state.resolveAll();
    }

    expect(pendingAtTurnStart).toEqual([1, 0, 1, 0, 1, 0]);
    expect(state.telegraphs.filter((intent) => intent.status === 'resolved')).toHaveLength(3);
  });

  it('sem pausa, há um golpe anunciado em todo turno', () => {
    const state = duel({ attacks: [SWEEP], cooldownTurns: 0 });
    find(state, 'warrior').hp = 999;
    for (let turn = 0; turn < 4; turn++) {
      expect(state.pendingTelegraphs).toHaveLength(1);
      state.passTurn();
      state.resolveAll();
    }
  });

  it('o rodízio do Ídolo alterna Varredura (linha) e Pilar (cruz no herói mais ferido)', () => {
    const state = stateWith(() => [
      unit(ABYSS_IDOL, 2, 0),
      unit(WARRIOR, 2, 4),
      unit(MAGE, 4, 5),
    ]);
    find(state, 'warrior').hp = 999;
    find(state, 'mage').hp = 4;

    for (let turn = 0; turn < 5; turn++) {
      state.passTurn();
      state.resolveAll();
    }

    expect(state.telegraphs.map((intent) => intent.attackId).slice(0, 3)).toEqual([
      'abyss-sweep',
      'abyss-pillar',
      'abyss-sweep',
    ]);
    const pillar = state.telegraphs[1];
    expect(pillar.pattern).toBe('cross');
    expect(pillar.targetUid).toBe(find(state, 'mage').uid);
  });
});

// ---------------------------------------------------------------------------------------------
describe('Cancelamento', () => {
  it('matar o chefe antes da execução cancela o golpe na hora (a área vermelha some) e ninguém é atingido', () => {
    const state = stateWith(() => [
      unit(testBoss(slowSweep), 2, 2),
      unit(WARRIOR, 2, 3),
      unit(SLIME, 5, 0),
    ]);
    const warrior = find(state, 'warrior');
    find(state, 'test-boss').hp = WARRIOR.damage; // o ataque automático do Guerreiro o mata
    expect(state.pendingTelegraphs).toHaveLength(1);

    state.passTurn();
    state.step(); // ataque do Guerreiro mata o chefe

    expect(find(state, 'test-boss').hp).toBe(0);
    expect(onlyIntent(state).status).toBe('cancelled');
    expect(state.pendingTelegraphs).toHaveLength(0);

    state.resolveAll();
    expect(warrior.hp).toBe(WARRIOR.maxHp); // estaria na área, mas o golpe foi cancelado
    expect(state.outcome).toBe('ongoing');
    expect(state.turn).toBe(2);
    expect(state.log.some((entry) => entry.message.startsWith('Golpe cancelado'))).toBe(true);
    expect(state.log.some((entry) => entry.message.includes('libera'))).toBe(false);
  });

  it('o chefe morto por uma habilidade também cancela o golpe imediatamente', () => {
    const state = stateWith(() => [
      unit(testBoss(slowSweep), 2, 0),
      unit(MAGE, 3, 5),
      unit(SLIME, 5, 5),
    ]);
    find(state, 'test-boss').hp = 10;

    expect(castAbility(state, find(state, 'mage'), [cell(2, 0)])).toBe(true);

    expect(find(state, 'test-boss').hp).toBe(0);
    expect(onlyIntent(state).status).toBe('cancelled');
  });

  it('se o chefe já estiver morto na hora da resolução, o golpe é cancelado e não causa dano', () => {
    const state = stateWith(() => [
      unit(testBoss(slowSweep), 2, 0),
      unit(WARRIOR, 2, 3),
      unit(SLIME, 5, 5),
    ]);
    find(state, 'test-boss').hp = 0; // morte sem passar pelo dano normal

    state.passTurn();
    state.resolveAll();

    expect(onlyIntent(state).status).toBe('cancelled');
    expect(find(state, 'warrior').hp).toBe(WARRIOR.maxHp);
    expect(state.log.some((entry) => entry.message.includes('foi derrotado antes de concluir'))).toBe(true);
  });

  it('a vitória cancela o golpe pendente e nada causa dano depois do encerramento', () => {
    const state = stateWith(() => [unit(testBoss(slowSweep), 2, 2), unit(WARRIOR, 2, 3)]);
    const warrior = find(state, 'warrior');
    find(state, 'test-boss').hp = WARRIOR.damage;

    state.passTurn();
    state.resolveAll();

    expect(state.outcome).toBe('victory');
    expect(onlyIntent(state).status).toBe('cancelled');
    expect(state.pendingTelegraphs).toHaveLength(0);
    expect(warrior.hp).toBe(WARRIOR.maxHp);

    for (let i = 0; i < 5; i++) state.step();
    expect(warrior.hp).toBe(WARRIOR.maxHp);
    expect(state.lastDamage).toHaveLength(0);
  });

  it('a derrota cancela o golpe pendente: ele não é executado depois do fim', () => {
    const state = duel();
    for (const hero of state.heroes) hero.hp = 0;

    state.passTurn();
    state.resolveAll();

    expect(state.outcome).toBe('defeat');
    expect(onlyIntent(state).status).toBe('cancelled');
    expect(state.pendingTelegraphs).toHaveLength(0);
    expect(state.log.some((entry) => entry.message.includes('o combate terminou'))).toBe(true);
    expect(state.log.some((entry) => entry.message.includes('libera'))).toBe(false);
  });

  it('atordoar o chefe não interrompe o golpe já anunciado, mas ele perde o próximo anúncio', () => {
    const state = stateWith(() => [
      unit(testBoss({ attacks: [SWEEP], cooldownTurns: 0 }), 2, 2),
      unit(WARRIOR, 2, 3),
    ]);
    const warrior = find(state, 'warrior');
    warrior.hp = 999;
    const before = warrior.hp;

    expect(castAbility(state, warrior)).toBe(true); // Pisada: atordoa o chefe
    expect(find(state, 'test-boss').stunned).toBe(true);
    state.resolveAll();

    expect(warrior.hp).toBe(before - 9); // o golpe anunciado aconteceu
    expect(onlyIntent(state).status).toBe('resolved');
    expect(state.pendingTelegraphs).toHaveLength(0); // atordoado, não anunciou outro
    expect(find(state, 'test-boss').stunned).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
describe('Reinício e troca de andar', () => {
  it('reiniciar descarta as intenções antigas e começa com um golpe novo e válido', () => {
    const state = duel();
    const old = onlyIntent(state);
    state.passTurn();
    state.resolveAll();
    expect(old.status).toBe('resolved');

    state.reset();

    expect(state.telegraphs).toHaveLength(1);
    const fresh = onlyIntent(state);
    expect(fresh === old).toBe(false);
    expect(fresh.status).toBe('pending');
    expect(fresh.announcedTurn).toBe(1);
    expect(fresh.id).toBe('test-boss@2,0#1');
    expect(state.phase).toBe('player');
  });

  it('reiniciar no meio da resolução não deixa golpe resolvido nem fase presa', () => {
    const state = duel();
    state.passTurn();
    state.step();
    expect(state.isResolving).toBe(true);

    state.reset();

    expect(state.isResolving).toBe(false);
    state.step(); // não deve fazer nada
    expect(state.pendingTelegraphs).toHaveLength(1);
    expect(find(state, 'warrior').hp).toBe(WARRIOR.maxHp);
  });

  it('carregar outro encontro limpa as intenções pendentes', () => {
    const state = duel();
    expect(state.pendingTelegraphs).toHaveLength(1);

    state.loadEncounter({ units: [unit(WARRIOR, 2, 4), unit(GOBLIN, 2, 1)], obstacles: [] });

    expect(state.telegraphs).toHaveLength(0);
    expect(state.pendingTelegraphs).toHaveLength(0);
    expect(state.isThreatened(cell(2, 3))).toBe(false);
  });

  it('na campanha, o andar 10 começa com um golpe anunciado e os outros andares não', () => {
    const campaign = new Campaign();
    for (let floor = 1; floor <= 10; floor++) {
      const pending = campaign.battle.pendingTelegraphs;
      if (floor === 10) {
        expect(pending).toHaveLength(1);
        expect(pending[0].attackId).toBe('abyss-sweep');
        expect(pending[0].status).toBe('pending');
        expect(pending[0].announcedTurn).toBe(1);
      } else {
        expect(campaign.battle.telegraphs).toHaveLength(0);
        for (const monster of campaign.battle.monsters) monster.hp = 0;
        campaign.battle.passTurn();
        campaign.battle.resolveAll();
        expect(campaign.advance()).toBe(true);
      }
    }
  });

  it('reiniciar a campanha limpa o golpe do andar 10 e ao voltar ao 10 tudo começa válido', () => {
    const campaign = new Campaign();
    const reachBoss = () => {
      while (campaign.floorNumber < 10) {
        for (const monster of campaign.battle.monsters) monster.hp = 0;
        campaign.battle.passTurn();
        campaign.battle.resolveAll();
        campaign.advance();
      }
    };
    reachBoss();
    const first = campaign.battle.pendingTelegraphs[0];

    campaign.restart();
    expect(campaign.floorNumber).toBe(1);
    expect(campaign.battle.telegraphs).toHaveLength(0);

    reachBoss();
    const second = campaign.battle.pendingTelegraphs[0];
    expect(second === first).toBe(false);
    expect(second.status).toBe('pending');
    expect(second.id.endsWith('#1')).toBe(true);
    expect(find(campaign.battle, 'abyss-idol').hp).toBe(ABYSS_IDOL.maxHp);
    expect(campaign.battle.heroRoster).toHaveLength(5);
  });

  it('avançar de um andar de chefe não carrega o golpe para o andar seguinte', () => {
    const floors: FloorConfig[] = [
      { floor: 1, type: 'normal', name: 'A', monsters: [GOBLIN], obstacles: [] },
      { floor: 2, type: 'boss', name: 'B', monsters: [ABYSS_IDOL], obstacles: [] },
      { floor: 3, type: 'normal', name: 'C', monsters: [SLIME], obstacles: [] },
    ];
    const campaign = new Campaign(floors);
    const win = () => {
      for (const monster of campaign.battle.monsters) monster.hp = 0;
      campaign.battle.passTurn();
      campaign.battle.resolveAll();
    };

    win();
    campaign.advance();
    expect(campaign.battle.pendingTelegraphs).toHaveLength(1);
    const bossIntent = campaign.battle.pendingTelegraphs[0];

    win(); // o chefe cai com o golpe ainda pendente
    expect(bossIntent.status).toBe('cancelled');
    campaign.advance();

    expect(campaign.floorNumber).toBe(3);
    expect(campaign.battle.telegraphs).toHaveLength(0);
    expect(campaign.battle.pendingTelegraphs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------
describe('O Ídolo do Abismo no andar 10', () => {
  function bossFloor() {
    const campaign = new Campaign();
    while (campaign.floorNumber < 10) {
      for (const monster of campaign.battle.monsters) monster.hp = 0;
      campaign.battle.passTurn();
      campaign.battle.resolveAll();
      campaign.advance();
    }
    return campaign;
  }

  it('o primeiro golpe deixa esquiva possível: todo herói ameaçado tem uma casa segura ao alcance', () => {
    const { battle } = bossFloor();
    const threatened = battle.heroes.filter((hero) => battle.isThreatened(hero.position));

    expect(threatened.length).toBeGreaterThan(0);
    expect(battle.pendingTelegraphs[0].cells.length).toBeLessThan(7);
    for (const hero of threatened) {
      const safeMoves = battle.getValidMoves(hero).filter((move) => !battle.isThreatened(move));
      expect(safeMoves.length).toBeGreaterThan(0);
    }
  });

  it('esquivar de verdade evita o dano do golpe anunciado, e quem fica na área é atingido', () => {
    const { battle } = bossFloor();
    const target = battle.heroes.find((hero) => hero.uid === battle.pendingTelegraphs[0].targetUid);
    if (!target) throw new Error('alvo do golpe não encontrado');
    const safe = battle.getValidMoves(target).find((move) => !battle.isThreatened(move));
    if (!safe) throw new Error('sem casa segura');
    // Heróis que também estão na área e vão ficar parados.
    const stayers = battle.heroes.filter((hero) => hero !== target && battle.isThreatened(hero.position));
    expect(stayers.length).toBeGreaterThan(0);

    battle.toggleSelection(target.uid);
    battle.moveSelectedUnit(safe);
    battle.resolveAll();

    // O HP também pode cair por ataques normais dos monstros do andar; o que importa é o golpe.
    const hitBySweep = (name: string) =>
      battle.log.some((entry) => entry.message.startsWith(`Varredura do Abismo atingiu ${name}`));
    expect(hitBySweep(target.definition.name)).toBe(false);
    for (const stayer of stayers) expect(hitBySweep(stayer.definition.name)).toBe(true);
    expect(battle.telegraphs[0].status).toBe('resolved');
  });
});
