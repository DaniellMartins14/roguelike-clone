import { describe, expect, it } from 'vitest';
import { findAttackTargets } from '../core/combat';
import { ARCHER, ASSASSIN, CLERIC, MAGE, WARRIOR } from '../data/heroes';
import { GOBLIN } from '../data/monsters';
import { DOWN, LEFT, RIGHT, UP, context, uids, unit } from './helpers';

describe('Guerreiro', () => {
  it('ataca as quatro casas ortogonalmente adjacentes e ignora diagonais e casas distantes', () => {
    const warrior = unit(WARRIOR, 2, 2);
    const adjacent = [unit(GOBLIN, 2, 1), unit(GOBLIN, 3, 2), unit(GOBLIN, 2, 3), unit(GOBLIN, 1, 2)];
    const diagonal = unit(GOBLIN, 3, 3);
    const far = unit(GOBLIN, 2, 0);

    const targets = findAttackTargets(warrior, context([warrior, ...adjacent, diagonal, far]));

    expect(uids(targets)).toEqual(uids(adjacent));
  });
});

describe('Assassino', () => {
  it('ataca as quatro diagonais adjacentes e ignora as casas ortogonais', () => {
    const assassin = unit(ASSASSIN, 2, 2);
    const diagonals = [unit(GOBLIN, 1, 1), unit(GOBLIN, 3, 1), unit(GOBLIN, 1, 3), unit(GOBLIN, 3, 3)];
    const orthogonal = unit(GOBLIN, 2, 1);
    const farDiagonal = unit(GOBLIN, 4, 4);

    const targets = findAttackTargets(assassin, context([assassin, ...diagonals, orthogonal, farDiagonal]));

    expect(uids(targets)).toEqual(uids(diagonals));
  });
});

describe('Arqueiro', () => {
  it('atinge o primeiro inimigo em cada direção ortogonal, até 3 casas', () => {
    const archer = unit(ARCHER, 2, 2);
    const right1 = unit(GOBLIN, 4, 2); // 2 casas à direita
    const right2 = unit(GOBLIN, 5, 2); // atrás do primeiro: protegido
    const up = unit(GOBLIN, 2, 0); // 2 casas acima
    const left = unit(GOBLIN, 0, 2); // exatamente 2 casas à esquerda

    const targets = findAttackTargets(archer, context([archer, right1, right2, up, left]));

    expect(uids(targets)).toEqual(uids([right1, up, left]));
  });

  it('não alcança inimigos a 4 casas nem em diagonal', () => {
    const archer = unit(ARCHER, 0, 5);
    const far = unit(GOBLIN, 0, 1);
    const diagonal = unit(GOBLIN, 1, 4);

    expect(findAttackTargets(archer, context([archer, far, diagonal]))).toHaveLength(0);
  });

  it('é bloqueado por aliados e por obstáculos', () => {
    const archer = unit(ARCHER, 0, 3);
    const ally = unit(WARRIOR, 1, 3);
    const enemy = unit(GOBLIN, 2, 3);

    expect(findAttackTargets(archer, context([archer, ally, enemy]))).toHaveLength(0);
    expect(findAttackTargets(archer, context([archer, enemy], [{ col: 1, row: 3 }]))).toHaveLength(0);
    expect(findAttackTargets(archer, context([archer, enemy]))).toHaveLength(1);
  });
});

describe('Clérigo', () => {
  it('atinge o primeiro inimigo em cada diagonal, até 3 casas', () => {
    const cleric = unit(CLERIC, 2, 4);
    const upRight = unit(GOBLIN, 4, 2);
    const upLeft = unit(GOBLIN, 0, 2);
    const behind = unit(GOBLIN, 5, 1); // atrás de upRight: protegido

    const targets = findAttackTargets(cleric, context([cleric, upRight, upLeft, behind]));

    expect(uids(targets)).toEqual(uids([upRight, upLeft]));
  });

  it('alcança exatamente 3 casas e ignora ortogonais', () => {
    const cleric = unit(CLERIC, 2, 4);

    expect(findAttackTargets(cleric, context([cleric, unit(GOBLIN, 5, 1)]))).toHaveLength(1);
    expect(findAttackTargets(cleric, context([cleric, unit(GOBLIN, 2, 3)]))).toHaveLength(0);
  });

  it('é bloqueado por aliados e por obstáculos', () => {
    const cleric = unit(CLERIC, 2, 4);
    const far = unit(GOBLIN, 5, 1);

    expect(findAttackTargets(cleric, context([cleric, far, unit(WARRIOR, 3, 3)]))).toHaveLength(0);
    expect(findAttackTargets(cleric, context([cleric, far], [{ col: 4, row: 2 }]))).toHaveLength(0);
  });
});

describe('Mago (cruz de 5 casas, centro 3 casas à frente)', () => {
  // Mago em (3,5) virado para cima: centro (3,2); braços (3,1), (3,3), (2,2), (4,2).
  it('atinge inimigos no centro e nos quatro braços da cruz', () => {
    const mage = unit(MAGE, 3, 5, UP);
    const center = unit(GOBLIN, 3, 2);
    const top = unit(GOBLIN, 3, 1);
    const left = unit(GOBLIN, 2, 2);
    const right = unit(GOBLIN, 4, 2);

    const targets = findAttackTargets(mage, context([mage, center, top, left, right]));

    expect(uids(targets)).toEqual(uids([center, top, left, right]));
  });

  it('um inimigo no braço de baixo da cruz fica no caminho e bloqueia o ataque', () => {
    const mage = unit(MAGE, 3, 5, UP);
    // (3,3) é o braço de baixo da cruz, mas também é uma das casas do caminho até o centro.
    const inPath = unit(GOBLIN, 3, 3);

    expect(findAttackTargets(mage, context([mage, inPath]))).toHaveLength(0);
  });

  it('não atinge casas fora da cruz', () => {
    const mage = unit(MAGE, 3, 5, UP);
    const diagonalOfCenter = unit(GOBLIN, 2, 1);
    const twoAboveCenter = unit(GOBLIN, 3, 0);
    const sideOfMage = unit(GOBLIN, 4, 5);

    expect(
      findAttackTargets(mage, context([mage, diagonalOfCenter, twoAboveCenter, sideOfMage])),
    ).toHaveLength(0);
  });

  it('respeita a direção atual do mago', () => {
    // Mesmo mago, mesma casa (3,5) e mesmo alvo (3,2); só a direção muda.
    const target = unit(GOBLIN, 3, 2);
    const facingUp = unit(MAGE, 3, 5, UP); // centro (3,2): alvo no centro
    const facingRight = unit(MAGE, 3, 5, RIGHT); // centro (6,5): fora do tabuleiro
    const facingLeft = unit(MAGE, 3, 5, LEFT); // centro (0,5): alvo fora da cruz
    const facingDown = unit(MAGE, 3, 5, DOWN); // centro (3,8): fora do tabuleiro

    expect(findAttackTargets(facingUp, context([facingUp, target]))).toHaveLength(1);
    expect(findAttackTargets(facingRight, context([facingRight, target]))).toHaveLength(0);
    expect(findAttackTargets(facingLeft, context([facingLeft, target]))).toHaveLength(0);
    expect(findAttackTargets(facingDown, context([facingDown, target]))).toHaveLength(0);
  });

  it('o centro da cruz acompanha a direção: virado para a direita, mira 3 casas à direita', () => {
    const mage = unit(MAGE, 0, 2, RIGHT); // centro (3,2); caminho (1,2) e (2,2) livre
    const atCenter = unit(GOBLIN, 3, 2);
    const onUpperArm = unit(GOBLIN, 3, 1);

    const targets = findAttackTargets(mage, context([mage, atCenter, onUpperArm]));

    expect(uids(targets)).toEqual(uids([atCenter, onUpperArm]));
  });

  it('não ataca quando o centro da cruz cairia fora do tabuleiro', () => {
    const mage = unit(MAGE, 3, 1, UP); // centro em (3,-2)
    const enemy = unit(GOBLIN, 3, 0);

    expect(findAttackTargets(mage, context([mage, enemy]))).toHaveLength(0);
  });

  it('ignora a parte da cruz que sai do tabuleiro', () => {
    const mage = unit(MAGE, 5, 0, LEFT); // centro (2,0); braço de cima (2,-1) fora do tabuleiro
    const center = unit(GOBLIN, 2, 0);
    const below = unit(GOBLIN, 2, 1);
    const sideLeft = unit(GOBLIN, 1, 0);

    const targets = findAttackTargets(mage, context([mage, center, below, sideLeft]));

    expect(uids(targets)).toEqual(uids([center, below, sideLeft]));
  });

  it('é bloqueado por qualquer unidade no caminho (aliada ou inimiga) e por obstáculos', () => {
    const mage = unit(MAGE, 3, 5, UP);
    const enemy = unit(GOBLIN, 3, 2);

    expect(findAttackTargets(mage, context([mage, enemy, unit(WARRIOR, 3, 4)]))).toHaveLength(0);
    expect(findAttackTargets(mage, context([mage, enemy, unit(GOBLIN, 3, 4)]))).toHaveLength(0);
    expect(findAttackTargets(mage, context([mage, enemy], [{ col: 3, row: 3 }]))).toHaveLength(0);
    expect(findAttackTargets(mage, context([mage, enemy], [{ col: 3, row: 2 }]))).toHaveLength(0);
    expect(findAttackTargets(mage, context([mage, enemy]))).toHaveLength(1);
  });

  it('não causa dano a aliados dentro da cruz e eles não bloqueiam o centro', () => {
    const mage = unit(MAGE, 3, 5, UP);
    const allyAtCenter = unit(WARRIOR, 3, 2);
    const enemyOnArm = unit(GOBLIN, 4, 2);

    const targets = findAttackTargets(mage, context([mage, allyAtCenter, enemyOnArm]));

    expect(uids(targets)).toEqual(uids([enemyOnArm]));
  });
});

describe('Unidades derrotadas', () => {
  it('não são alvos e não bloqueiam ataques', () => {
    const archer = unit(ARCHER, 2, 4);
    const deadAlly = unit(WARRIOR, 2, 3);
    deadAlly.hp = 0;
    const deadEnemy = unit(GOBLIN, 2, 2);
    deadEnemy.hp = 0;
    const alive = unit(GOBLIN, 2, 1);

    const targets = findAttackTargets(archer, context([archer, deadAlly, deadEnemy, alive]));

    expect(uids(targets)).toEqual(uids([alive]));
  });
});
