import { ABILITY_BALANCE } from './abilities';
import { allocateAttributePoint, applyDeathXpPenalty, awardKillXp } from './progression';
import type { AttributeName } from './progression';
import { createInitialBattle } from '../data/battleSetup';
import type { BattleFactory, BattleSetup } from '../data/battleSetup';
import type {
  AbilityDefinition,
  AbilityEffect,
  AbilityPreview,
  AbilityTargeting,
  AmbushTargeting,
  BattleOutcome,
  BattlePhase,
  DamageEvent,
  ExuraTargeting,
  FireballTargeting,
  GameEvent,
  HealEvent,
  LogEntry,
  LogKind,
  PiercingShotTargeting,
  Position,
  TelegraphIntent,
  Unit,
} from '../types';
import {
  ambushDestinations,
  directionName,
  fireballArea,
  fireballTargets,
  healAmount,
  pierceLine,
  pierceTargets,
  stompArea,
  stompTargets,
} from './abilities';
import { chooseMonsterMove } from './ai';
import type { ReachableCell } from './board';
import {
  ORTHOGONAL_DIRECTIONS,
  computeReachable,
  directionBetween,
  findPlacementProblems,
  footprintCells,
  footprintFits,
  getMovementDirections,
  isInsideBoard,
  occupies,
  positionLabel,
  positionsEqual,
  sizeOf,
  unitCells,
} from './board';
import type { AttackContext } from './combat';
import { findAttackTargets, isAlive } from './combat';
import { chooseTelegraphTarget, createTelegraphIntent, selectTelegraphedAttack } from './telegraph';

type Listener = (event: GameEvent) => void;

const MAX_LOG_ENTRIES = 200;

/**
 * Estado e regras da batalha. Não depende do Phaser nem do DOM:
 * a cena e o painel apenas observam este objeto via subscribe().
 *
 * Fluxo de um turno:
 *  1. fase 'player': o jogador seleciona um herói e ESCOLHE UMA AÇÃO: mover, usar a habilidade
 *     especial (uma vez por combate) ou passar a vez;
 *  2. fase 'heroes': cada herói vivo ataca (um por vez);
 *  3. fase 'telegraphs': se o chefe ainda está vivo, o golpe que ele anunciou é resolvido e
 *     atinge as casas anunciadas (chefe morto = golpe cancelado);
 *  4. fase 'monsters': cada monstro vivo anda e ataca (um por vez); atordoados perdem a ação;
 *     os chefes anunciam o próximo golpe (a área fica vermelha para o turno seguinte);
 *  5. vitória/derrota é verificada; se o combate continua, começa o próximo turno.
 *
 * As fases 2 e 3 são resolvidas passo a passo por step(), para que a cena possa animar
 * cada ação. Enquanto isso o estado recusa ações do jogador. resolveAll() executa todos os
 * passos de uma vez (usado nos testes).
 *
 * Habilidades com escolha de alvo seguem: beginAbility() -> chooseAbilityCell() (quantas vezes
 * quiser, mostrando a prévia) -> confirmAbility() ou cancelAbility(). Nada é consumido até a
 * confirmação válida.
 */
export class GameState {
  private readonly createBattle: BattleFactory;
  /** Todas as unidades da batalha, inclusive as derrotadas (hp <= 0). */
  private allUnits: Unit[] = [];
  private obstacleList: Position[] = [];
  private currentTurn = 1;
  private currentPhase: BattlePhase = 'player';
  private currentOutcome: BattleOutcome = 'ongoing';
  private selectedUnitUid: string | null = null;
  private targetingState: AbilityTargeting | null = null;
  private noticeText: string | null = null;
  /** Fila (por uid) de quem ainda age na fase atual. */
  private pendingActors: string[] = [];
  private lastActorUid: string | null = null;
  /** Intenções de ataque dos chefes neste encontro (pendentes, resolvidas e canceladas). */
  private intents: TelegraphIntent[] = [];
  private intentCounter = 0;
  private logEntries: LogEntry[] = [];
  private damageEvents: DamageEvent[] = [];
  private healEvents: HealEvent[] = [];
  private effect: AbilityEffect | null = null;
  private readonly listeners = new Set<Listener>();

  constructor(createBattle: BattleFactory = createInitialBattle) {
    this.createBattle = createBattle;
    this.setup();
  }

  // ---------- Consultas ----------

  /** Todas as unidades, vivas e derrotadas (para listas na interface). */
  get roster(): readonly Unit[] {
    return this.allUnits;
  }

  get heroRoster(): Unit[] {
    return this.allUnits.filter((unit) => unit.definition.team === 'hero');
  }

  get monsterRoster(): Unit[] {
    return this.allUnits.filter((unit) => unit.definition.team === 'monster');
  }

  /** Unidades vivas, ou seja, as que estão no tabuleiro. */
  get units(): Unit[] {
    return this.allUnits.filter(isAlive);
  }

  get heroes(): Unit[] {
    return this.units.filter((unit) => unit.definition.team === 'hero');
  }

  get monsters(): Unit[] {
    return this.units.filter((unit) => unit.definition.team === 'monster');
  }

  get obstacles(): readonly Position[] {
    return this.obstacleList;
  }

  get turn(): number {
    return this.currentTurn;
  }

  get phase(): BattlePhase {
    return this.currentPhase;
  }

  /** true enquanto heróis ou monstros estão agindo (interações do jogador travadas). */
  get isResolving(): boolean {
    return (
      this.currentPhase === 'heroes' ||
      this.currentPhase === 'telegraphs' ||
      this.currentPhase === 'monsters'
    );
  }

  get isOver(): boolean {
    return this.currentPhase === 'over';
  }

  get outcome(): BattleOutcome {
    return this.currentOutcome;
  }

  get selectedUid(): string | null {
    return this.selectedUnitUid;
  }

  get selectedUnit(): Unit | null {
    if (this.selectedUnitUid === null) return null;
    return this.allUnits.find((unit) => unit.uid === this.selectedUnitUid && isAlive(unit)) ?? null;
  }

  get log(): readonly LogEntry[] {
    return this.logEntries;
  }

  /** Golpes do último passo de resolução (ou da habilidade que acabou de ser usada). */
  get lastDamage(): readonly DamageEvent[] {
    return this.damageEvents;
  }

  /** Curas do último passo de resolução (ou da habilidade que acabou de ser usada). */
  get lastHealing(): readonly HealEvent[] {
    return this.healEvents;
  }

  /** Área da habilidade que acabou de ser usada, para a cena destacar. */
  get lastEffect(): AbilityEffect | null {
    return this.effect;
  }

  /** Quem agiu no último passo de resolução, se alguém agiu. */
  get lastActor(): Unit | null {
    if (this.lastActorUid === null) return null;
    return this.allUnits.find((unit) => unit.uid === this.lastActorUid) ?? null;
  }

  /** Todas as intenções de ataque do encontro (inclusive resolvidas e canceladas). */
  get telegraphs(): readonly TelegraphIntent[] {
    return this.intents;
  }

  /** Golpes anunciados que ainda não aconteceram: as casas deles aparecem em vermelho. */
  get pendingTelegraphs(): TelegraphIntent[] {
    return this.intents.filter((intent) => intent.status === 'pending');
  }

  /** A casa está numa área anunciada e ainda pendente? */
  isThreatened(pos: Position): boolean {
    return this.pendingTelegraphs.some((intent) => intent.cells.some((cell) => positionsEqual(cell, pos)));
  }

  /** Unidade viva que ocupa a casa, se houver (uma entidade grande responde por todas as suas casas). */
  getUnitAt(pos: Position): Unit | null {
    return this.allUnits.find((unit) => isAlive(unit) && occupies(unit, pos)) ?? null;
  }

  isObstacle(pos: Position): boolean {
    return this.obstacleList.some((obstacle) => positionsEqual(obstacle, pos));
  }

  /**
   * Casas para onde a unidade pode andar: até `movement` passos (heróis também na diagonal),
   * sem sair do tabuleiro e sem atravessar ou parar em casas ocupadas/obstáculos.
   */
  getValidMoves(unit: Unit): Position[] {
    if (!isAlive(unit)) return [];
    return this.findMoves(unit).map((option) => option.position);
  }

  // ---------- Habilidades: consultas ----------

  /** Habilidade do herói selecionado, se houver. */
  get selectedAbility(): AbilityDefinition | null {
    return this.selectedUnit?.definition.ability ?? null;
  }

  /** A habilidade do herói pode ser usada agora? (vez do jogador, vivo, ainda não usada) */
  canUseAbility(unit: Unit): boolean {
    return (
      this.currentPhase === 'player' &&
      unit.definition.team === 'hero' &&
      isAlive(unit) &&
      unit.definition.ability !== undefined &&
      !unit.abilityUsed
    );
  }

  /** Seleção de alvo em andamento (entre "Usar habilidade" e "Confirmar"), se houver. */
  get targeting(): AbilityTargeting | null {
    return this.targetingState;
  }

  /** Último aviso para o jogador (ação inválida, motivo de recusa...). */
  get notice(): string | null {
    return this.noticeText;
  }

  /** A escolha de alvo está completa e pode ser confirmada? */
  get canConfirmAbility(): boolean {
    const targeting = this.targetingState;
    if (!targeting) return false;
    switch (targeting.id) {
      case 'ambush':
        return targeting.targetUid !== null && targeting.destination !== null;
      case 'piercing-shot':
        return targeting.direction !== null;
      case 'fireball':
        return targeting.center !== null;
      case 'exura':
        return targeting.targetUid !== null;
    }
  }

  /** Instrução para o passo atual da escolha de alvo. */
  get targetingHint(): string {
    const targeting = this.targetingState;
    if (!targeting) return '';
    switch (targeting.id) {
      case 'ambush':
        if (targeting.targetUid === null) return 'Clique em um monstro para escolhê-lo como alvo.';
        if (targeting.destination === null) {
          return 'Clique em uma das casas destacadas para escolher o destino.';
        }
        return 'Confirme a Emboscada (ou clique em outra casa destacada para mudar o destino).';
      case 'piercing-shot':
        return targeting.direction === null
          ? 'Clique em uma casa na mesma linha ou coluna do Arqueiro para escolher a direção.'
          : 'A trajetória está destacada. Confirme o disparo ou escolha outra direção.';
      case 'fireball':
        return targeting.center === null
          ? 'Clique na casa que será o centro da explosão (área 3×3).'
          : 'A área está destacada. Confirme a explosão ou escolha outro centro.';
      case 'exura': {
        const target = targeting.targetUid === null ? null : this.findUnit(targeting.targetUid);
        if (!target) return 'Clique em um herói ferido para curá-lo.';
        const source = this.findUnit(targeting.heroUid);
        const amount = source ? healAmount(target, ABILITY_BALANCE.exuraHealRatio, source) : 0;
        return `${target.definition.name} recuperará ${amount} PV. Confirme a cura ou escolha outro herói.`;
      }
    }
  }

  /** O que a cena deve desenhar durante a escolha de alvo (null se não há escolha em andamento). */
  get abilityPreview(): AbilityPreview | null {
    const targeting = this.targetingState;
    const hero = this.selectedUnit;
    if (!targeting || !hero) return null;

    switch (targeting.id) {
      case 'ambush': {
        const target = targeting.targetUid === null ? null : this.findUnit(targeting.targetUid);
        if (!target) {
          return { selectable: this.monsters.flatMap((monster) => unitCells(monster)), effect: [], chosen: [] };
        }
        const chosen = unitCells(target);
        if (targeting.destination) chosen.push(targeting.destination);
        return {
          selectable: ambushDestinations(hero, target, this.combatContext()),
          effect: targeting.destination ? unitCells(target) : [],
          chosen,
        };
      }
      case 'piercing-shot': {
        const allLines = ORTHOGONAL_DIRECTIONS.flatMap((dir) => pierceLine(hero.position, dir));
        return {
          selectable: allLines,
          effect: targeting.direction ? pierceLine(hero.position, targeting.direction) : [],
          chosen: [],
        };
      }
      case 'fireball':
        return {
          selectable: [],
          effect: targeting.center ? fireballArea(targeting.center) : [],
          chosen: targeting.center ? [targeting.center] : [],
        };
      case 'exura': {
        const target = targeting.targetUid === null ? null : this.findUnit(targeting.targetUid);
        return {
          selectable: this.heroes.filter((h) => h.hp < h.maxHp).flatMap((h) => unitCells(h)),
          effect: target ? unitCells(target) : [],
          chosen: target ? unitCells(target) : [],
        };
      }
    }
  }

  // ---------- Ações do jogador (só na fase 'player') ----------

  /** Seleciona um herói vivo; se ele já estava selecionado, desfaz a seleção. */
  toggleSelection(uid: string): void {
    if (this.currentPhase !== 'player') return;
    if (this.selectedUnitUid === uid) {
      this.clearSelection();
      return;
    }
    const unit = this.allUnits.find((candidate) => candidate.uid === uid);
    if (!unit || !isAlive(unit) || unit.definition.team !== 'hero') return;
    this.selectedUnitUid = uid;
    this.targetingState = null;
    this.noticeText = null;
    this.emit('select');
  }

  /** Distribui um ponto no herói selecionado sem consumir o turno de combate. */
  allocateSelectedAttribute(attribute: AttributeName): boolean {
    if (this.currentPhase !== 'player' || this.targetingState) return false;
    const hero = this.selectedUnit;
    if (!hero || hero.definition.team !== 'hero' || !hero.progression) return false;
    if (!allocateAttributePoint(hero, attribute, 1)) return false;

    if (attribute === 'strength') {
      hero.damage += 1;
    } else if (attribute === 'vitality') {
      hero.maxHp += 10;
      hero.hp = Math.min(hero.maxHp, hero.hp + 10);
    }
    this.addLog(
      `${hero.definition.name} investiu 1 ponto em ${attribute === 'strength' ? 'Força' : attribute === 'vitality' ? 'Vitalidade' : 'Defesa'}.`,
      'hero',
    );
    this.emit('select');
    return true;
  }

  /** Desfaz a seleção do herói e qualquer escolha de alvo em andamento. */
  clearSelection(): void {
    if (this.selectedUnitUid === null && this.targetingState === null) return;
    this.selectedUnitUid = null;
    this.targetingState = null;
    this.noticeText = null;
    this.emit('select');
  }

  /**
   * Move o herói selecionado para `destination` se for uma casa válida e inicia a
   * resolução do turno. Retorna true se a movimentação ocorreu.
   */
  moveSelectedUnit(destination: Position): boolean {
    if (this.currentPhase !== 'player') return false;
    if (this.targetingState) return false; // escolhendo alvo de habilidade: nada de mover
    const unit = this.selectedUnit;
    if (!unit) return false;

    const option = this.findMoves(unit).find((move) => positionsEqual(move.position, destination));
    if (!option) return false;

    this.resetEffects();
    const from = positionLabel(unit.position);
    unit.facing = directionBetween(unit.position, option.position);
    unit.position = { col: option.position.col, row: option.position.row };
    this.addLog(`${unit.definition.name} moveu de ${from} para ${positionLabel(unit.position)}.`, 'hero');

    this.noticeText = null;
    this.beginResolution();
    return true;
  }

  /** O jogador passa a vez: ninguém se move, mas os ataques do turno acontecem. */
  passTurn(): boolean {
    if (this.currentPhase !== 'player') return false;
    this.resetEffects();
    this.targetingState = null;
    this.noticeText = null;
    this.addLog('O jogador passou a vez.', 'info');
    this.beginResolution();
    return true;
  }

  /** Reinicia a batalha a qualquer momento, inclusive durante a resolução. */
  reset(): void {
    this.setup();
    this.emit('reset');
  }

  /**
   * Prepara um novo encontro (por exemplo, o próximo andar): troca as unidades e os obstáculos,
   * volta ao turno 1 e limpa seleção, escolha de alvo, avisos, efeitos e filas pendentes.
   * As unidades recebidas são usadas como estão: para manter o grupo entre andares, a campanha
   * reaproveita os mesmos heróis (com o PV atual) no `setup.units`. O log é preservado.
   */
  loadEncounter(battle: BattleSetup, notify = true): void {
    this.applyBattle(battle, false);
    // Ao inicializar uma cena nova, o estado deve ser preparado sem notificar listeners
    // pertencentes à cena anterior (que pode estar em processo de destruição).
    if (notify) this.emit('encounter');
  }

  // ---------- Habilidades: ações do jogador ----------

  /**
   * Inicia a habilidade do herói selecionado. A Pisada, que não precisa de alvo, é usada na hora;
   * as demais abrem a escolha de alvo. Retorna false se não for possível (e explica no aviso).
   */
  beginAbility(): boolean {
    if (this.currentPhase !== 'player') return false;
    const hero = this.selectedUnit;
    const ability = hero?.definition.ability;
    if (!hero || !ability) return false;

    if (hero.abilityUsed) {
      this.setNotice(`${ability.name} já foi usada neste combate.`);
      this.emit('targeting');
      return false;
    }

    this.noticeText = null;
    switch (ability.id) {
      case 'stomp':
        this.useAbility(hero, ability, '', () => this.castStomp(hero));
        return true;
      case 'ambush':
        this.targetingState = { id: 'ambush', heroUid: hero.uid, targetUid: null, destination: null };
        break;
      case 'piercing-shot':
        this.targetingState = { id: 'piercing-shot', heroUid: hero.uid, direction: null };
        break;
      case 'fireball':
        this.targetingState = { id: 'fireball', heroUid: hero.uid, center: null };
        break;
      case 'exura':
        this.targetingState = { id: 'exura', heroUid: hero.uid, targetUid: null };
        break;
    }
    this.emit('targeting');
    return true;
  }

  /** Cancela a escolha de alvo sem consumir a habilidade. */
  cancelAbility(): void {
    if (!this.targetingState) return;
    this.targetingState = null;
    this.noticeText = null;
    this.emit('targeting');
  }

  /**
   * Clique numa casa durante a escolha de alvo: atualiza a escolha e a prévia (sem usar a
   * habilidade). Retorna true se a escolha foi aceita; se não, explica no aviso.
   */
  chooseAbilityCell(cell: Position): boolean {
    if (this.currentPhase !== 'player') return false;
    const targeting = this.targetingState;
    const hero = this.selectedUnit;
    if (!targeting || !hero || hero.uid !== targeting.heroUid) return false;

    let accepted = false;
    switch (targeting.id) {
      case 'ambush':
        accepted = this.chooseAmbushCell(hero, targeting, cell);
        break;
      case 'piercing-shot':
        accepted = this.choosePierceCell(hero, targeting, cell);
        break;
      case 'fireball':
        accepted = this.chooseFireballCell(targeting, cell);
        break;
      case 'exura':
        accepted = this.chooseExuraCell(targeting, cell);
        break;
    }
    this.emit('targeting');
    return accepted;
  }

  /**
   * Confirma e usa a habilidade com a escolha atual. Revalida tudo; se algo não estiver válido,
   * não consome a habilidade. Depois do uso, a resolução do turno começa (os heróis atacam...).
   */
  confirmAbility(): boolean {
    if (this.currentPhase !== 'player') return false;
    const targeting = this.targetingState;
    const hero = this.selectedUnit;
    const ability = hero?.definition.ability;
    if (!targeting || !hero || !ability || hero.uid !== targeting.heroUid) return false;
    if (hero.abilityUsed) return false;

    switch (targeting.id) {
      case 'ambush': {
        const target = targeting.targetUid === null ? null : this.findUnit(targeting.targetUid);
        const destination = targeting.destination;
        if (!target || !isAlive(target) || !destination) {
          this.rejectConfirm('Escolha o alvo e a casa de destino antes de confirmar.');
          return false;
        }
        const valid = ambushDestinations(hero, target, this.combatContext()).some((cell) =>
          positionsEqual(cell, destination),
        );
        if (!valid) {
          this.rejectConfirm('A casa de destino não é mais válida. Escolha outra.');
          return false;
        }
        const detail = ` em ${target.definition.name} (${positionLabel(target.position)})`;
        this.useAbility(hero, ability, detail, () => this.castAmbush(hero, target, destination));
        return true;
      }
      case 'piercing-shot': {
        const direction = targeting.direction;
        if (!direction) {
          this.rejectConfirm('Escolha a direção do disparo antes de confirmar.');
          return false;
        }
        const detail = ` (${directionName(direction)})`;
        this.useAbility(hero, ability, detail, () => this.castPiercingShot(hero, direction));
        return true;
      }
      case 'fireball': {
        const center = targeting.center;
        if (!center || !isInsideBoard(center)) {
          this.rejectConfirm('Escolha o centro da explosão antes de confirmar.');
          return false;
        }
        const detail = ` (centro em ${positionLabel(center)})`;
        this.useAbility(hero, ability, detail, () => this.castFireball(hero, center));
        return true;
      }
      case 'exura': {
        const target = targeting.targetUid === null ? null : this.findUnit(targeting.targetUid);
        if (!target || !isAlive(target) || target.definition.team !== 'hero') {
          this.rejectConfirm('Escolha um herói vivo antes de confirmar.');
          return false;
        }
        if (healAmount(target, ABILITY_BALANCE.exuraHealRatio, hero) === 0) {
          this.rejectConfirm(`${target.definition.name} já está com PV máximo.`, true);
          return false;
        }
        const detail = ` em ${target.definition.name}`;
        this.useAbility(hero, ability, detail, () => this.castExura(hero, target));
        return true;
      }
    }
  }

  // ---------- Resolução do turno ----------

  /**
   * Avança a resolução em um passo: o próximo herói/monstro que realmente age (ataca ou anda).
   * Unidades derrotadas ou sem nada a fazer são puladas sem custar um passo. Quando não há mais
   * ninguém para agir, a fase termina e é emitido 'turn' (próximo turno) ou 'over' (fim).
   * Não faz nada se não houver resolução em andamento.
   */
  step(): void {
    if (!this.isResolving) return;
    this.resetEffects();
    this.lastActorUid = null;

    while (this.isResolving) {
      if (this.advance()) {
        this.emit('step');
        return;
      }
    }

    this.emit(this.isOver ? 'over' : 'turn');
  }

  /** Executa todos os passos pendentes de uma vez, sem animação. */
  resolveAll(): void {
    while (this.isResolving) {
      this.step();
    }
  }

  // ---------- Observadores ----------

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ---------- Internos: resolução ----------

  private beginResolution(): void {
    this.selectedUnitUid = null;
    this.targetingState = null;
    this.lastActorUid = null;
    this.currentPhase = 'heroes';
    this.pendingActors = this.heroes.map((hero) => hero.uid);
    this.addLog('Os heróis atacam.', 'info');
    this.emit('resolving');
  }

  /** Processa o próximo ator da fila. Retorna true se alguém agiu de fato. */
  private advance(): boolean {
    const uid = this.pendingActors.shift();

    if (uid === undefined) {
      if (this.currentPhase === 'heroes') {
        this.finishHeroPhase();
      } else if (this.currentPhase === 'telegraphs') {
        this.finishTelegraphPhase();
      } else {
        this.finishMonsterPhase();
      }
      return false;
    }

    // Na fase dos golpes anunciados a fila guarda ids de intenções, não de unidades.
    if (this.currentPhase === 'telegraphs') {
      return this.resolveTelegraph(uid);
    }

    // Quem morreu depois de entrar na fila não age.
    const actor = this.allUnits.find((unit) => unit.uid === uid);
    if (!actor || !isAlive(actor)) return false;

    const acted = this.currentPhase === 'heroes' ? this.heroAct(actor) : this.monsterAct(actor);
    if (acted) this.lastActorUid = actor.uid;
    return acted;
  }

  private finishHeroPhase(): void {
    this.updateOutcome();
    if (this.isOver) return;
    this.currentPhase = 'telegraphs';
    this.pendingActors = this.pendingTelegraphs.map((intent) => intent.id);
  }

  private finishTelegraphPhase(): void {
    this.updateOutcome();
    if (this.isOver) return;
    this.currentPhase = 'monsters';
    this.pendingActors = this.monsters.map((monster) => monster.uid);
    this.addLog('Os monstros agem.', 'info');
  }

  private finishMonsterPhase(): void {
    this.updateOutcome();
    if (this.isOver) return;
    this.currentTurn += 1;
    this.currentPhase = 'player';
    this.addLog(`Turno ${this.currentTurn} começou. Sua vez.`, 'info');
  }

  private heroAct(hero: Unit): boolean {
    return this.performAttack(hero) > 0;
  }

  /**
   * Monstro atordoado perde a ação (e se recupera). Os demais avançam (se não tiverem alvo
   * ao alcance) e atacam (se tiverem alvo depois de avançar).
   */
  private monsterAct(monster: Unit): boolean {
    if (this.heroes.length === 0) return false;

    if (monster.stunned) {
      monster.stunned = false;
      this.addLog(`${monster.definition.name} está atordoado e perde a ação. Já se recuperou.`, 'monster');
      return true;
    }

    // Chefe com ataques telegrafados: anunciar o golpe é a ação dele neste turno.
    if (this.tryAnnounceTelegraph(monster)) return true;

    let acted = false;

    const move = chooseMonsterMove(monster, this.combatContext());
    if (move) {
      const from = positionLabel(monster.position);
      monster.facing = directionBetween(monster.position, move.position);
      monster.position = { col: move.position.col, row: move.position.row };
      this.addLog(
        `${monster.definition.name} avançou de ${from} para ${positionLabel(monster.position)}.`,
        'monster',
      );
      acted = true;
    }

    if (this.performAttack(monster) > 0) acted = true;
    return acted;
  }

  /** Ataque normal: acerta todos os alvos válidos da unidade. Retorna quantos foram atingidos. */
  private performAttack(attacker: Unit): number {
    const targets = findAttackTargets(attacker, this.combatContext());
    const kind: LogKind = attacker.definition.team === 'hero' ? 'hero' : 'monster';

    for (const target of targets) {
      this.dealDamage(target, attacker.damage, kind, `${attacker.definition.name} atacou`, attacker);
    }

    return targets.length;
  }

  /** Aplica dano (HP nunca fica abaixo de zero), registra o golpe e a morte. */
  private dealDamage(target: Unit, amount: number, kind: LogKind, prefix: string, attacker?: Unit): void {
    if (!isAlive(target)) return;
    const cell = positionLabel(target.position);
    const defense = target.definition.team === 'hero' ? (target.progression?.attributes.defense ?? 0) : 0;
    const effectiveAmount = target.definition.team === 'hero' ? Math.max(1, amount - defense) : amount;
    target.hp = Math.max(0, target.hp - effectiveAmount);
    const killed = target.hp === 0;

    this.damageEvents.push({
      targetUid: target.uid,
      amount: effectiveAmount,
      position: { col: target.position.col, row: target.position.row },
      killed,
    });

    this.addLog(
      `${prefix} ${target.definition.name} (${cell}) e causou ${effectiveAmount} de dano. ` +
        `PV ${target.hp}/${target.maxHp}.`,
      kind,
    );
    if (killed) {
      this.addLog(`${target.definition.name} foi derrotado!`, 'death');
      if (target.definition.team === 'hero') {
        const lost = applyDeathXpPenalty(target);
        if (lost > 0) this.addLog(`${target.definition.name} perdeu ${lost} XP pela morte (penalidade de 10% da barra do nível).`, 'death');
      }
      if (attacker && attacker.definition.team === 'hero' && target.definition.team === 'monster') {
        const gained = awardKillXp(attacker, target);
        if (gained > 0) this.addLog(`${attacker.definition.name} recebeu ${gained} XP pelo golpe final.`, 'hero');
      }
      // Chefe morto não executa o golpe que tinha anunciado.
      this.cancelTelegraphsOf(target, `foi derrotado antes de concluir o golpe`);
    }
  }

  /** Heróis derrotados têm precedência: se todos caíram (por exemplo, por fogo amigo), é derrota. */
  private updateOutcome(): void {
    if (this.isOver) return;

    if (this.heroes.length === 0) {
      this.currentOutcome = 'defeat';
      this.currentPhase = 'over';
      this.pendingActors = [];
      this.cancelAllTelegraphs('o combate terminou');
      this.addLog('Derrota! Todos os heróis foram derrotados.', 'result');
    } else if (this.monsters.length === 0) {
      this.currentOutcome = 'victory';
      this.currentPhase = 'over';
      this.pendingActors = [];
      this.cancelAllTelegraphs('o combate terminou');
      this.addLog('Vitória! Todos os monstros foram derrotados.', 'result');
    }
  }

  // ---------- Internos: ataques telegrafados ----------

  /**
   * Se o chefe pode, anuncia o próximo golpe: escolhe o ataque da vez e o herói-alvo, calcula a
   * área UMA vez e registra a intenção pendente. Respeita a pausa entre golpes e só admite um
   * golpe pendente por chefe. Retorna true se anunciou (isso conta como a ação do chefe).
   */
  private tryAnnounceTelegraph(boss: Unit): boolean {
    const config = boss.definition.telegraph;
    const state = boss.telegraph;
    if (!config || !state || !isAlive(boss)) return false;
    if (this.intents.some((intent) => intent.bossUid === boss.uid && intent.status === 'pending')) {
      return false;
    }

    // Em pausa: o chefe age normalmente (anda e ataca) enquanto a pausa conta.
    if (state.cooldown > 0) {
      state.cooldown -= 1;
      return false;
    }

    const attack = selectTelegraphedAttack(boss, config);
    if (!attack) return false;
    const target = chooseTelegraphTarget(boss, this.heroes, attack.targeting);
    if (!target) return false;

    this.intentCounter += 1;
    const intent = createTelegraphIntent(
      `${boss.uid}#${this.intentCounter}`,
      boss,
      attack,
      target,
      this.currentTurn,
    );
    this.intents.push(intent);
    state.nextAttack = (state.nextAttack + 1) % config.attacks.length;

    this.addLog(
      `⚠ ${boss.definition.name} está preparando ${attack.name}! ` +
        `As casas em vermelho serão atingidas (${attack.damage} de dano).`,
      'telegraph',
    );
    return true;
  }

  /**
   * Resolve uma intenção pendente. Só executa se ainda estiver pendente e o chefe estiver vivo:
   * marca como resolvida ANTES de causar dano (então não há como executar duas vezes) e atinge
   * quem estiver nas casas ANUNCIADAS agora (as casas nunca são recalculadas).
   */
  private resolveTelegraph(intentId: string): boolean {
    const intent = this.intents.find((candidate) => candidate.id === intentId);
    if (!intent || intent.status !== 'pending') return false;

    const boss = this.findUnit(intent.bossUid);
    if (!boss || !isAlive(boss)) {
      this.cancelTelegraph(intent, `${intent.bossName} foi derrotado antes de concluir ${intent.attackName}.`);
      return false;
    }

    intent.status = 'resolved';
    this.effect = {
      id: 'telegraph',
      cells: intent.cells.map((cell) => ({ col: cell.col, row: cell.row })),
    };
    this.lastActorUid = boss.uid;
    this.addLog(`${boss.definition.name} libera ${intent.attackName}!`, 'telegraph');

    const victims = this.units.filter(
      (unit) =>
        unit.uid !== boss.uid &&
        (intent.friendlyFire || unit.definition.team !== boss.definition.team) &&
        // Uma entidade grande é atingida uma única vez, mesmo com várias casas na área.
        unitCells(unit).some((own) => intent.cells.some((cell) => positionsEqual(cell, own))),
    );
    if (victims.length === 0) {
      this.addLog('Ninguém estava nas casas atingidas.', 'telegraph');
    }
    for (const victim of victims) {
      this.dealDamage(victim, intent.damage, 'monster', `${intent.attackName} atingiu`, boss);
    }

    // Começa a pausa antes do próximo anúncio.
    if (boss.telegraph && boss.definition.telegraph) {
      boss.telegraph.cooldown = boss.definition.telegraph.cooldownTurns;
    }
    return true;
  }

  private cancelTelegraph(intent: TelegraphIntent, message: string): void {
    if (intent.status !== 'pending') return;
    intent.status = 'cancelled';
    this.addLog(`Golpe cancelado: ${message}`, 'telegraph');
  }

  private cancelTelegraphsOf(boss: Unit, reason: string): void {
    for (const intent of this.intents) {
      if (intent.bossUid === boss.uid && intent.status === 'pending') {
        this.cancelTelegraph(intent, `${intent.bossName} ${reason}.`);
      }
    }
  }

  private cancelAllTelegraphs(reason: string): void {
    for (const intent of this.intents) {
      if (intent.status === 'pending') {
        this.cancelTelegraph(intent, `${intent.attackName} não acontece: ${reason}.`);
      }
    }
  }

  // ---------- Internos: habilidades ----------

  /**
   * Passo comum de uso: marca a habilidade como usada, registra no log, aplica o efeito e
   * inicia a resolução do turno (os heróis atacam normalmente depois). O uso substitui o
   * movimento do herói neste turno, porque a vez do jogador termina aqui.
   */
  private useAbility(hero: Unit, ability: AbilityDefinition, detail: string, cast: () => void): void {
    this.resetEffects();
    hero.abilityUsed = true;
    this.targetingState = null;
    this.noticeText = null;
    this.addLog(`${hero.definition.name} usou ${ability.name}${detail}!`, 'ability');
    cast();
    this.beginResolution();
  }

  /** Pisada: atordoa os monstros das 8 casas ao redor. Sem dano. */
  private castStomp(hero: Unit): void {
    this.effect = { id: 'stomp', cells: stompArea(hero) };
    const affected = stompTargets(hero, this.units);

    if (affected.length === 0) {
      this.addLog('Nenhum inimigo estava ao alcance: ninguém foi atordoado.', 'ability');
      return;
    }
    for (const monster of affected) {
      monster.stunned = true;
      this.addLog(
        `${monster.definition.name} (${positionLabel(monster.position)}) foi atordoado e perderá a próxima ação.`,
        'ability',
      );
    }
  }

  /** Emboscada: o Assassino salta direto para o destino e ataca o alvo até duas vezes. */
  private castAmbush(hero: Unit, target: Unit, destination: Position): void {
    const from = positionLabel(hero.position);
    hero.facing = directionBetween(destination, target.position);
    hero.position = { col: destination.col, row: destination.row };
    this.effect = { id: 'ambush', cells: [destination, ...unitCells(target)] };
    if (positionLabel(hero.position) !== from) {
      this.addLog(
        `${hero.definition.name} saltou de ${from} para ${positionLabel(hero.position)}.`,
        'ability',
      );
    }

    for (let attack = 0; attack < ABILITY_BALANCE.ambushAttacks; attack++) {
      // O segundo golpe não acontece se o primeiro matou o alvo.
      if (!isAlive(target)) break;
      // Cada golpe é um ataque normal: o alvo precisa estar no padrão de ataque da classe.
      if (!findAttackTargets(hero, this.combatContext()).includes(target)) break;
      this.dealDamage(target, hero.damage, 'hero', `${hero.definition.name} atacou`, hero);
    }
  }

  /** Tiro Perfurante: atinge todos na linha (aliados incluídos), atravessando tudo. */
  private castPiercingShot(hero: Unit, direction: Position): void {
    this.effect = { id: 'piercing-shot', cells: pierceLine(hero.position, direction) };
    const targets = pierceTargets(hero, direction, this.units);

    if (targets.length === 0) {
      this.addLog('O disparo não atingiu ninguém.', 'ability');
      return;
    }
    for (const target of targets) {
      this.dealDamage(target, ABILITY_BALANCE.piercingShotDamage, 'hero', 'Tiro Perfurante atingiu', hero);
    }
  }

  /** Bola de Fogo: dano em todos na área 3×3 (aliados e o próprio Mago incluídos). */
  private castFireball(hero: Unit, center: Position): void {
    this.effect = { id: 'fireball', cells: fireballArea(center) };
    const targets = fireballTargets(center, this.units);

    if (targets.length === 0) {
      this.addLog('A explosão não atingiu ninguém.', 'ability');
      return;
    }
    for (const target of targets) {
      const prefix = target === hero ? 'Bola de Fogo atingiu o próprio conjurador,' : 'Bola de Fogo atingiu';
      this.dealDamage(target, ABILITY_BALANCE.fireballDamage, 'hero', prefix, hero);
    }
  }

  /** Exura: cura 50% do PV máximo (arredondado para cima), sem passar do máximo. */
  private castExura(hero: Unit, target: Unit): void {
    const amount = healAmount(target, ABILITY_BALANCE.exuraHealRatio, hero);
    target.hp += amount;
    this.effect = { id: 'exura', cells: unitCells(target) };
    this.healEvents.push({
      targetUid: target.uid,
      amount,
      position: { col: target.position.col, row: target.position.row },
    });
    const who = target === hero ? 'a si mesmo' : target.definition.name;
    this.addLog(
      `${hero.definition.name} curou ${who} (${positionLabel(target.position)}): ` +
        `+${amount} PV. PV ${target.hp}/${target.maxHp}.`,
      'heal',
    );
  }

  // ---------- Internos: escolha de alvo ----------

  private chooseAmbushCell(hero: Unit, targeting: AmbushTargeting, cell: Position): boolean {
    const clicked = this.getUnitAt(cell);

    // Clicar num monstro (re)escolhe o alvo.
    if (clicked && clicked.definition.team === 'monster') {
      const destinations = ambushDestinations(hero, clicked, this.combatContext());
      if (destinations.length === 0) {
        this.targetingState = { ...targeting, targetUid: null, destination: null };
        this.setNotice(
          `Emboscada impossível: não há casa diagonal livre ao redor de ${clicked.definition.name}.`,
          true,
        );
        return false;
      }
      this.targetingState = {
        ...targeting,
        targetUid: clicked.uid,
        // Com um único destino possível, ele já vem escolhido (ainda falta confirmar).
        destination: destinations.length === 1 ? destinations[0] : null,
      };
      this.noticeText = null;
      return true;
    }

    // Com alvo escolhido, clicar numa casa destacada escolhe o destino.
    const target = targeting.targetUid === null ? null : this.findUnit(targeting.targetUid);
    if (target && isAlive(target)) {
      const valid = ambushDestinations(hero, target, this.combatContext()).some((destination) =>
        positionsEqual(destination, cell),
      );
      if (valid) {
        this.targetingState = { ...targeting, destination: { col: cell.col, row: cell.row } };
        this.noticeText = null;
        return true;
      }
      this.setNotice('Escolha uma das casas destacadas, diagonais ao alvo.');
      return false;
    }

    this.setNotice('Escolha um monstro vivo como alvo.');
    return false;
  }

  private choosePierceCell(hero: Unit, targeting: PiercingShotTargeting, cell: Position): boolean {
    const dCol = cell.col - hero.position.col;
    const dRow = cell.row - hero.position.row;
    // Precisa estar na mesma linha OU na mesma coluna (e não ser a casa do próprio arqueiro).
    const sameLine = (dCol === 0) !== (dRow === 0);
    if (!sameLine) {
      this.setNotice('Escolha uma casa na mesma linha ou coluna do Arqueiro (sem diagonais).');
      return false;
    }
    this.targetingState = {
      ...targeting,
      direction: { col: Math.sign(dCol), row: Math.sign(dRow) },
    };
    this.noticeText = null;
    return true;
  }

  private chooseFireballCell(targeting: FireballTargeting, cell: Position): boolean {
    if (!isInsideBoard(cell)) {
      this.setNotice('Escolha uma casa dentro do tabuleiro.');
      return false;
    }
    this.targetingState = { ...targeting, center: { col: cell.col, row: cell.row } };
    this.noticeText = null;
    return true;
  }

  private chooseExuraCell(targeting: ExuraTargeting, cell: Position): boolean {
    const clicked = this.getUnitAt(cell);
    if (!clicked || clicked.definition.team !== 'hero') {
      this.setNotice('Escolha um herói vivo para curar (monstros e casas vazias não valem).');
      return false;
    }
    const healer = this.findUnit(targeting.heroUid);
    if (!healer || healAmount(clicked, ABILITY_BALANCE.exuraHealRatio, healer) === 0) {
      this.setNotice(`${clicked.definition.name} já está com PV máximo.`, true);
      return false;
    }
    this.targetingState = { ...targeting, targetUid: clicked.uid };
    this.noticeText = null;
    return true;
  }

  private rejectConfirm(message: string, log = false): void {
    this.setNotice(message, log);
    this.emit('targeting');
  }

  private setNotice(message: string, log = false): void {
    this.noticeText = message;
    if (log) this.addLog(message, 'info');
  }

  // ---------- Internos: gerais ----------

  private findUnit(uid: string): Unit | null {
    return this.allUnits.find((unit) => unit.uid === uid) ?? null;
  }

  private findMoves(unit: Unit): ReachableCell[] {
    const size = sizeOf(unit.definition);
    // Casa bloqueada para esta unidade: obstáculo ou outra unidade (o próprio corpo é livre, pois
    // uma entidade grande pode andar para uma posição que sobrepõe a anterior).
    const isCellBlocked = (cell: Position): boolean =>
      this.isObstacle(cell) || this.units.some((other) => other !== unit && occupies(other, cell));
    return computeReachable(
      unit.position,
      unit.definition.movement,
      // A posição só vale se a área inteira couber no tabuleiro e estiver livre.
      (anchor) => !footprintFits(anchor, size) || footprintCells(anchor, size).some(isCellBlocked),
      getMovementDirections(unit.definition),
    );
  }

  private combatContext(): AttackContext {
    return { units: this.units, obstacles: this.obstacleList };
  }

  private resetEffects(): void {
    this.damageEvents = [];
    this.healEvents = [];
    this.effect = null;
  }

  private setup(): void {
    this.applyBattle(this.createBattle(), true);
  }

  /** `firstBattle`: começo de uma batalha/campanha (limpa o log); senão, continua o log. */
  private applyBattle(battle: BattleSetup, firstBattle: boolean): void {
    const problems = findPlacementProblems(battle.units, battle.obstacles);
    if (problems.length > 0) {
      throw new Error(`Posicionamento inválido no encontro:\n${problems.join('\n')}`);
    }
    this.allUnits = battle.units;
    this.obstacleList = battle.obstacles;
    this.currentTurn = 1;
    this.currentPhase = 'player';
    this.currentOutcome = 'ongoing';
    this.selectedUnitUid = null;
    this.targetingState = null;
    this.noticeText = null;
    this.pendingActors = [];
    this.lastActorUid = null;
    // Nada anunciado antes sobrevive a um reinício ou à troca de andar.
    this.intents = [];
    this.intentCounter = 0;
    this.resetEffects();
    if (firstBattle) this.logEntries = [];
    if (battle.title) this.addLog(battle.title, 'floor');
    this.addLog('Turno 1 começou. Sua vez.', 'info');
    if (firstBattle) {
      this.addLog(
        'Mova um herói, use uma habilidade ou passe a vez; depois os heróis atacam e os monstros respondem.',
        'info',
      );
    }
    // Chefes com ataques telegrafados já começam o encontro anunciando o primeiro golpe.
    for (const monster of this.monsters) this.tryAnnounceTelegraph(monster);
  }

  private addLog(message: string, kind: LogKind = 'info'): void {
    this.logEntries.push({ turn: this.currentTurn, message, kind });
    if (this.logEntries.length > MAX_LOG_ENTRIES) {
      this.logEntries.shift();
    }
  }

  private emit(event: GameEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}