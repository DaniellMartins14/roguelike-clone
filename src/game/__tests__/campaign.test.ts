import { describe, expect, it } from 'vitest';
import { Campaign } from '../core/Campaign';
import { findAttackTargets } from '../core/combat';
import { HERO_FORMATION } from '../data/battleSetup';
import { CAMPAIGN_FLOORS } from '../data/encounters';
import { ITEM_DEFINITIONS } from '../data/items';
import { GOBLIN } from '../data/monsters';
import type { Position, Unit } from '../types';
import { castAbility } from './helpers';

const key = (pos: Position) => `${pos.col},${pos.row}`;
const heroNamed = (campaign: Campaign, id: string): Unit => {
  const hero = campaign.party.find((u) => u.definition.id === id);
  if (!hero) throw new Error(`herói não encontrado: ${id}`);
  return hero;
};

/** Vence o andar atual: derruba os monstros e deixa a resolução do turno declarar a vitória. */
function winFloor(campaign: Campaign): void {
  for (const monster of campaign.battle.monsters) monster.hp = 0;
  campaign.battle.passTurn();
  campaign.battle.resolveAll();
}

/** Perde o andar atual: derruba todos os heróis. */
function loseFloor(campaign: Campaign): void {
  for (const hero of campaign.battle.heroes) hero.hp = 0;
  campaign.battle.passTurn();
  campaign.battle.resolveAll();
}

/** Vence e avança até o andar `target`. */
function goToFloor(campaign: Campaign, target: number): void {
  while (campaign.floorNumber < target) {
    winFloor(campaign);
    expect(campaign.advance()).toBe(true);
  }
}

describe('Estrutura da campanha', () => {
  it('começa no andar 1, em combate, com 10 andares e os 5 heróis', () => {
    const campaign = new Campaign();

    expect(campaign.floorNumber).toBe(1);
    expect(campaign.totalFloors).toBe(10);
    expect(campaign.status).toBe('fighting');
    expect(campaign.battle.phase).toBe('player');
    expect(campaign.battle.heroes).toHaveLength(5);
    expect(campaign.battle.monsters).toHaveLength(CAMPAIGN_FLOORS[0].monsters.length);
    expect(campaign.battle.log[0].message.startsWith('Andar 1/10')).toBe(true);
  });

  it('andares 1-4 e 6-9 são comuns, o 5 é mini-chefe e o 10 é o chefe principal', () => {
    const campaign = new Campaign();

    for (let n = 1; n <= 10; n++) {
      expect(campaign.floorNumber).toBe(n);
      const expected = n === 5 ? 'mini-boss' : n === 10 ? 'boss' : 'normal';
      expect(campaign.encounterType).toBe(expected);

      const ranks = campaign.battle.monsters.map((m) => m.definition.rank ?? 'normal');
      if (expected === 'normal') {
        expect(ranks.every((rank) => rank === 'normal')).toBe(true);
      } else {
        expect(ranks.filter((rank) => rank === expected)).toHaveLength(1);
      }
      expect(campaign.battle.monsters).toHaveLength(CAMPAIGN_FLOORS[n - 1].monsters.length);

      if (n < 10) {
        winFloor(campaign);
        expect(campaign.advance()).toBe(true);
      }
    }

    expect(campaign.battle.monsters.some((m) => m.definition.name === 'Ídolo do Abismo')).toBe(true);
    expect(campaign.encounterLabel).toBe('Chefe principal');
  });

  it('cada andar tem a sua própria quantidade de inimigos', () => {
    const campaign = new Campaign();
    const counts: number[] = [];
    for (let n = 1; n <= 10; n++) {
      counts.push(campaign.battle.monsters.length);
      if (n < 10) {
        winFloor(campaign);
        campaign.advance();
      }
    }
    expect(counts[8]).toBeGreaterThan(counts[0]);
    expect(new Set(counts).size).toBeGreaterThan(2); // 2, 3 e 4 monstros aparecem
  });

  it('em todo andar os monstros nascem em casas válidas e livres, e ninguém começa ao alcance de ninguém', () => {
    const campaign = new Campaign();
    for (let n = 1; n <= 10; n++) {
      const units = campaign.battle.units;
      const cells = units.map((u) => key(u.position));
      expect(new Set(cells).size).toBe(units.length); // nenhuma casa repetida
      for (const unit of units) {
        expect(unit.position.col).toBeGreaterThan(-1);
        expect(unit.position.col).toBeLessThan(6);
        expect(unit.position.row).toBeGreaterThan(-1);
        expect(unit.position.row).toBeLessThan(6);
        expect(campaign.battle.isObstacle(unit.position)).toBe(false);
        // Ninguém tem alvo no primeiro turno: o encontro começa "limpo".
        expect(findAttackTargets(unit, { units, obstacles: campaign.battle.obstacles })).toHaveLength(0);
      }
      if (n < 10) {
        winFloor(campaign);
        campaign.advance();
      }
    }
  });
});

describe('Fluxo entre os andares', () => {
  it('vencer permite avançar, mas só depois da confirmação do jogador', () => {
    const campaign = new Campaign();
    winFloor(campaign);

    expect(campaign.status).toBe('floor-cleared');
    expect(campaign.floorNumber).toBe(1); // não avançou sozinho
    expect(campaign.battle.isOver).toBe(true);

    expect(campaign.advance()).toBe(true);
    expect(campaign.floorNumber).toBe(2);
    expect(campaign.status).toBe('fighting');
    expect(campaign.battle.phase).toBe('player');
  });

  it('não permite avançar enquanto o combate está em andamento', () => {
    const campaign = new Campaign();
    expect(campaign.advance()).toBe(false);

    campaign.battle.passTurn(); // no meio da resolução
    expect(campaign.battle.isResolving).toBe(true);
    expect(campaign.advance()).toBe(false);
    expect(campaign.floorNumber).toBe(1);
  });

  it('não permite avançar depois de uma derrota', () => {
    const campaign = new Campaign();
    loseFloor(campaign);

    expect(campaign.status).toBe('defeated');
    expect(campaign.advance()).toBe(false);
    expect(campaign.floorNumber).toBe(1);
    expect(campaign.battle.log.at(-1)?.message.startsWith('Derrota')).toBe(true);
  });

  it('cliques repetidos em "avançar" só avançam um andar', () => {
    const campaign = new Campaign();
    winFloor(campaign);

    expect(campaign.advance()).toBe(true);
    expect(campaign.advance()).toBe(false);
    expect(campaign.advance()).toBe(false);
    expect(campaign.floorNumber).toBe(2);
    expect(campaign.battle.heroRoster).toHaveLength(5);
  });

  it('vencer o chefe do andar 10 conclui a campanha e não há mais para onde avançar', () => {
    const campaign = new Campaign();
    goToFloor(campaign, 10);
    expect(campaign.isLastFloor).toBe(true);

    winFloor(campaign);

    expect(campaign.status).toBe('completed');
    expect(campaign.advance()).toBe(false);
    expect(campaign.floorNumber).toBe(10);
  });

  it('o mini-chefe do andar 5 também exige confirmação para avançar', () => {
    const campaign = new Campaign();
    goToFloor(campaign, 5);
    winFloor(campaign);

    expect(campaign.status).toBe('floor-cleared');
    expect(campaign.floorNumber).toBe(5);
    expect(campaign.advance()).toBe(true);
    expect(campaign.floorNumber).toBe(6);
  });
});

describe('Reinício da campanha', () => {
  it('volta ao andar 1 com um grupo novo (PV cheio, todos vivos) e o encontro do andar 1', () => {
    const campaign = new Campaign();
    goToFloor(campaign, 4);
    heroNamed(campaign, 'warrior').hp = 3;
    heroNamed(campaign, 'mage').hp = 0;

    campaign.restart();

    expect(campaign.floorNumber).toBe(1);
    expect(campaign.status).toBe('fighting');
    expect(campaign.battle.turn).toBe(1);
    expect(campaign.battle.heroes).toHaveLength(5);
    for (const hero of campaign.party) expect(hero.hp).toBe(hero.maxHp);
    expect(campaign.battle.monsters).toHaveLength(CAMPAIGN_FLOORS[0].monsters.length);
    expect(campaign.battle.log[0].message.startsWith('Andar 1/10')).toBe(true);
    expect(campaign.battle.log.filter((e) => e.kind === 'floor')).toHaveLength(1);
  });

  it('funciona depois de uma derrota, de uma campanha concluída e no meio de uma resolução', () => {
    const defeated = new Campaign();
    goToFloor(defeated, 3);
    loseFloor(defeated);
    defeated.restart();
    expect(defeated.floorNumber).toBe(1);
    expect(defeated.status).toBe('fighting');

    const completed = new Campaign();
    goToFloor(completed, 10);
    winFloor(completed);
    completed.restart();
    expect(completed.floorNumber).toBe(1);
    expect(completed.status).toBe('fighting');

    const resolving = new Campaign();
    resolving.battle.passTurn();
    resolving.battle.step();
    resolving.restart();
    expect(resolving.battle.isResolving).toBe(false);
    expect(resolving.battle.phase).toBe('player');
  });

  it('depois do reinício é possível jogar e avançar normalmente', () => {
    const campaign = new Campaign();
    loseFloor(campaign);
    campaign.restart();

    winFloor(campaign);
    expect(campaign.advance()).toBe(true);
    expect(campaign.floorNumber).toBe(2);
  });
});

describe('Persistência dos itens da expedição', () => {
  it('perde os itens obtidos na incursão e mantém os itens consolidados na extração', () => {
    const campaign = new Campaign();
    goToFloor(campaign, 5);
    const warrior = heroNamed(campaign, 'warrior');
    const equipped = campaign.inventory.add('short-sword');
    expect(campaign.inventory.equip(warrior, equipped.instanceId, ITEM_DEFINITIONS)).toBe(true);
    winFloor(campaign);
    expect(campaign.extract()).toBe(true);

    const temporary = campaign.inventory.add('axe');
    loseFloor(campaign);

    expect(campaign.status).toBe('defeated');
    expect(campaign.inventory.instanceIds).toContain(equipped.instanceId);
    expect(warrior.equipment?.weapon).toBe(equipped.instanceId);
    expect(campaign.inventory.instanceIds).not.toContain(temporary.instanceId);
  });

  it('preserva itens consolidados por extração e remove apenas os drops da incursão seguinte', () => {
    const campaign = new Campaign();
    goToFloor(campaign, 5);
    const extractedItem = campaign.inventory.add('short-sword');
    winFloor(campaign);

    expect(campaign.extract()).toBe(true);
    expect(campaign.inventory.instanceIds).toContain(extractedItem.instanceId);
    const extractedGold = campaign.gold;

    const temporaryItem = campaign.inventory.add('axe');
    campaign.gold += 123; // ouro obtido na nova incursão
    loseFloor(campaign);

    expect(campaign.status).toBe('defeated');
    expect(campaign.inventory.instanceIds).toContain(extractedItem.instanceId);
    expect(campaign.inventory.instanceIds).not.toContain(temporaryItem.instanceId);
    expect(campaign.gold).toBe(extractedGold);
  });
});

describe('Novo encontro', () => {
  it('limpa o encontro anterior e cria monstros novos com PV cheio', () => {
    const campaign = new Campaign();
    const oldMonsterUids = campaign.battle.monsterRoster.map((m) => m.uid);
    heroNamed(campaign, 'warrior').stunned = true;
    winFloor(campaign);

    campaign.advance();
    const battle = campaign.battle;

    expect(battle.monsterRoster.some((m) => oldMonsterUids.includes(m.uid))).toBe(false);
    expect(battle.monsterRoster).toHaveLength(CAMPAIGN_FLOORS[1].monsters.length);
    for (const monster of battle.monsterRoster) {
      expect(monster.hp).toBe(monster.maxHp);
      expect(monster.stunned).toBe(false);
    }
    expect(battle.turn).toBe(1);
    expect(battle.phase).toBe('player');
    expect(battle.outcome).toBe('ongoing');
    expect(battle.selectedUnit).toBeNull();
    expect(battle.targeting).toBeNull();
    expect(battle.abilityPreview).toBeNull();
    expect(battle.notice).toBeNull();
    expect(battle.lastDamage).toHaveLength(0);
    expect(battle.lastHealing).toHaveLength(0);
    expect(battle.lastEffect).toBeNull();
    expect(battle.lastActor).toBeNull();
    expect(heroNamed(campaign, 'warrior').stunned).toBe(false);
  });

  it('aplica os obstáculos do novo andar e remove os do anterior', () => {
    const campaign = new Campaign();
    goToFloor(campaign, 4);
    expect(campaign.battle.obstacles).toHaveLength(2);

    winFloor(campaign);
    campaign.advance(); // andar 5: sem obstáculos
    expect(campaign.battle.obstacles).toHaveLength(0);
  });

  it('preserva o PV dos heróis e mantém derrotados os que morreram, sem restaurar nada', () => {
    const campaign = new Campaign();
    heroNamed(campaign, 'warrior').hp = 7;
    heroNamed(campaign, 'mage').hp = 0;
    winFloor(campaign);

    campaign.advance();

    expect(heroNamed(campaign, 'warrior').hp).toBe(7);
    expect(heroNamed(campaign, 'mage').hp).toBe(0);
    expect(campaign.battle.heroes).toHaveLength(4);
    expect(campaign.battle.getUnitAt(HERO_FORMATION[3].position)).toBeNull(); // casa do mago vazia
    expect(campaign.battle.heroRoster).toHaveLength(5); // ainda aparece na lista, derrotado
  });

  it('os heróis vivos voltam à formação inicial, viradas para cima', () => {
    const campaign = new Campaign();
    const warrior = heroNamed(campaign, 'warrior');
    campaign.battle.toggleSelection(warrior.uid);
    campaign.battle.moveSelectedUnit({ col: 3, row: 3 });
    campaign.battle.resolveAll();
    winFloor(campaign);

    campaign.advance();

    for (const entry of HERO_FORMATION) {
      const hero = heroNamed(campaign, entry.definition.id);
      if (hero.hp > 0) expect(hero.position).toEqual(entry.position);
    }
  });

  it('cada herói pode usar a habilidade uma vez em cada encontro', () => {
    const campaign = new Campaign();
    const warrior = heroNamed(campaign, 'warrior');

    expect(castAbility(campaign.battle, warrior)).toBe(true);
    campaign.battle.resolveAll();
    expect(warrior.abilityUsed).toBe(true);
    campaign.battle.toggleSelection(warrior.uid);
    expect(campaign.battle.canUseAbility(warrior)).toBe(false); // uma vez por encontro

    winFloor(campaign);
    campaign.advance();

    expect(campaign.party.every((hero) => !hero.abilityUsed)).toBe(true);
    expect(castAbility(campaign.battle, warrior)).toBe(true); // de novo no novo encontro
  });

  it('não duplica heróis nem monstros ao avançar', () => {
    const campaign = new Campaign();
    const partyBefore = [...campaign.party];

    for (let n = 1; n <= 6; n++) {
      const roster = campaign.battle.roster;
      expect(campaign.battle.heroRoster).toHaveLength(5);
      expect(roster).toHaveLength(5 + CAMPAIGN_FLOORS[n - 1].monsters.length);
      expect(new Set(roster.map((u) => u.uid)).size).toBe(roster.length);
      expect(campaign.battle.heroRoster).toEqual(partyBefore); // as mesmas unidades
      winFloor(campaign);
      campaign.advance();
    }
  });

  it('o log é preservado entre andares e cada andar ganha o seu cabeçalho', () => {
    const campaign = new Campaign();
    winFloor(campaign);
    const entriesBefore = campaign.battle.log.length;

    campaign.advance();

    const log = campaign.battle.log;
    expect(log.length).toBeGreaterThan(entriesBefore); // nada foi apagado
    const headers = log.filter((entry) => entry.kind === 'floor').map((entry) => entry.message);
    expect(headers).toHaveLength(2);
    expect(headers[0].startsWith('Andar 1/10 — Comum')).toBe(true);
    expect(headers[1].startsWith('Andar 2/10 — Comum')).toBe(true);
    expect(log.some((entry) => entry.message.startsWith('Vitória'))).toBe(true);
  });

  it('emite o evento "encounter" ao avançar e "reset" ao reiniciar', () => {
    const campaign = new Campaign();
    const events: string[] = [];
    campaign.battle.subscribe((event) => events.push(event));

    winFloor(campaign);
    campaign.advance();
    expect(events.at(-1)).toBe('encounter');

    campaign.restart();
    expect(events.at(-1)).toBe('reset');
  });
});

describe('Combate dentro da campanha continua funcionando', () => {
  it('ataques normais, dano e morte funcionam no andar 1', () => {
    const campaign = new Campaign();
    const warrior = heroNamed(campaign, 'warrior');
    const goblin = campaign.battle.monsters.find((m) => m.definition.id === 'goblin');
    if (!goblin) throw new Error('goblin ausente');
    goblin.position = { col: 2, row: 3 }; // ao lado do guerreiro (2,4)

    campaign.battle.passTurn();
    campaign.battle.resolveAll();

    expect(goblin.hp).toBe(GOBLIN.maxHp - warrior.damage);
    expect(campaign.battle.turn).toBe(2);
  });

  it('as habilidades, os turnos e a derrota continuam funcionando', () => {
    const campaign = new Campaign();
    const mage = heroNamed(campaign, 'mage');
    const slime = campaign.battle.monsters.find((m) => m.definition.id === 'slime');
    if (!slime) throw new Error('slime ausente');

    expect(castAbility(campaign.battle, mage, [slime.position])).toBe(true);
    expect(slime.hp).toBe(slime.maxHp - 10);

    campaign.battle.resolveAll();
    loseFloor(campaign);
    expect(campaign.status).toBe('defeated');
  });
});

describe('Campanhas simuladas', () => {
  it('terminam sem travar e sem estados inválidos (ações aleatórias, 40 campanhas)', () => {
    let seed = 7;
    const random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const randomCell = (): Position => ({ col: Math.floor(random() * 6), row: Math.floor(random() * 6) });
    const results = { completed: 0, defeated: 0 };

    for (let run = 0; run < 40; run++) {
      const campaign = new Campaign();
      let guard = 0;

      while ((campaign.status === 'fighting' || campaign.status === 'floor-cleared') && guard++ < 4000) {
        if (campaign.status === 'floor-cleared') {
          expect(campaign.advance()).toBe(true);
          continue;
        }

        const battle = campaign.battle;
        const hero = battle.heroes[Math.floor(random() * battle.heroes.length)];
        battle.toggleSelection(hero.uid);

        let acted = false;
        if (random() < 0.3 && battle.canUseAbility(hero)) {
          if (battle.beginAbility() && battle.phase === 'player') {
            for (let attempt = 0; attempt < 4 && !battle.canConfirmAbility; attempt++) {
              battle.chooseAbilityCell(randomCell());
            }
            acted = battle.confirmAbility();
            if (!acted) battle.cancelAbility();
          } else {
            acted = battle.phase !== 'player';
          }
        }
        if (!acted && battle.phase === 'player') {
          const moves = battle.getValidMoves(hero);
          if (random() > 0.85 || moves.length === 0) battle.passTurn();
          else battle.moveSelectedUnit(moves[Math.floor(random() * moves.length)]);
        }
        battle.resolveAll();

        // Invariantes a cada turno.
        const cells = battle.units.map((u) => key(u.position));
        expect(new Set(cells).size).toBe(cells.length);
        expect(battle.heroRoster).toHaveLength(5);
        for (const unit of battle.units) {
          expect(unit.hp).toBeGreaterThan(0);
          expect(unit.hp).toBeLessThan(unit.maxHp + 1);
        }
      }

      expect(campaign.status === 'defeated' || campaign.status === 'completed').toBe(true);
      if (campaign.status === 'completed') results.completed++;
      else results.defeated++;
    }

    expect(results.completed + results.defeated).toBe(40);
  });
});
