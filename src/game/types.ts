export type Team = 'hero' | 'monster';

export interface Position {
  col: number;
  row: number;
}

/**
 * Quais direções um ataque cobre:
 * - 'orthogonal': cima, direita, baixo, esquerda
 * - 'diagonal': as quatro diagonais
 * - 'facing': somente a direção em que a unidade está virada
 */
export type AttackDirections = 'orthogonal' | 'diagonal' | 'facing';

/**
 * - 'line' (padrão): em cada direção, acerta só o primeiro inimigo dentro do alcance.
 * - 'cross': cruz de 5 casas. O centro fica a `range` casas de distância, na direção do ataque,
 *   e os outros quatro quadrados são os vizinhos ortogonais do centro.
 */
export type AttackShape = 'line' | 'cross';

export interface AttackDefinition {
  readonly shape?: AttackShape;
  readonly directions: AttackDirections;
  /** Alcance em casas (para 'cross', a distância até o centro da cruz). */
  readonly range: number;
}

/** Formato da área de um ataque telegrafado (ver core/telegraph.ts). */
export type TelegraphPatternId = 'row' | 'column' | 'cross';

/** Como o chefe escolhe o herói em torno do qual a área é montada. */
export type TelegraphTargeting = 'nearest-hero' | 'lowest-hp-hero';

/** Configuração de UM ataque telegrafado de um chefe. Só dados. */
export interface TelegraphedAttack {
  readonly id: string;
  readonly name: string;
  readonly pattern: TelegraphPatternId;
  readonly targeting: TelegraphTargeting;
  readonly damage: number;
  /** Se true, também atinge aliados do chefe (nunca o próprio chefe). Padrão: só os heróis. */
  readonly friendlyFire?: boolean;
}

/** Ataques telegrafados de um chefe: usados em rodízio, com uma pausa entre eles. */
export interface TelegraphConfig {
  readonly attacks: readonly TelegraphedAttack[];
  /**
   * Turnos de pausa depois de um golpe antes de anunciar o próximo: 0 anuncia todo turno,
   * 1 deixa um turno livre entre os golpes.
   */
  readonly cooldownTurns: number;
}

/** Tamanho de uma entidade em casas. Só 1×1 (padrão) e 2×2 são suportados (ver data/sizes.ts). */
export interface UnitSize {
  readonly width: number;
  readonly height: number;
}

/** Em que direções a unidade pode dar cada passo de movimentação. */
export type MovementDirections = 'orthogonal' | 'all';

/** Tipo de encontro. Também classifica os monstros (`rank`) para o visual e as regras de andar. */
export type EncounterType = 'normal' | 'mini-boss' | 'boss';

export type AbilityId = 'stomp' | 'ambush' | 'piercing-shot' | 'fireball' | 'exura';

/** Que tipo de escolha a habilidade exige do jogador antes de ser usada. */
export type AbilityTarget = 'none' | 'monster' | 'direction' | 'cell' | 'hero';

export interface AbilityDefinition {
  readonly id: AbilityId;
  readonly name: string;
  /** Descrição curta exibida no painel. */
  readonly description: string;
  readonly target: AbilityTarget;
}

/** Dados estáticos de um tipo de unidade. */
export interface UnitDefinition {
  readonly id: string;
  readonly name: string;
  readonly team: Team;
  readonly symbol: string;
  readonly color: number;
  readonly maxHp: number;
  readonly damage: number;
  /**
   * Distância de MOVIMENTO: quantos passos a unidade anda por ação.
   * Não tem relação com o alcance do ataque (`attack.range`).
   */
  readonly movement: number;
  /** Direções de cada passo. Padrão: 'orthogonal'. Os heróis usam 'all' (inclui diagonais). */
  readonly movementDirections?: MovementDirections;
  readonly attack: AttackDefinition;
  /** Habilidade especial (uma vez por encontro). Monstros não têm. */
  readonly ability?: AbilityDefinition;
  /** Categoria do monstro: comum (padrão), mini-chefe ou chefe principal. Só muda o visual. */
  readonly rank?: EncounterType;
  /** Ataques telegrafados (anunciados um turno antes). Só os chefes têm. */
  readonly telegraph?: TelegraphConfig;
  /**
   * Tamanho em casas. Padrão: 1×1. Com 2×2, `Unit.position` é a casa SUPERIOR ESQUERDA da área
   * ocupada (as outras três são à direita e abaixo). Uma entidade grande é UMA unidade, nunca
   * quatro cópias.
   */
  readonly size?: UnitSize;
}

/** Instância de uma unidade em batalha. Uma unidade com hp <= 0 está derrotada. */
export interface Unit {
  readonly uid: string;
  readonly definition: UnitDefinition;
  hp: number;
  maxHp: number;
  damage: number;
  progression?: HeroProgression;
  equipment?: Partial<Record<EquipmentSlot, string>>;
  /** Casa de referência (superior esquerda da área ocupada; a única casa se for 1×1). */
  position: Position;
  /** Direção em que a unidade está virada (vetor unitário; pode ser diagonal). */
  facing: Position;
  /** true depois que a habilidade especial foi usada neste combate. */
  abilityUsed: boolean;
  /** Atordoada: perde a próxima ação na fase dos monstros e então se recupera. */
  stunned: boolean;
  /** Estado do rodízio de ataques telegrafados (só existe se a definição tiver `telegraph`). */
  telegraph?: { cooldown: number; nextAttack: number };
}

export type LogKind =
  | 'info'
  | 'hero'
  | 'monster'
  | 'death'
  | 'result'
  | 'ability'
  | 'heal'
  | 'floor'
  | 'telegraph';

export interface LogEntry {
  turn: number;
  message: string;
  kind: LogKind;
}

export type BattleOutcome = 'ongoing' | 'victory' | 'defeat';

/** Registro de um golpe, usado pela cena para exibir o número de dano. */
export interface DamageEvent {
  targetUid: string;
  amount: number;
  /** Casa onde o alvo estava quando foi atingido. */
  position: Position;
  killed: boolean;
}

/** Registro de uma cura (quantidade efetivamente restaurada). */
export interface HealEvent {
  targetUid: string;
  amount: number;
  position: Position;
}

/** Casas que a cena deve destacar por um instante depois de uma habilidade ou de um golpe de chefe. */
export interface AbilityEffect {
  id: AbilityId | 'telegraph';
  cells: Position[];
}

export type TelegraphStatus = 'pending' | 'resolved' | 'cancelled';

/**
 * Intenção de ataque anunciada por um chefe. Os campos são imutáveis: a área (`cells`) é calculada
 * UMA vez, no anúncio, e congelada; só `status` muda (pending -> resolved ou cancelled, e nunca
 * volta a pending, então o golpe acontece no máximo uma vez).
 */
export interface TelegraphIntent {
  readonly id: string;
  readonly bossUid: string;
  readonly bossName: string;
  readonly attackId: string;
  readonly attackName: string;
  readonly pattern: TelegraphPatternId;
  /** Herói em torno do qual a área foi montada, no momento do anúncio. */
  readonly targetUid: string;
  readonly cells: readonly Position[];
  readonly damage: number;
  readonly friendlyFire: boolean;
  readonly announcedTurn: number;
  status: TelegraphStatus;
}

// ---------- Seleção de alvo das habilidades (estado entre "Usar" e "Confirmar") ----------

export interface AmbushTargeting {
  id: 'ambush';
  heroUid: string;
  targetUid: string | null;
  destination: Position | null;
}

export interface PiercingShotTargeting {
  id: 'piercing-shot';
  heroUid: string;
  /** Direção ortogonal escolhida (vetor unitário) ou null se ainda não escolhida. */
  direction: Position | null;
}

export interface FireballTargeting {
  id: 'fireball';
  heroUid: string;
  center: Position | null;
}

export interface ExuraTargeting {
  id: 'exura';
  heroUid: string;
  targetUid: string | null;
}

export type AbilityTargeting =
  | AmbushTargeting
  | PiercingShotTargeting
  | FireballTargeting
  | ExuraTargeting;

/** O que a cena deve desenhar enquanto o jogador escolhe alvos. */
export interface AbilityPreview {
  /** Casas que o jogador pode clicar agora (realce suave). */
  selectable: Position[];
  /** Casas que serão afetadas pelo efeito escolhido (realce forte). */
  effect: Position[];
  /** Casas já escolhidas pelo jogador (contorno). */
  chosen: Position[];
}

/**
 * Fase do turno:
 * - 'player': o jogador escolhe e move um herói, usa uma habilidade ou passa a vez;
 * - 'heroes': os heróis atacam (interações travadas);
 * - 'telegraphs': os golpes anunciados pelos chefes são resolvidos (interações travadas);
 * - 'monsters': os monstros andam e atacam, e os chefes anunciam o próximo golpe (travadas);
 * - 'over': vitória ou derrota.
 */
export type BattlePhase = 'player' | 'heroes' | 'telegraphs' | 'monsters' | 'over';

/**
 * - 'select': a seleção mudou;
 * - 'targeting': a escolha de alvo de uma habilidade mudou (início, prévia, cancelamento, aviso);
 * - 'resolving': o jogador agiu (moveu ou usou habilidade) e a resolução do turno começou;
 * - 'step': um herói ou monstro acabou de agir durante a resolução;
 * - 'turn': a resolução terminou e começou o próximo turno do jogador;
 * - 'over': a resolução terminou em vitória ou derrota;
 * - 'encounter': um novo encontro foi carregado (próximo andar da campanha);
 * - 'reset': a batalha foi reiniciada.
 */
export type GameEvent =
  | 'select'
  | 'targeting'
  | 'resolving'
  | 'step'
  | 'turn'
  | 'over'
  | 'encounter'
  | 'reset';

/** Progressão permanente individual de um herói. XP só é concedido por golpe fatal. */
export interface HeroProgression {
  level: number;
  xp: number;
  unspentAttributePoints: number;
  attributes: { strength: number; vitality: number; defense: number };
}
export type EquipmentSlot = 'weapon' | 'armor' | 'accessory';
export interface ItemDefinition {
  readonly id: string;
  readonly name: string;
  readonly slot: EquipmentSlot;
  readonly minLevel?: number;
  readonly bonuses: Partial<{ strength: number; vitality: number; defense: number }>;
}
export interface InventoryItem {
  readonly instanceId: string;
  readonly definitionId: string;
}
