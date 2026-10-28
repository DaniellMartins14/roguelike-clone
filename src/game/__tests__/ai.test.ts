import { describe, expect, it } from 'vitest';
import { chooseMonsterMove } from '../core/ai';
import { positionKey } from '../core/board';
import { findAttackTargets } from '../core/combat';
import { ASSASSIN, WARRIOR } from '../data/heroes';
import { GOBLIN, SKELETON, SLIME } from '../data/monsters';
import { context, stateWith, unit } from './helpers';

describe('IA dos monstros', () => {
  it('se aproxima do herói quando não há alvo ao alcance', () => {
    const hero = unit(WARRIOR, 2, 5);
    const goblin = unit(GOBLIN, 2, 0);

    const move = chooseMonsterMove(goblin, context([hero, goblin]));

    expect(move).not.toBeNull();
    expect(move?.position).toEqual({ col: 2, row: 2 }); // goblin anda 2 casas
  });

  it('fica parado quando já tem um herói ao alcance', () => {
    const hero = unit(WARRIOR, 2, 3);
    const goblin = unit(GOBLIN, 2, 2);

    expect(chooseMonsterMove(goblin, context([hero, goblin]))).toBeNull();
  });

  it('prefere uma casa de onde consegue atacar', () => {
    const hero = unit(WARRIOR, 2, 3);
    const goblin = unit(GOBLIN, 2, 0);

    const move = chooseMonsterMove(goblin, context([hero, goblin]));

    expect(move?.position).toEqual({ col: 2, row: 2 });
  });

  it('não escolhe casas ocupadas por outras unidades nem obstáculos', () => {
    const hero = unit(WARRIOR, 2, 4);
    const goblin = unit(GOBLIN, 2, 1);
    const blocker = unit(SLIME, 2, 2);

    const move = chooseMonsterMove(goblin, context([hero, goblin, blocker], [{ col: 1, row: 2 }]));

    // Casa (2,2) está ocupada e (1,2) é obstáculo: só sobra desviar pela direita.
    expect(move).not.toBeNull();
    expect(move?.position).not.toEqual({ col: 2, row: 2 });
    expect(move?.position).not.toEqual({ col: 1, row: 2 });
  });

  it('contorna obstáculos e acaba em posição de ataque, sem nunca pisar no obstáculo', () => {
    const hero = unit(WARRIOR, 2, 4);
    const goblin = unit(GOBLIN, 2, 0);
    const obstacles = [
      { col: 2, row: 2 },
      { col: 1, row: 2 },
      { col: 3, row: 2 },
    ];
    const ctx = context([hero, goblin], obstacles);

    for (let turn = 0; turn < 12; turn++) {
      const move = chooseMonsterMove(goblin, ctx);
      if (!move) break;
      goblin.position = { col: move.position.col, row: move.position.row };
      const onObstacle = obstacles.some(
        (o) => positionKey(o) === positionKey(goblin.position),
      );
      expect(onObstacle).toBe(false);
      expect(goblin.position.col).toBeGreaterThan(-1);
      expect(goblin.position.col).toBeLessThan(6);
    }

    expect(findAttackTargets(goblin, ctx)).toHaveLength(1);
  });

  it('fica parado quando não existe caminho até nenhum herói', () => {
    const hero = unit(WARRIOR, 0, 5);
    const goblin = unit(GOBLIN, 5, 0);
    const wall = [
      { col: 4, row: 0 },
      { col: 5, row: 1 },
    ];

    expect(chooseMonsterMove(goblin, context([hero, goblin], wall))).toBeNull();
  });

  it('não faz nada sem heróis vivos', () => {
    const goblin = unit(GOBLIN, 2, 2);
    const deadHero = unit(WARRIOR, 2, 5);
    deadHero.hp = 0;

    expect(chooseMonsterMove(goblin, context([goblin, deadHero]))).toBeNull();
  });

  it('dois monstros nunca terminam na mesma casa nem em casa de herói', () => {
    // Heróis intocáveis na prática (HP enorme) para a batalha durar vários turnos.
    const state = stateWith(() => {
      const hero = unit(ASSASSIN, 2, 5);
      hero.hp = 999;
      return [hero, unit(GOBLIN, 1, 0), unit(SKELETON, 2, 0), unit(SLIME, 3, 0)];
    });

    for (let turn = 0; turn < 8 && !state.isOver; turn++) {
      state.passTurn();
      state.resolveAll();
      const keys = state.units.map((u) => positionKey(u.position));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
