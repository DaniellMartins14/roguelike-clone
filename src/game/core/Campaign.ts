import { CAMPAIGN_FLOORS, ENCOUNTER_LABELS } from '../data/encounters';
import type { FloorConfig } from '../data/encounters';
import type { BattleSetup } from '../data/battleSetup';
import type { EncounterType, Position, Unit } from '../types';
import { buildEncounter, createParty, prepareParty, validateFloor } from './encounter';
import { GameState } from './GameState';
import { PlayerInventory } from './progression';

/**
 * Situação da campanha:
 * - 'fighting': combate em andamento;
 * - 'floor-cleared': o andar foi vencido e o jogador ainda precisa confirmar o avanço;
 * - 'defeated': todos os heróis caíram, a campanha terminou;
 * - 'completed': o último andar (o chefe principal) foi vencido.
 */
export type CampaignStatus = 'fighting' | 'floor-cleared' | 'defeated' | 'completed';

/**
 * Estado da campanha: andar atual, grupo de heróis e o combate do andar. Não depende do Phaser
 * nem do DOM. A cena e o painel observam `battle` (todo avanço ou reinício passa por ele, via os
 * eventos 'encounter' e 'reset'); a situação da campanha é DERIVADA do resultado do combate,
 * então nunca fica fora de sincronia com ele.
 *
 * O grupo de heróis é criado uma vez por campanha e reaproveitado em todos os andares: o PV
 * é preservado, heróis derrotados continuam derrotados, e a habilidade especial volta a ficar
 * disponível a cada encontro.
 */
export class Campaign {
  /** O combate do andar atual (o mesmo objeto durante toda a campanha). */
  readonly battle: GameState;
  private readonly floors: readonly FloorConfig[];
  private floorIndex = 0;
  private partyUnits: Unit[];
  private activePartyUids: string[] = [];
  private expeditionItemsLost = false;
  private readonly rewardedMonsterUids = new Set<string>();
  /** Ouro permanente do jogador, preservado entre incursões e derrotas. */
  gold = 0;
  /** Inventário compartilhado do jogador; os equipamentos são referências nos heróis. */
  readonly inventory = new PlayerInventory();

  constructor(floors: readonly FloorConfig[] = CAMPAIGN_FLOORS) {
    const problems = floors.flatMap((config) => validateFloor(config));
    if (floors.length === 0) problems.push('A campanha precisa de pelo menos um andar.');
    floors.forEach((config, index) => {
      if (config.floor !== index + 1) {
        problems.push(`Andar na posição ${index + 1} está numerado como ${config.floor}.`);
      }
    });
    if (problems.length > 0) {
      throw new Error(`Campanha inválida:\n${problems.join('\n')}`);
    }

    this.floors = floors;
    this.partyUnits = createParty();
    this.activePartyUids = this.partyUnits.map((hero) => hero.uid);
    this.addStarterEquipment();
    this.battle = new GameState(() => this.createEncounter());
    this.battle.subscribe(() => this.collectMonsterRewards());
  }

  // ---------- Consultas ----------

  /** Número do andar atual (1 a `totalFloors`). */
  get floorNumber(): number {
    return this.floorIndex + 1;
  }

  get totalFloors(): number {
    return this.floors.length;
  }

  get floor(): FloorConfig {
    return this.floors[this.floorIndex];
  }

  get encounterType(): EncounterType {
    return this.floor.type;
  }

  get encounterLabel(): string {
    return ENCOUNTER_LABELS[this.floor.type];
  }

  get isLastFloor(): boolean {
    return this.floorIndex === this.floors.length - 1;
  }

  /** Os cinco heróis disponíveis, incluindo os que não foram escolhidos para esta expedição. */
  get party(): readonly Unit[] {
    return this.partyUnits;
  }

  /** Heróis escolhidos para a expedição atual. */
  get activeParty(): readonly Unit[] {
    return this.partyUnits.filter((hero) => this.activePartyUids.includes(hero.uid));
  }

  /** Define de 1 a 3 heróis e suas casas iniciais antes de iniciar a expedição. */
  configureParty(heroUids: readonly string[], positions: Readonly<Record<string, Position>>): boolean {
    if (heroUids.length < 1 || heroUids.length > 3 || new Set(heroUids).size !== heroUids.length) return false;
    const selected = heroUids.map((uid) => this.partyUnits.find((hero) => hero.uid === uid));
    if (selected.some((hero) => !hero || hero.hp <= 0)) return false;
    const occupied = new Set<string>();
    for (const hero of selected as Unit[]) {
      const pos = positions[hero.uid];
      if (!pos || !Number.isInteger(pos.col) || !Number.isInteger(pos.row) || pos.col < 0 || pos.col > 5 || pos.row < 3 || pos.row > 5) return false;
      const key = `${pos.col},${pos.row}`;
      if (occupied.has(key)) return false;
      occupied.add(key);
    }
    this.activePartyUids = [...heroUids];
    for (const hero of selected as Unit[]) {
      const pos = positions[hero.uid];
      hero.position = { col: pos.col, row: pos.row };
    }

    // A cena Phaser sincroniza o encontro ao iniciar. Não emitir evento aqui:
    // o jogo anterior pode estar sendo destruído e ainda ter listeners temporariamente ativos.
    return true;
  }

  /** Sincroniza o estado de batalha com a equipe selecionada, antes de a cena assinar eventos. */
  syncActiveEncounter(): void {
    // A cena ainda está sendo criada: atualiza os dados sem emitir evento para listeners antigos.
    this.battle.loadEncounter(this.createEncounter(), false);
  }

  get status(): CampaignStatus {
    switch (this.battle.outcome) {
      case 'defeat':
        return 'defeated';
      case 'victory':
        return this.isLastFloor ? 'completed' : 'floor-cleared';
      case 'ongoing':
        return 'fighting';
    }
  }

  // ---------- Ações ----------

  /**
   * Avança para o próximo andar. Só funciona depois de vencer um andar que não é o último (o
   * jogador precisa pedir). Retorna false em qualquer outro caso, inclusive em cliques repetidos:
   * depois do primeiro avanço a situação volta a 'fighting' e os demais são recusados.
   */
  advance(): boolean {
    if (this.status !== 'floor-cleared') return false;

    this.floorIndex += 1;
    this.rewardedMonsterUids.clear();
    prepareParty(this.activeParty);
    this.battle.loadEncounter(this.createEncounter());
    return true;
  }

  /** Extração manual após concluir um marco de 5 andares (ex.: andar 5). */
  get canExtract(): boolean {
    return (this.status === 'floor-cleared' || this.status === 'completed') && this.floorNumber % 5 === 0;
  }

  /** Saque e ouro ficam permanentes; a interface retorna à base e reinicia a incursão. */
  extract(): boolean {
    if (!this.canExtract) return false;
    this.restart(false);
    return true;
  }

  /** Derrotas não removem equipamento permanente nem o ouro acumulado. */
  loseExpeditionItems(): void {
    this.expeditionItemsLost = false;
  }

  private collectMonsterRewards(): void {
    for (const monster of this.battle.roster) {
      if (monster.definition.team !== 'monster' || monster.hp > 0 || this.rewardedMonsterUids.has(monster.uid)) continue;
      this.rewardedMonsterUids.add(monster.uid);

      const rank = monster.definition.rank ?? 'normal';
      const reward = rank === 'boss' ? 100 : rank === 'mini-boss' ? 35 : 5;
      this.gold += reward;

      if (this.floorNumber === 5 && rank === 'mini-boss') {
        this.inventory.add('leather-boots');
      } else if (this.floorNumber === 10 && rank === 'boss') {
        this.inventory.add('padded-chest');
        this.inventory.add('rusty-sword');
      }
    }
  }

  /** Reinicia uma expedição no andar 1 sem apagar níveis, XP ou atributos permanentes. */
  restart(notify = true): void {
    this.floorIndex = 0;
    this.rewardedMonsterUids.clear();
    const restoreStarterEquipment = this.expeditionItemsLost;

    for (const hero of this.partyUnits) {
      hero.hp = hero.maxHp;
      hero.abilityUsed = false;
      hero.stunned = false;
    }

    // Uma incursão concluída preserva inventário e equipamentos. Só repomos o kit inicial
    // quando a incursão anterior terminou em derrota e os itens foram perdidos.
    if (restoreStarterEquipment) {
      this.inventory.clear();
      this.addStarterEquipment();
    }
    this.expeditionItemsLost = false;

    if (this.activePartyUids.length === 0) this.activePartyUids = this.partyUnits.slice(0, 3).map((hero) => hero.uid);
    this.battle.reset(notify);
  }

  private addStarterEquipment(): void {
    for (const id of ['worn-right-glove', 'worn-left-glove', 'leather-boots', 'padded-chest', 'iron-helmet', 'traveler-pants', 'rusty-sword', 'wooden-buckler']) {
      this.inventory.add(id);
    }
  }

  // ---------- Internos ----------

  /** Encontro do andar atual, com o grupo atual. Usado pelo GameState ao iniciar e reiniciar. */
  private createEncounter(): BattleSetup {
    const config = this.floor;
    const setup = buildEncounter(config, this.activeParty);
    return {
      ...setup,
      title: `Andar ${config.floor}/${this.floors.length} — ${ENCOUNTER_LABELS[config.type]}: ${config.name}`,
    };
  }
}
