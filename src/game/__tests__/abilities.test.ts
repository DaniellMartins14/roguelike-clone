import { describe, expect, it } from 'vitest';
import type { GameState } from '../core/GameState';
import { ABILITY_BALANCE } from '../core/abilities';
import { ARCHER, ASSASSIN, CLERIC, MAGE, WARRIOR } from '../data/heroes';
import { GOBLIN, SKELETON, SLIME } from '../data/monsters';
import type { GameEvent, Position, Unit } from '../types';
import { castAbility, stateWith, unit, withMaxHp } from './helpers';

const key = (pos: Position) => `${pos.col},${pos.row}`;
const keys = (positions: Position[]) => positions.map(key).sort();
const cell = (col: number, row: number): Position => ({ col, row });

/** Unidade da batalha pelo id da definição (e, se preciso, pela casa). */
function find(state: GameState, id: string): Unit {
  const found = state.roster.find((u) => u.definition.id === id);
  if (!found) throw new Error(`unidade não encontrada: ${id}`);
  return found;
}

const logIncludes = (state: GameState, text: string) =>
  state.log.some((entry) => entry.message.includes(text));

// ---------------------------------------------------------------------------------------------
describe('Pisada (Guerreiro)', () => {
  it('atordoa os monstros nas 8 casas ao redor, diagonais incluídas, e nada além', () => {
    const neighbors = [
      cell(1, 1), cell(2, 1), cell(3, 1), cell(1, 2), cell(3, 2), cell(1, 3), cell(2, 3), cell(3, 3),
    ];
    const state = stateWith(() => [
      unit(WARRIOR, 2, 2),
      ...neighbors.map((n) => unit(GOBLIN, n.col, n.row)),
      unit(SLIME, 5, 5),
    ]);

    expect(castAbility(state, find(state, 'warrior'))).toBe(true);

    const stunned = state.monsters.filter((m) => m.stunned);
    expect(keys(stunned.map((m) => m.position))).toEqual(keys(neighbors));
    expect(find(state, 'slime').stunned).toBe(false); // longe demais
  });

  it('não afeta o Guerreiro nem outros heróis e não causa dano', () => {
    const state = stateWith(() => [
      unit(WARRIOR, 2, 2),
      unit(ASSASSIN, 2, 3),
      unit(SKELETON, 2, 1),
    ]);

    castAbility(state, find(state, 'warrior'));

    expect(find(state, 'warrior').stunned).toBe(false);
    expect(find(state, 'assassin').stunned).toBe(false);
    expect(find(state, 'skeleton').stunned).toBe(true);
    for (const u of state.units) expect(u.hp).toBe(u.maxHp); // nenhum dano
  });

  it('impede mover e atacar na próxima fase dos monstros, e só nela', () => {
    // Esqueleto na diagonal: sem Pisada, ele andaria até ficar ao lado e atacaria.
    const state = stateWith(() => [unit(WARRIOR, 2, 2), unit(SKELETON, 3, 3)]);
    const warrior = find(state, 'warrior');
    const skeleton = find(state, 'skeleton');

    castAbility(state, warrior);
    state.resolveAll();

    expect(warrior.hp).toBe(WARRIOR.maxHp); // não atacou
    expect(skeleton.position).toEqual(cell(3, 3)); // não se moveu
    expect(skeleton.stunned).toBe(false); // atordoamento removido depois da fase
    expect(logIncludes(state, 'está atordoado e perde a ação')).toBe(true);

    // No turno seguinte ele age normalmente.
    state.passTurn();
    state.resolveAll();
    expect(warrior.hp).toBe(WARRIOR.maxHp - SKELETON.damage);
  });

  it('pode ser usada sem inimigos por perto: informa no log e consome o uso', () => {
    const state = stateWith(() => [unit(WARRIOR, 2, 2), unit(GOBLIN, 5, 5)]);
    const warrior = find(state, 'warrior');

    expect(castAbility(state, warrior)).toBe(true);

    expect(logIncludes(state, 'Nenhum inimigo estava ao alcance')).toBe(true);
    expect(warrior.abilityUsed).toBe(true);
    expect(state.monsters[0].stunned).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
describe('Emboscada (Assassino)', () => {
  const TANK = withMaxHp(SKELETON, 60);

  /** Abre a Emboscada, escolhe o alvo e devolve o estado para inspeção. */
  function targetOf(state: GameState, target: Position): void {
    const assassin = find(state, 'assassin');
    state.toggleSelection(assassin.uid);
    state.beginAbility();
    state.chooseAbilityCell(target);
  }

  it('oferece só destinos diagonais adjacentes ao alvo', () => {
    const state = stateWith(() => [unit(ASSASSIN, 0, 0), unit(TANK, 3, 3)]);
    targetOf(state, cell(3, 3));

    expect(keys(state.abilityPreview?.selectable ?? [])).toEqual(
      keys([cell(2, 2), cell(4, 2), cell(2, 4), cell(4, 4)]),
    );
  });

  it('exclui casas ocupadas, com obstáculo ou fora do tabuleiro', () => {
    const occupied = stateWith(
      () => [unit(ASSASSIN, 0, 0), unit(TANK, 3, 3), unit(WARRIOR, 2, 2)],
      [cell(4, 4)],
    );
    targetOf(occupied, cell(3, 3));
    expect(keys(occupied.abilityPreview?.selectable ?? [])).toEqual(keys([cell(4, 2), cell(2, 4)]));

    const edge = stateWith(() => [unit(ASSASSIN, 0, 0), unit(TANK, 5, 2)]);
    targetOf(edge, cell(5, 2));
    expect(keys(edge.abilityPreview?.selectable ?? [])).toEqual(keys([cell(4, 1), cell(4, 3)]));
  });

  it('com um único destino possível, ele já vem escolhido (ainda é preciso confirmar)', () => {
    const state = stateWith(() => [unit(ASSASSIN, 3, 3), unit(GOBLIN, 0, 0)]);
    targetOf(state, cell(0, 0));

    const targeting = state.targeting;
    expect(targeting?.id).toBe('ambush');
    expect(targeting?.id === 'ambush' ? targeting.destination : null).toEqual(cell(1, 1));
    expect(state.canConfirmAbility).toBe(true);
    expect(find(state, 'assassin').abilityUsed).toBe(false);
  });

  it('desloca direto ao destino (sem atravessar o caminho) e ataca duas vezes', () => {
    // O Assassino está cercado de obstáculos: só um salto direto funciona.
    const state = stateWith(
      () => [unit(ASSASSIN, 0, 0), unit(TANK, 3, 3)],
      [cell(1, 0), cell(0, 1), cell(1, 1)],
    );
    const assassin = find(state, 'assassin');
    const tank = find(state, 'skeleton-60hp');

    expect(castAbility(state, assassin, [cell(3, 3), cell(2, 2)])).toBe(true);

    expect(assassin.position).toEqual(cell(2, 2));
    expect(tank.hp).toBe(TANK.maxHp - ASSASSIN.damage * ABILITY_BALANCE.ambushAttacks);
    expect(state.lastDamage).toHaveLength(2);
  });

  it('se o primeiro ataque mata o alvo, o segundo não acontece', () => {
    const state = stateWith(() => [unit(ASSASSIN, 0, 0), unit(GOBLIN, 3, 3)]);
    const goblin = find(state, 'goblin');
    goblin.hp = ASSASSIN.damage - 3;

    castAbility(state, find(state, 'assassin'), [cell(3, 3), cell(2, 2)]);

    expect(goblin.hp).toBe(0);
    expect(state.lastDamage).toHaveLength(1);
    expect(state.log.filter((e) => e.message.startsWith('Assassino atacou'))).toHaveLength(1);
  });

  it('só o alvo escolhido é atingido, mesmo com outros inimigos ao lado do destino', () => {
    const state = stateWith(() => [unit(ASSASSIN, 0, 0), unit(TANK, 3, 3), unit(GOBLIN, 1, 1)]);

    castAbility(state, find(state, 'assassin'), [cell(3, 3), cell(2, 2)]);

    expect(find(state, 'goblin').hp).toBe(GOBLIN.maxHp);
  });

  it('o Assassino já numa diagonal do alvo pode ficar onde está', () => {
    const state = stateWith(() => [unit(ASSASSIN, 2, 2), unit(TANK, 3, 3)]);
    targetOf(state, cell(3, 3));

    expect(keys(state.abilityPreview?.selectable ?? [])).toContain('2,2');
  });

  it('sem nenhum destino válido, informa o motivo e não consome a habilidade', () => {
    const state = stateWith(() => [unit(ASSASSIN, 3, 3), unit(GOBLIN, 0, 0), unit(WARRIOR, 1, 1)]);
    const assassin = find(state, 'assassin');
    targetOf(state, cell(0, 0));

    const targeting = state.targeting;
    expect(targeting?.id === 'ambush' ? targeting.targetUid : 'x').toBeNull();
    expect(state.notice?.includes('Emboscada impossível')).toBe(true);
    expect(logIncludes(state, 'Emboscada impossível')).toBe(true);
    expect(assassin.abilityUsed).toBe(false);

    state.cancelAbility();
    expect(state.canUseAbility(assassin)).toBe(true);
  });

  it('exige alvo e destino antes de confirmar e rejeita escolhas inválidas sem consumir', () => {
    const state = stateWith(() => [unit(ASSASSIN, 0, 0), unit(TANK, 3, 3)]);
    const assassin = find(state, 'assassin');
    targetOf(state, cell(3, 3)); // quatro destinos: nenhum vem escolhido

    expect(state.confirmAbility()).toBe(false); // falta o destino
    expect(state.chooseAbilityCell(cell(3, 2))).toBe(false); // ortogonal ao alvo
    expect(state.chooseAbilityCell(cell(5, 5))).toBe(false); // longe
    expect(state.confirmAbility()).toBe(false);
    expect(assassin.abilityUsed).toBe(false);
    expect(state.phase).toBe('player');
  });

  it('rejeita como alvo casas vazias e heróis', () => {
    const state = stateWith(() => [unit(ASSASSIN, 0, 0), unit(WARRIOR, 1, 0), unit(TANK, 3, 3)]);
    state.toggleSelection(find(state, 'assassin').uid);
    state.beginAbility();

    expect(state.chooseAbilityCell(cell(5, 5))).toBe(false);
    expect(state.chooseAbilityCell(cell(1, 0))).toBe(false);
  });

  it('o ataque automático normal do Assassino continua acontecendo na resolução', () => {
    const state = stateWith(() => [unit(ASSASSIN, 0, 0), unit(TANK, 3, 3)]);
    const tank = find(state, 'skeleton-60hp');

    castAbility(state, find(state, 'assassin'), [cell(3, 3), cell(2, 2)]);
    state.resolveAll();

    // 2 golpes da habilidade + 1 ataque automático (diagonal) na fase dos heróis.
    expect(tank.hp).toBe(TANK.maxHp - ASSASSIN.damage * 3);
  });
});

// ---------------------------------------------------------------------------------------------
describe('Tiro Perfurante (Arqueiro)', () => {
  it('atinge todos os personagens da linha, aliados incluídos, atravessando obstáculos', () => {
    const state = stateWith(
      () => [
        unit(ARCHER, 1, 2),
        unit(GOBLIN, 3, 2),
        unit(WARRIOR, 4, 2),
        unit(SLIME, 5, 2),
        unit(CLERIC, 0, 2), // atrás do arqueiro: fora da trajetória
        unit(SKELETON, 3, 3), // fora da linha
      ],
      [cell(2, 2)], // obstáculo no caminho: o projétil atravessa
    );
    const damage = ARCHER.damage;

    expect(castAbility(state, find(state, 'archer'), [cell(5, 2)])).toBe(true);

    expect(find(state, 'goblin').hp).toBe(GOBLIN.maxHp - damage);
    expect(find(state, 'warrior').hp).toBe(WARRIOR.maxHp - damage); // aliado atingido
    expect(find(state, 'slime').hp).toBe(SLIME.maxHp - damage);
    expect(find(state, 'archer').hp).toBe(ARCHER.maxHp); // o arqueiro nunca é atingido
    expect(find(state, 'cleric').hp).toBe(CLERIC.maxHp);
    expect(find(state, 'skeleton').hp).toBe(SKELETON.maxHp);
  });

  it('funciona nas quatro direções ortogonais', () => {
    const cases = [
      { aim: cell(2, 0), victim: cell(2, 0) }, // cima
      { aim: cell(2, 5), victim: cell(2, 4) }, // baixo
      { aim: cell(0, 2), victim: cell(0, 2) }, // esquerda
      { aim: cell(5, 2), victim: cell(4, 2) }, // direita
    ];
    for (const { aim, victim } of cases) {
      const state = stateWith(() => [unit(ARCHER, 2, 2), unit(GOBLIN, victim.col, victim.row), unit(SLIME, 5, 5)]);
      castAbility(state, find(state, 'archer'), [aim]);
      expect(find(state, 'goblin').hp).toBe(GOBLIN.maxHp - ARCHER.damage);
      expect(find(state, 'slime').hp).toBe(SLIME.maxHp);
    }
  });

  it('aplica o dano individualmente e processa mortes (inclusive de aliados)', () => {
    const state = stateWith(() => [
      unit(ARCHER, 1, 2),
      unit(GOBLIN, 2, 2),
      unit(WARRIOR, 3, 2),
      unit(SLIME, 4, 2),
    ]);
    find(state, 'goblin').hp = 5;
    find(state, 'warrior').hp = 9;

    castAbility(state, find(state, 'archer'), [cell(4, 2)]);

    expect(find(state, 'goblin').hp).toBe(0);
    expect(find(state, 'warrior').hp).toBe(0);
    expect(find(state, 'slime').hp).toBe(SLIME.maxHp - ARCHER.damage);
    expect(state.monsters.map((m) => m.definition.id)).toEqual(['slime']);
    expect(state.log.filter((e) => e.message === 'Goblin foi derrotado!')).toHaveLength(1);
  });

  it('só aceita direções ortogonais e mostra a trajetória antes de confirmar', () => {
    const state = stateWith(() => [unit(ARCHER, 1, 2), unit(GOBLIN, 4, 4)]);
    state.toggleSelection(find(state, 'archer').uid);
    state.beginAbility();

    expect(state.chooseAbilityCell(cell(2, 3))).toBe(false); // diagonal
    expect(state.chooseAbilityCell(cell(1, 2))).toBe(false); // a própria casa
    expect(state.canConfirmAbility).toBe(false);

    expect(state.chooseAbilityCell(cell(4, 2))).toBe(true);
    expect(keys(state.abilityPreview?.effect ?? [])).toEqual(
      keys([cell(2, 2), cell(3, 2), cell(4, 2), cell(5, 2)]),
    );

    expect(state.chooseAbilityCell(cell(1, 0))).toBe(true); // muda de ideia
    expect(keys(state.abilityPreview?.effect ?? [])).toEqual(keys([cell(1, 1), cell(1, 0)]));
    expect(find(state, 'archer').abilityUsed).toBe(false);
  });

  it('pode ser usado sem acertar ninguém e consome o uso', () => {
    const state = stateWith(() => [unit(ARCHER, 1, 2), unit(GOBLIN, 4, 4)]);
    const archer = find(state, 'archer');

    expect(castAbility(state, archer, [cell(1, 0)])).toBe(true);

    expect(logIncludes(state, 'não atingiu ninguém')).toBe(true);
    expect(archer.abilityUsed).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
describe('Bola de Fogo (Mago)', () => {
  const damage = ABILITY_BALANCE.fireballDamage;

  /** Prévia da área para um centro, sem usar a habilidade. */
  function areaFor(center: Position): Position[] {
    const state = stateWith(() => [unit(MAGE, 0, 5), unit(GOBLIN, 5, 0)]);
    state.toggleSelection(find(state, 'mage').uid);
    state.beginAbility();
    state.chooseAbilityCell(center);
    return state.abilityPreview?.effect ?? [];
  }

  it('afeta um quadrado 3×3 e dá dano em todos, aliados e o próprio Mago, ignorando obstáculos', () => {
    const state = stateWith(
      () => [
        unit(MAGE, 2, 2),
        unit(WARRIOR, 4, 4),
        unit(GOBLIN, 3, 3),
        unit(SLIME, 4, 3), // atrás de um obstáculo da área: ainda é atingido
        unit(SKELETON, 5, 5), // fora da área
        unit(CLERIC, 1, 1), // fora da área
      ],
      [cell(3, 2)],
    );

    expect(castAbility(state, find(state, 'mage'), [cell(3, 3)])).toBe(true);

    expect(find(state, 'mage').hp).toBe(MAGE.maxHp - damage);
    expect(find(state, 'warrior').hp).toBe(WARRIOR.maxHp - damage);
    expect(find(state, 'goblin').hp).toBe(GOBLIN.maxHp - damage);
    expect(find(state, 'slime').hp).toBe(SLIME.maxHp - damage);
    expect(find(state, 'skeleton').hp).toBe(SKELETON.maxHp);
    expect(find(state, 'cleric').hp).toBe(CLERIC.maxHp);
  });

  it('recorta a área nos cantos e nas bordas da grade 6×6', () => {
    expect(areaFor(cell(2, 2))).toHaveLength(9);
    expect(keys(areaFor(cell(0, 0)))).toEqual(keys([cell(0, 0), cell(1, 0), cell(0, 1), cell(1, 1)]));
    for (const corner of [cell(5, 0), cell(0, 5), cell(5, 5)]) {
      expect(areaFor(corner)).toHaveLength(4);
    }
    for (const edge of [cell(0, 2), cell(3, 0), cell(5, 3), cell(3, 5)]) {
      expect(areaFor(edge)).toHaveLength(6);
    }
  });

  it('atinge quem está no canto e ninguém fora da grade', () => {
    const state = stateWith(() => [
      unit(MAGE, 5, 5),
      unit(GOBLIN, 0, 0),
      unit(SLIME, 1, 1),
      unit(SKELETON, 2, 0), // fora da área
    ]);

    castAbility(state, find(state, 'mage'), [cell(0, 0)]);

    expect(find(state, 'goblin').hp).toBe(GOBLIN.maxHp - damage);
    expect(find(state, 'slime').hp).toBe(SLIME.maxHp - damage);
    expect(find(state, 'skeleton').hp).toBe(SKELETON.maxHp);
  });

  it('pode escolher qualquer casa, mudar de ideia e cancelar sem consumir nem causar dano', () => {
    const state = stateWith(() => [unit(MAGE, 2, 2), unit(GOBLIN, 3, 3)]);
    const mage = find(state, 'mage');
    state.toggleSelection(mage.uid);
    state.beginAbility();

    expect(state.chooseAbilityCell(cell(7, 0))).toBe(false); // fora do tabuleiro
    expect(state.chooseAbilityCell(cell(1, 1))).toBe(true);
    expect(state.chooseAbilityCell(cell(4, 4))).toBe(true);
    expect(keys(state.abilityPreview?.effect ?? [])).toContain('5,5');

    state.cancelAbility();

    expect(state.targeting).toBeNull();
    expect(state.abilityPreview).toBeNull();
    expect(mage.abilityUsed).toBe(false);
    expect(find(state, 'goblin').hp).toBe(GOBLIN.maxHp);
    expect(mage.hp).toBe(MAGE.maxHp);
  });

  it('sem confirmar nada acontece', () => {
    const state = stateWith(() => [unit(MAGE, 2, 2), unit(GOBLIN, 3, 3)]);
    state.toggleSelection(find(state, 'mage').uid);
    state.beginAbility();
    state.chooseAbilityCell(cell(3, 3));

    expect(find(state, 'goblin').hp).toBe(GOBLIN.maxHp);
    expect(state.phase).toBe('player');
  });

  it('pode atingir casas vazias: consome o uso e avisa que ninguém foi atingido', () => {
    const state = stateWith(() => [unit(MAGE, 0, 5), unit(GOBLIN, 5, 0)]);
    const mage = find(state, 'mage');

    expect(castAbility(state, mage, [cell(2, 2)])).toBe(true);

    expect(logIncludes(state, 'A explosão não atingiu ninguém')).toBe(true);
    expect(mage.abilityUsed).toBe(true);
  });

  it('mata com segurança, inclusive o próprio Mago, e a derrota tem precedência sobre a vitória', () => {
    // O Mago (último herói) e o último monstro morrem na mesma explosão.
    const both = stateWith(() => [unit(MAGE, 2, 2), unit(GOBLIN, 2, 3)]);
    find(both, 'mage').hp = damage;
    find(both, 'goblin').hp = damage;
    castAbility(both, find(both, 'mage'), [cell(2, 2)]);
    expect(both.heroes).toHaveLength(0);
    expect(both.monsters).toHaveLength(0);
    both.resolveAll();
    expect(both.outcome).toBe('defeat');

    // O Mago só se mata: derrota.
    const suicide = stateWith(() => [unit(MAGE, 2, 2), unit(GOBLIN, 5, 5)]);
    find(suicide, 'mage').hp = damage;
    castAbility(suicide, find(suicide, 'mage'), [cell(2, 2)]);
    suicide.resolveAll();
    expect(suicide.outcome).toBe('defeat');
  });

  it('pode vencer o combate matando todos os monstros', () => {
    const state = stateWith(() => [unit(MAGE, 0, 5), unit(GOBLIN, 3, 3), unit(SLIME, 4, 3)]);
    find(state, 'goblin').hp = damage;
    find(state, 'slime').hp = damage;

    castAbility(state, find(state, 'mage'), [cell(3, 3)]);
    state.resolveAll();

    expect(state.outcome).toBe('victory');
    expect(state.turn).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------
describe('Exura (Clérigo)', () => {
  it('cura 50% do PV máximo do alvo', () => {
    const state = stateWith(() => [unit(CLERIC, 2, 5), unit(MAGE, 3, 5), unit(GOBLIN, 0, 0)]);
    const mage = find(state, 'mage');
    mage.hp = 4;

    expect(castAbility(state, find(state, 'cleric'), [cell(3, 5)])).toBe(true);

    expect(mage.hp).toBe(4 + MAGE.maxHp / 2);
    expect(logIncludes(state, '+8 PV')).toBe(true);
    expect(state.lastHealing[0]?.amount).toBe(8);
  });

  it('nunca ultrapassa o PV máximo e o log mostra a cura efetiva', () => {
    const state = stateWith(() => [unit(CLERIC, 2, 5), unit(WARRIOR, 3, 5), unit(GOBLIN, 0, 0)]);
    const warrior = find(state, 'warrior');
    warrior.hp = WARRIOR.maxHp - 10; // 50% seriam 15, mas só faltam 10

    castAbility(state, find(state, 'cleric'), [cell(3, 5)]);

    expect(warrior.hp).toBe(WARRIOR.maxHp);
    expect(logIncludes(state, '+10 PV')).toBe(true);
  });

  it('arredonda a cura para cima quando 50% não é inteiro', () => {
    const odd = withMaxHp(WARRIOR, 15); // 50% = 7,5 -> 8
    const state = stateWith(() => [unit(CLERIC, 2, 5), unit(odd, 3, 5), unit(GOBLIN, 0, 0)]);
    const target = find(state, 'warrior-15hp');
    target.hp = 1;

    castAbility(state, find(state, 'cleric'), [cell(3, 5)]);

    expect(target.hp).toBe(9);
    expect(logIncludes(state, '+8 PV')).toBe(true);
  });

  it('pode curar a si mesmo e qualquer herói vivo, a qualquer distância', () => {
    const self = stateWith(() => [unit(CLERIC, 2, 5), unit(GOBLIN, 0, 0)]);
    find(self, 'cleric').hp = 5;
    castAbility(self, find(self, 'cleric'), [cell(2, 5)]);
    expect(find(self, 'cleric').hp).toBe(5 + CLERIC.maxHp / 2);

    const far = stateWith(() => [unit(CLERIC, 0, 5), unit(ARCHER, 5, 0), unit(GOBLIN, 3, 3)]);
    find(far, 'archer').hp = 2;
    castAbility(far, find(far, 'cleric'), [cell(5, 0)]);
    expect(find(far, 'archer').hp).toBe(2 + ARCHER.maxHp / 2);
  });

  it('não aceita monstros, casas vazias nem heróis mortos, e não consome a habilidade', () => {
    const state = stateWith(() => [
      unit(CLERIC, 2, 5),
      unit(WARRIOR, 3, 5),
      unit(ASSASSIN, 4, 5),
      unit(GOBLIN, 0, 0),
    ]);
    const cleric = find(state, 'cleric');
    find(state, 'warrior').hp = 10;
    find(state, 'assassin').hp = 0; // morto
    state.toggleSelection(cleric.uid);
    state.beginAbility();

    expect(state.chooseAbilityCell(cell(0, 0))).toBe(false); // monstro
    expect(state.chooseAbilityCell(cell(1, 1))).toBe(false); // vazia
    expect(state.chooseAbilityCell(cell(4, 5))).toBe(false); // herói morto
    expect(state.confirmAbility()).toBe(false); // sem alvo
    expect(cleric.abilityUsed).toBe(false);
    expect(find(state, 'warrior').hp).toBe(10);
  });

  it('recusa alvo com a vida cheia, informa e não consome a habilidade', () => {
    const state = stateWith(() => [unit(CLERIC, 2, 5), unit(WARRIOR, 3, 5), unit(GOBLIN, 0, 0)]);
    const cleric = find(state, 'cleric');

    expect(castAbility(state, cleric, [cell(3, 5)])).toBe(false);

    expect(logIncludes(state, 'já está com PV máximo')).toBe(true);
    expect(cleric.abilityUsed).toBe(false);
    expect(state.phase).toBe('player');
  });

  it('a prévia destaca só os heróis feridos', () => {
    const state = stateWith(() => [unit(CLERIC, 2, 5), unit(WARRIOR, 3, 5), unit(MAGE, 4, 5), unit(GOBLIN, 0, 0)]);
    find(state, 'mage').hp = 3;
    state.toggleSelection(find(state, 'cleric').uid);
    state.beginAbility();

    expect(keys(state.abilityPreview?.selectable ?? [])).toEqual(['4,5']);
  });
});

// ---------------------------------------------------------------------------------------------
describe('Regras gerais das habilidades', () => {
  /** Guerreiro ao lado de um esqueleto, mais um clérigo e um mago para os outros testes. */
  const squad = () => [
    unit(WARRIOR, 2, 2),
    unit(CLERIC, 0, 5),
    unit(MAGE, 5, 5),
    unit(SKELETON, 2, 1),
  ];

  it('cada habilidade só pode ser usada uma vez por combate', () => {
    const state = stateWith(squad);
    const warrior = find(state, 'warrior');

    expect(castAbility(state, warrior)).toBe(true);
    state.resolveAll();
    expect(state.phase).toBe('player');

    state.toggleSelection(warrior.uid);
    expect(state.canUseAbility(warrior)).toBe(false);
    expect(state.beginAbility()).toBe(false);
    expect(state.notice?.includes('já foi usada')).toBe(true);
    expect(state.targeting).toBeNull();
  });

  it('cada herói tem a sua própria habilidade', () => {
    const state = stateWith(squad);
    castAbility(state, find(state, 'warrior'));
    state.resolveAll();

    find(state, 'mage').hp = 4;
    expect(castAbility(state, find(state, 'cleric'), [cell(5, 5)])).toBe(true);
  });

  it('o reinício devolve as habilidades e remove atordoamentos', () => {
    const state = stateWith(squad);
    castAbility(state, find(state, 'warrior'));
    expect(find(state, 'skeleton').stunned).toBe(true);

    state.reset();

    expect(state.roster.every((u) => !u.abilityUsed && !u.stunned)).toBe(true);
    expect(state.phase).toBe('player');
    expect(state.canUseAbility(find(state, 'warrior'))).toBe(true);
  });

  it('cancelar, trocar de herói ou passar a vez não consome a habilidade', () => {
    const state = stateWith(squad);
    const mage = find(state, 'mage');
    const warrior = find(state, 'warrior');

    state.toggleSelection(mage.uid);
    state.beginAbility();
    state.cancelAbility();
    expect(mage.abilityUsed).toBe(false);

    state.beginAbility();
    expect(state.targeting).not.toBeNull();
    state.toggleSelection(warrior.uid); // trocar de herói cancela a escolha
    expect(state.targeting).toBeNull();
    expect(mage.abilityUsed).toBe(false);

    state.toggleSelection(mage.uid);
    state.beginAbility();
    state.passTurn(); // passar a vez também descarta a escolha
    expect(mage.abilityUsed).toBe(false);
  });

  it('heróis mortos não podem usar habilidades', () => {
    const state = stateWith(squad);
    const warrior = find(state, 'warrior');
    warrior.hp = 0;

    state.toggleSelection(warrior.uid);
    expect(state.selectedUnit).toBeNull();
    expect(state.canUseAbility(warrior)).toBe(false);
    expect(state.beginAbility()).toBe(false);
    expect(warrior.abilityUsed).toBe(false);
  });

  it('nenhuma habilidade é ativada durante a resolução do turno', () => {
    const state = stateWith(squad);
    const mage = find(state, 'mage');
    state.toggleSelection(mage.uid);
    state.beginAbility(); // abre a escolha...
    state.chooseAbilityCell(cell(1, 1));
    state.passTurn(); // ...mas o jogador passa a vez: começa a resolução
    expect(state.isResolving).toBe(true);

    expect(state.canUseAbility(mage)).toBe(false);
    expect(state.beginAbility()).toBe(false);
    expect(state.chooseAbilityCell(cell(1, 1))).toBe(false);
    expect(state.confirmAbility()).toBe(false);
    expect(castAbility(state, find(state, 'warrior'))).toBe(false);
  });

  it('nenhuma habilidade é ativada depois do fim do combate', () => {
    const state = stateWith(() => [unit(WARRIOR, 2, 2), unit(GOBLIN, 2, 1)]);
    find(state, 'goblin').hp = 1;
    state.passTurn();
    state.resolveAll();
    expect(state.isOver).toBe(true);

    expect(castAbility(state, find(state, 'warrior'))).toBe(false);
    expect(find(state, 'warrior').abilityUsed).toBe(false);
  });

  it('o uso da habilidade substitui o movimento do turno', () => {
    const state = stateWith(squad);
    const warrior = find(state, 'warrior');

    castAbility(state, warrior);

    expect(warrior.position).toEqual(cell(2, 2)); // não andou
    expect(state.phase).toBe('heroes');
    expect(state.moveSelectedUnit(cell(3, 3))).toBe(false); // e não pode mover depois
  });

  it('durante a escolha de alvo não é possível mover o herói', () => {
    const state = stateWith(squad);
    const mage = find(state, 'mage');
    state.toggleSelection(mage.uid);
    state.beginAbility();

    expect(state.moveSelectedUnit(cell(4, 4))).toBe(false);
    expect(mage.position).toEqual(cell(5, 5));
    expect(state.phase).toBe('player');
  });

  it('depois da habilidade os heróis executam seus ataques automáticos normalmente', () => {
    const state = stateWith(squad);

    castAbility(state, find(state, 'warrior'));
    state.resolveAll();

    expect(state.log.some((e) => e.message.startsWith('Guerreiro atacou Esqueleto'))).toBe(true);
    expect(state.turn).toBe(2);
  });

  it('o uso aparece no log e eventos são emitidos na ordem esperada', () => {
    const state = stateWith(squad);
    const events: GameEvent[] = [];
    state.subscribe((event) => events.push(event));

    castAbility(state, find(state, 'warrior'));

    expect(state.log.some((e) => e.message === 'Guerreiro usou Pisada!' && e.kind === 'ability')).toBe(true);
    expect(events).toContain('select');
    expect(events.at(-1)).toBe('resolving');
  });

  it('cliques repetidos em "confirmar" não usam a habilidade duas vezes', () => {
    const state = stateWith(() => [unit(MAGE, 0, 5), unit(GOBLIN, 3, 3)]);
    const goblin = find(state, 'goblin');
    state.toggleSelection(find(state, 'mage').uid);
    state.beginAbility();
    state.chooseAbilityCell(cell(3, 3));

    expect(state.confirmAbility()).toBe(true);
    const hpAfterFirst = goblin.hp;
    expect(state.confirmAbility()).toBe(false);
    expect(state.confirmAbility()).toBe(false);
    expect(goblin.hp).toBe(hpAfterFirst);
  });
});

// ---------------------------------------------------------------------------------------------
describe('Partidas completas com habilidades', () => {
  it('terminam sem travar e sem estados inválidos (ações aleatórias, 150 partidas)', () => {
    let seed = 99;
    const random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const randomCell = () => cell(Math.floor(random() * 6), Math.floor(random() * 6));

    for (let game = 0; game < 150; game++) {
      const state = stateWith(() => [
        unit(WARRIOR, 2, 4), unit(ASSASSIN, 4, 4), unit(ARCHER, 1, 5), unit(MAGE, 3, 5), unit(CLERIC, 2, 5),
        unit(GOBLIN, 1, 1), unit(SKELETON, 4, 1), unit(SLIME, 2, 0),
      ]);
      let guard = 0;

      while (!state.isOver && guard++ < 300) {
        const usedBefore = state.roster.filter((u) => u.abilityUsed).map((u) => u.uid);
        const hero = state.heroes[Math.floor(random() * state.heroes.length)];
        state.toggleSelection(hero.uid);

        const roll = random();
        let acted = false;
        if (roll < 0.4 && state.canUseAbility(hero)) {
          if (state.beginAbility() && state.phase === 'player') {
            for (let attempt = 0; attempt < 4 && !state.canConfirmAbility; attempt++) {
              state.chooseAbilityCell(randomCell());
            }
            acted = state.confirmAbility();
            if (!acted) state.cancelAbility();
          } else {
            acted = state.phase !== 'player';
          }
        }
        if (!acted && state.phase === 'player') {
          const moves = state.getValidMoves(hero);
          if (roll > 0.85 || moves.length === 0) {
            state.passTurn();
          } else {
            state.moveSelectedUnit(moves[Math.floor(random() * moves.length)]);
          }
        }
        state.resolveAll();

        const cells = state.units.map((u) => key(u.position));
        expect(new Set(cells).size).toBe(cells.length);
        for (const u of state.units) {
          expect(u.hp).toBeGreaterThan(0);
          expect(u.hp).toBeLessThan(u.maxHp + 1);
          expect(u.stunned && u.definition.team === 'hero').toBe(false);
        }
        // Habilidade usada nunca "volta" a ficar disponível.
        for (const uid of usedBefore) {
          expect(state.roster.find((u) => u.uid === uid)?.abilityUsed).toBe(true);
        }
      }

      expect(state.isOver).toBe(true);
    }
  });
});
