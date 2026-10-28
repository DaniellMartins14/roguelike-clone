import { CAMPAIGN_FLOORS, ENCOUNTER_LABELS } from '../data/encounters';
import type { FloorConfig } from '../data/encounters';
import type { BattleSetup } from '../data/battleSetup';
import type { EncounterType, Unit } from '../types';
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
    this.battle = new GameState(() => this.createEncounter());
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

  /** Os cinco heróis do grupo (vivos e derrotados). */
  get party(): readonly Unit[] {
    return this.partyUnits;
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
    prepareParty(this.partyUnits);
    this.battle.loadEncounter(this.createEncounter());
    return true;
  }

  /** Reinicia a campanha desde o andar 1, com um grupo novo (PV cheio, todos vivos). */
  restart(): void {
    this.floorIndex = 0;
    this.partyUnits = createParty();
    this.inventory.clear();
    this.battle.reset();
  }

  // ---------- Internos ----------

  /** Encontro do andar atual, com o grupo atual. Usado pelo GameState ao iniciar e reiniciar. */
  private createEncounter(): BattleSetup {
    const config = this.floor;
    const setup = buildEncounter(config, this.partyUnits);
    return {
      ...setup,
      title: `Andar ${config.floor}/${this.floors.length} — ${ENCOUNTER_LABELS[config.type]}: ${config.name}`,
    };
  }
}
