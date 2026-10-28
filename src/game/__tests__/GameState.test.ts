import { describe, expect, it } from 'vitest';
import { GameState } from '../core/GameState';
import { ARCHER, ASSASSIN, CLERIC, MAGE, WARRIOR } from '../data/heroes';
import { GOBLIN, SKELETON, SLIME } from '../data/monsters';
import type { GameEvent } from '../types';
import { RIGHT, stateWith, unit } from './helpers';

/** Herói sozinho (Guerreiro em C5) contra um Goblin, para cenários simples. */
function duel(goblinCol: number, goblinRow: number) {
  return stateWith(() => [unit(WARRIOR, 2, 4), unit(GOBLIN, goblinCol, goblinRow)]);
}

describe('Batalha inicial', () => {
  it('tem 5 heróis e 3 monstros em casas distintas, com HP cheio e dano', () => {
    const state = new GameState();

    expect(state.heroes).toHaveLength(5);
    expect(state.monsters).toHaveLength(3);
    expect(state.turn).toBe(1);
    expect(state.phase).toBe('player');
    expect(state.outcome).toBe('ongoing');

    const cells = new Set(state.units.map((u) => `${u.position.col},${u.position.row}`));
    expect(cells.size).toBe(8);
    for (const u of state.units) {
      expect(u.hp).toBe(u.maxHp);
      expect(u.damage).toBeGreaterThan(0);
    }
  });
});

describe('Movimentação', () => {
  it('só oferece casas dentro do tabuleiro, livres e sem obstáculos', () => {
    const state = stateWith(
      () => [unit(ARCHER, 0, 5), unit(WARRIOR, 1, 5), unit(GOBLIN, 3, 0)],
      [
        { col: 0, row: 4 },
        { col: 1, row: 4 },
      ],
    );
    const archer = state.heroes[0];

    // Cercado por um aliado, por dois obstáculos (um na diagonal) e pelas bordas do tabuleiro.
    expect(state.getValidMoves(archer)).toHaveLength(0);
  });

  it('um movimento válido muda a posição e a direção; um inválido não faz nada', () => {
    const state = stateWith(() => [unit(MAGE, 3, 5), unit(GOBLIN, 0, 0)]);
    const mage = state.heroes[0];

    state.toggleSelection(mage.uid);
    expect(state.moveSelectedUnit({ col: 0, row: 0 })).toBe(false);
    expect(state.phase).toBe('player');
    expect(state.turn).toBe(1);

    expect(state.moveSelectedUnit({ col: 4, row: 5 })).toBe(true);
    expect(mage.position).toEqual({ col: 4, row: 5 });
    expect(mage.facing).toEqual(RIGHT);
  });
});

describe('Dano e morte', () => {
  it('o ataque reduz o HP do alvo e registra o golpe', () => {
    const state = duel(2, 3);
    const goblin = state.monsters[0];

    state.passTurn();
    state.resolveAll();

    expect(goblin.hp).toBe(GOBLIN.maxHp - WARRIOR.damage);
    expect(state.log.some((e) => e.message.includes('Guerreiro atacou Goblin'))).toBe(true);
  });

  it('o HP nunca fica abaixo de zero', () => {
    const state = duel(2, 3);
    const goblin = state.monsters[0];
    goblin.hp = 1;

    state.passTurn();
    state.resolveAll();

    expect(goblin.hp).toBe(0);
  });

  it('quem chega a zero sai do tabuleiro, continua na lista e não pode receber ações', () => {
    const state = stateWith(() => [unit(WARRIOR, 2, 4), unit(GOBLIN, 2, 3), unit(SLIME, 5, 0)]);
    const goblin = state.monsters[0];
    goblin.hp = WARRIOR.damage;

    state.passTurn();
    state.resolveAll();

    expect(goblin.hp).toBe(0);
    expect(state.monsters).toHaveLength(1);
    expect(state.monsterRoster).toHaveLength(2);
    expect(state.getUnitAt({ col: 2, row: 3 })).toBeNull();
    expect(state.log.some((e) => e.message === 'Goblin foi derrotado!')).toBe(true);
  });

  it('herói morto não pode ser selecionado, movido nem agir', () => {
    const state = stateWith(() => [unit(WARRIOR, 2, 4), unit(ASSASSIN, 4, 4), unit(GOBLIN, 3, 4)]);
    const [warrior, assassin] = state.heroes;
    warrior.hp = 0;

    state.toggleSelection(warrior.uid);
    expect(state.selectedUnit).toBeNull();
    expect(state.getValidMoves(warrior)).toHaveLength(0);

    state.passTurn();
    state.resolveAll();
    expect(state.log.some((e) => e.message.startsWith('Guerreiro atacou'))).toBe(false);
    expect(assassin.hp).toBeGreaterThan(0);
  });

  it('monstro morto na fase dos heróis não age na fase dos monstros', () => {
    const state = stateWith(() => [unit(WARRIOR, 2, 4), unit(GOBLIN, 2, 3), unit(SLIME, 5, 0)]);
    const warrior = state.heroes[0];
    state.monsters[0].hp = 1;

    state.passTurn();
    state.resolveAll();

    expect(warrior.hp).toBe(WARRIOR.maxHp);
    expect(state.log.some((e) => e.message.startsWith('Goblin atacou'))).toBe(false);
    expect(state.log.some((e) => e.message.startsWith('Goblin avançou'))).toBe(false);
  });

  it('ataques de monstros também causam dano e matam heróis', () => {
    const state = stateWith(() => [unit(MAGE, 2, 4), unit(GOBLIN, 2, 3), unit(SLIME, 5, 0)]);
    const mage = state.heroes[0];
    mage.hp = GOBLIN.damage;

    state.passTurn();
    state.resolveAll();

    expect(mage.hp).toBe(0);
    expect(state.heroes).toHaveLength(0);
    expect(state.outcome).toBe('defeat');
  });
});

describe('Fluxo de turnos', () => {
  it('mover um herói inicia a resolução: heróis atacam, monstros agem, próximo turno', () => {
    const state = stateWith(() => [unit(WARRIOR, 2, 4), unit(GOBLIN, 2, 0)]);
    const phases: string[] = [];
    state.subscribe(() => phases.push(state.phase));

    state.toggleSelection(state.heroes[0].uid);
    expect(state.moveSelectedUnit({ col: 2, row: 3 })).toBe(true);
    expect(state.phase).toBe('heroes');
    expect(state.isResolving).toBe(true);
    expect(state.selectedUnit).toBeNull();

    state.resolveAll();

    expect(state.phase).toBe('player');
    expect(state.turn).toBe(2);
    expect(phases).toContain('heroes');
    expect(phases).toContain('monsters');
    expect(phases.at(-1)).toBe('player');
  });

  it('passar a vez também faz os heróis atacarem', () => {
    const state = duel(2, 3);

    expect(state.passTurn()).toBe(true);
    state.resolveAll();

    expect(state.monsters[0].hp).toBe(GOBLIN.maxHp - WARRIOR.damage);
    expect(state.turn).toBe(2);
  });

  it('o jogador não consegue agir durante a resolução', () => {
    const state = duel(2, 3);
    const warrior = state.heroes[0];
    state.passTurn();

    expect(state.isResolving).toBe(true);
    state.toggleSelection(warrior.uid);
    expect(state.selectedUnit).toBeNull();
    expect(state.moveSelectedUnit({ col: 3, row: 4 })).toBe(false);
    expect(state.passTurn()).toBe(false);

    state.resolveAll();
    expect(state.turn).toBe(2);
    expect(state.phase).toBe('player');

    // Depois da resolução as ações voltam.
    state.toggleSelection(warrior.uid);
    expect(state.selectedUnit).toBe(warrior);
  });

  it('a resolução anda passo a passo: primeiro os heróis, depois os monstros', () => {
    const state = stateWith(() => [unit(WARRIOR, 2, 4), unit(GOBLIN, 2, 3), unit(SLIME, 5, 0)]);
    const goblin = state.monsters[0];
    state.passTurn();

    state.step(); // guerreiro ataca
    expect(state.phase).toBe('heroes');
    expect(state.lastActor?.definition.id).toBe('warrior');
    expect(goblin.hp).toBe(GOBLIN.maxHp - WARRIOR.damage); // HP atualiza na hora
    expect(state.lastDamage).toHaveLength(1);

    state.step(); // fecha a fase dos heróis; o goblin (já em alcance) ataca em seguida
    expect(state.phase).toBe('monsters');
    expect(state.lastActor?.definition.id).toBe('goblin');
    expect(state.heroes[0].hp).toBe(WARRIOR.maxHp - GOBLIN.damage);
  });

  it('emite os eventos na ordem resolving, step e turn', () => {
    const state = duel(2, 3);
    const events: GameEvent[] = [];
    state.subscribe((event) => events.push(event));

    state.passTurn();
    state.resolveAll();

    expect(events[0]).toBe('resolving');
    expect(events.at(-1)).toBe('turn');
    expect(events).toContain('step');
  });

  it('cada unidade age no máximo uma vez por fase', () => {
    const state = stateWith(() => [
      unit(WARRIOR, 2, 4),
      unit(GOBLIN, 2, 3),
      unit(SLIME, 5, 0),
    ]);

    state.passTurn();
    state.resolveAll();

    const warriorHits = state.log.filter((e) => e.message.startsWith('Guerreiro atacou'));
    const goblinHits = state.log.filter((e) => e.message.startsWith('Goblin atacou'));
    expect(warriorHits).toHaveLength(1);
    expect(goblinHits).toHaveLength(1);
  });

  it('registra o início de cada turno e as fases no log', () => {
    const state = duel(2, 3);
    state.passTurn();
    state.resolveAll();

    const messages = state.log.map((e) => e.message);
    expect(messages).toContain('Turno 1 começou. Sua vez.');
    expect(messages).toContain('Os heróis atacam.');
    expect(messages).toContain('Os monstros agem.');
    expect(messages).toContain('Turno 2 começou. Sua vez.');
  });

  it('um ataque em área do mago atinge vários monstros de uma vez', () => {
    // Mago em D6 virado para cima: centro em D3; goblin no centro e esqueleto no braço direito.
    const state = stateWith(() => [unit(MAGE, 3, 5), unit(GOBLIN, 3, 2), unit(SKELETON, 4, 2)]);

    state.passTurn();
    state.resolveAll();

    const [goblin, skeleton] = state.monsterRoster;
    expect(goblin.hp).toBe(GOBLIN.maxHp - MAGE.damage);
    expect(skeleton.hp).toBe(SKELETON.maxHp - MAGE.damage);
    expect(state.log.some((e) => e.message.startsWith('Mago atacou Goblin'))).toBe(true);
    expect(state.log.some((e) => e.message.startsWith('Mago atacou Esqueleto'))).toBe(true);
  });
});

describe('Vitória e derrota', () => {
  it('vitória: todos os monstros mortos encerram o combate antes dos monstros agirem', () => {
    const state = stateWith(() => [unit(WARRIOR, 2, 4), unit(GOBLIN, 2, 3)]);
    state.monsters[0].hp = 1;

    state.passTurn();
    state.resolveAll();

    expect(state.outcome).toBe('victory');
    expect(state.phase).toBe('over');
    expect(state.isOver).toBe(true);
    expect(state.turn).toBe(1);
    expect(state.heroes[0].hp).toBe(WARRIOR.maxHp);
    expect(state.log.at(-1)?.message.startsWith('Vitória')).toBe(true);
  });

  it('derrota: todos os heróis mortos encerram o combate', () => {
    const state = stateWith(() => [unit(CLERIC, 2, 5), unit(GOBLIN, 2, 4)]);
    state.heroes[0].hp = 1;

    state.passTurn();
    state.resolveAll();

    expect(state.outcome).toBe('defeat');
    expect(state.phase).toBe('over');
    expect(state.log.at(-1)?.message.startsWith('Derrota')).toBe(true);
  });

  it('depois do fim, nenhuma ação é aceita', () => {
    const state = stateWith(() => [unit(WARRIOR, 2, 4), unit(GOBLIN, 2, 3)]);
    state.monsters[0].hp = 1;
    state.passTurn();
    state.resolveAll();

    const turn = state.turn;
    state.toggleSelection(state.heroes[0].uid);
    expect(state.selectedUnit).toBeNull();
    expect(state.moveSelectedUnit({ col: 3, row: 4 })).toBe(false);
    expect(state.passTurn()).toBe(false);
    state.step();
    expect(state.turn).toBe(turn);
    expect(state.outcome).toBe('victory');
  });
});

describe('Reinício', () => {
  it('restaura HP, unidades, turno, resultado, fase e log', () => {
    const state = new GameState();
    for (const monster of state.monsters) monster.hp = 0;
    state.heroes[0].hp = 3;
    state.passTurn();
    state.resolveAll();
    expect(state.outcome).toBe('victory');

    state.reset();

    expect(state.outcome).toBe('ongoing');
    expect(state.phase).toBe('player');
    expect(state.turn).toBe(1);
    expect(state.heroes).toHaveLength(5);
    expect(state.monsters).toHaveLength(3);
    for (const u of state.units) expect(u.hp).toBe(u.maxHp);
    expect(state.log).toHaveLength(2);
    expect(state.lastDamage).toHaveLength(0);
  });

  it('pode ser usado no meio da resolução e deixa o jogador agir de novo', () => {
    const state = new GameState();
    state.passTurn();
    state.step();
    expect(state.isResolving).toBe(true);

    state.reset();

    expect(state.phase).toBe('player');
    expect(state.isResolving).toBe(false);
    state.step(); // não deve fazer nada
    expect(state.turn).toBe(1);
    state.toggleSelection(state.heroes[0].uid);
    expect(state.selectedUnit).not.toBeNull();
  });
});

describe('Partidas completas', () => {
  it('terminam sem travar e sem estados inválidos (movimento aleatório, 100 partidas)', () => {
    let seed = 2024;
    const random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

    for (let game = 0; game < 100; game++) {
      const state = new GameState();
      let guard = 0;

      while (!state.isOver && guard++ < 200) {
        const hero = state.heroes[Math.floor(random() * state.heroes.length)];
        state.toggleSelection(hero.uid);
        const moves = state.getValidMoves(hero);
        if (moves.length === 0 || random() < 0.15) {
          state.passTurn();
        } else {
          state.moveSelectedUnit(moves[Math.floor(random() * moves.length)]);
        }
        state.resolveAll();

        const cells = state.units.map((u) => `${u.position.col},${u.position.row}`);
        expect(new Set(cells).size).toBe(cells.length);
        for (const u of state.units) {
          expect(u.hp).toBeGreaterThan(0);
          expect(u.hp).toBeLessThan(u.maxHp + 1);
        }
      }

      expect(state.isOver).toBe(true);
    }
  });
});