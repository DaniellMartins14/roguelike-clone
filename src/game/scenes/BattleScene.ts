import Phaser from 'phaser';

// Sprites opcionais: qualquer PNG colocado em assets/sprites pode ser carregado sem import manual.
const optionalMonsterSprites = import.meta.glob('../../assets/sprites/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

// Fundos opcionais por faixa: colocar faixa-1.png e faixa-2.png em assets/backgrounds.
const optionalRegionBackgrounds = import.meta.glob('../../assets/backgrounds/*.{png,jpg,jpeg,jfif}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
import warriorSprite from '../../assets/sprites/warrior.png';
import assassinSprite from '../../assets/sprites/assassin.png';
import archerSprite from '../../assets/sprites/archer.png';
import mageSprite from '../../assets/sprites/mage.png';
import clericSprite from '../../assets/sprites/cleric.png';
import cultistSprite from '../../assets/sprites/cultist.png';
import insaneSprite from '../../assets/sprites/insane.png';
import acolyteSprite from '../../assets/sprites/acolyte.png';
import deformedDevoteeSprite from '../../assets/sprites/deformed-devotee.png';
import shadowCreatureSprite from '../../assets/sprites/shadow-creature.png';
import abyssalScaledSprite from '../../assets/sprites/abyssal-scaled.png';
import scaledGuardianSprite from '../../assets/sprites/scaled-guardian.png';
import rlyehHorrorSprite from '../../assets/sprites/rlyeh-horror.png';
import abyssIdolSprite from '../../assets/sprites/abyss-idol.png';
import {
  BOARD_COLS,
  BOARD_HEIGHT,
  BOARD_MARGIN,
  BOARD_ROWS,
  BOARD_WIDTH,
  COLORS,
  GAME_HEIGHT,
  GAME_WIDTH,
  SYMBOL_FONT,
  TILE_SIZE,
  cellToPixel,
  footprintCenterPixel,
} from '../config';
import { positionsEqual, sizeOf, unitCells } from '../core/board';
import { SIZE_1X1 } from '../data/sizes';
import type { Campaign, CampaignStatus } from '../core/Campaign';
import type { GameState } from '../core/GameState';
import type {
  AbilityEffect,
  AbilityPreview,
  DamageEvent,
  GameEvent,
  HealEvent,
  Position,
  Unit,
} from '../types';

const OBSTACLE_COLOR = 0x475569;
const OBSTACLE_BORDER = 0x94a3b8;

/** Cores dos destaques: casas que podem ser escolhidas, área afetada e escolha atual. */
const PREVIEW_SELECTABLE = 0x38bdf8;
const PREVIEW_EFFECT = 0xf97316;
const PREVIEW_CHOSEN = 0xfacc15;

/** Cor do clarão que cada habilidade deixa na área afetada. */
const EFFECT_COLORS: Record<AbilityEffect['id'], number> = {
  stomp: 0xfacc15,
  ambush: 0xa78bfa,
  'piercing-shot': 0xf97316,
  fireball: 0xef4444,
  exura: 0x4ade80,
  telegraph: 0xef4444,
};

/** Casas ameaçadas por um golpe anunciado de chefe. */
const THREAT_COLOR = 0xef4444;

/** Pausa entre as ações da resolução (heróis atacando, monstros agindo), para dar tempo de ver. */
const STEP_DELAY_MS = 420;

/** Telas de fim de andar/campanha desenhadas sobre o tabuleiro. */
const END_SCREENS: Record<
  Exclude<CampaignStatus, 'fighting'>,
  { title: string; color: string; subtitle: string }
> = {
  'floor-cleared': {
    title: 'ANDAR CONCLUÍDO!',
    color: '#4ade80',
    subtitle: 'Clique em "Avançar" no painel para descer ao próximo andar.',
  },
  completed: {
    title: 'CAMPANHA CONCLUÍDA!',
    color: '#facc15',
    subtitle: 'O Ídolo do Abismo foi derrotado! Reinicie a campanha no painel para jogar de novo.',
  },
  defeated: {
    title: 'DERROTA',
    color: '#ef4444',
    subtitle: 'Todos os heróis caíram. Reinicie a campanha no painel para tentar de novo.',
  },
};

interface UnitView {
  container: Phaser.GameObjects.Container;
  hpBar: Phaser.GameObjects.Graphics;
  /** Posição e largura da barra de vida (variam com o tamanho da peça: chefes são maiores). */
  barY: number;
  barWidth: number;
  /** Triângulo que indica a direção em que a unidade está virada (só para quem ataca "na direção virada"). */
  facingMarker: Phaser.GameObjects.Graphics | null;
  /** "Zz" exibido enquanto a unidade está atordoada. */
  stunMarker: Phaser.GameObjects.Text;
}

export class BattleScene extends Phaser.Scene {
  private readonly campaign: Campaign;
  private readonly gameState: GameState;
  private readonly unitViews = new Map<string, UnitView>();
  private obstacleObjects: Phaser.GameObjects.Rectangle[] = [];
  private boardTiles: { tile: Phaser.GameObjects.Rectangle; col: number; row: number }[] = [];
  private boardBackground: Phaser.GameObjects.Image | null = null;
  private overlay!: Phaser.GameObjects.Graphics;
  private outcomeOverlay!: Phaser.GameObjects.Container;
  private outcomeTitle!: Phaser.GameObjects.Text;
  private outcomeSubtitle!: Phaser.GameObjects.Text;
  /** Aviso fixo abaixo do tabuleiro enquanto houver golpe de chefe anunciado. */
  private threatText!: Phaser.GameObjects.Text;
  private hoverCell: Position | null = null;
  private unsubscribe: (() => void) | null = null;
  /** Temporizador do próximo passo da resolução do turno (null quando não há resolução). */
  private stepTimer: Phaser.Time.TimerEvent | null = null;
  private disposed = false;

  constructor(campaign: Campaign) {
    super({ key: 'BattleScene' });
    this.campaign = campaign;
    this.gameState = campaign.battle;
  }

  preload(): void {
    this.load.image('hero-warrior', warriorSprite);
    this.load.image('hero-assassin', assassinSprite);
    this.load.image('hero-archer', archerSprite);
    this.load.image('hero-mage', mageSprite);
    this.load.image('hero-cleric', clericSprite);
    this.load.image('monster-cultist', cultistSprite);
    this.load.image('monster-insane', insaneSprite);
    this.load.image('monster-acolyte', acolyteSprite);
    this.load.image('monster-deformed-devotee', deformedDevoteeSprite);
    this.load.image('monster-shadow-creature', shadowCreatureSprite);
    this.load.image('monster-abyssal-scaled', abyssalScaledSprite);
    this.load.image('monster-scaled-guardian', scaledGuardianSprite);
    this.load.image('monster-rlyeh-horror', rlyehHorrorSprite);
    this.load.image('monster-abyss-idol', abyssIdolSprite);
    for (const [path, url] of Object.entries(optionalMonsterSprites)) {
      const filename = path.split('/').pop()?.replace(/\.png$/i, '');
      if (filename) this.load.image(`monster-${filename}`, url);
    }
    for (const [path, url] of Object.entries(optionalRegionBackgrounds)) {
      const filename = path.split('/').pop()?.replace(/\.(png|jpe?g|jfif)$/i, '').toLowerCase();
      if (filename === 'faixa-1' || filename === 'faixa-2') {
        this.load.image(`background-${filename}`, url);
      }
    }
  }

  create(): void {
    // Sincroniza a equipe selecionada antes de criar as peças e antes de assinar eventos.
    // Assim, a cena nova já nasce com o encontro correto e a cena anterior não recebe eventos.
    this.campaign.syncActiveEncounter();
    this.drawBoard();
    this.drawObstacles();

    // Camada de destaques (movimentos válidos, seleção, hover) abaixo das peças.
    this.overlay = this.add.graphics().setDepth(1);

    this.buildUnitViews();

    this.createOutcomeOverlay();
    this.createThreatText();

    this.disposed = false;
    this.unsubscribe = this.gameState.subscribe((event) => {
      // Ignore notifications delivered while Phaser is shutting this scene down.
      if (this.disposed || !this.sys.isActive() || !this.outcomeTitle?.active) return;
      this.onStateChange(event);
    });
    // ESC cancela a escolha de alvo de uma habilidade.
    this.input.keyboard?.on('keydown-ESC', this.handleEscape, this);

    const disposeScene = () => {
      this.disposed = true;
      this.input.keyboard?.off('keydown-ESC', this.handleEscape, this);
      this.cancelStep();
      this.unsubscribe?.();
      this.unsubscribe = null;
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, disposeScene);
    this.events.once(Phaser.Scenes.Events.DESTROY, disposeScene);

    this.refresh(false);
  }

  // ---------- Tabuleiro ----------

  private drawBoard(): void {
    this.refreshBoardBackground();
    // Moldura sem preenchimento: não deve criar um retângulo opaco atrás das casas.
    const frame = this.add.rectangle(
      BOARD_MARGIN + BOARD_WIDTH / 2,
      BOARD_MARGIN + BOARD_HEIGHT / 2,
      BOARD_WIDTH + 8,
      BOARD_HEIGHT + 8,
      0x000000,
      0,
    );
    frame.setStrokeStyle(2, COLORS.frame, 0.9);

    const labelStyle = {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '16px',
      color: '#94a3b8',
      resolution: 2,
    };

    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const cell: Position = { col, row };
        const { x, y } = cellToPixel(cell);
        const regionTwo = this.campaign.floorNumber >= 11 && this.campaign.floorNumber <= 20;
        const color = regionTwo
          ? ((col + row) % 2 === 0 ? 0x171717 : 0x7f1d1d)
          : ((col + row) % 2 === 0 ? COLORS.tileLight : COLORS.tileDark);

        const tile = this.add.rectangle(x, y, TILE_SIZE, TILE_SIZE, color, 0.3);
        this.boardTiles.push({ tile, col, row });
        tile.setStrokeStyle(1, COLORS.tileBorder);
        tile.setInteractive({ useHandCursor: true });
        tile.on('pointerdown', () => this.handleCellClick(cell));
        tile.on('pointerover', () => {
          this.hoverCell = cell;
          this.drawOverlay();
        });
        tile.on('pointerout', () => {
          if (this.hoverCell && positionsEqual(this.hoverCell, cell)) {
            this.hoverCell = null;
            this.drawOverlay();
          }
        });
      }
    }

    // Coordenadas: colunas A-F em cima, linhas 1-6 à esquerda.
    for (let col = 0; col < BOARD_COLS; col++) {
      const { x } = cellToPixel({ col, row: 0 });
      this.add.text(x, BOARD_MARGIN / 2, String.fromCharCode(65 + col), labelStyle).setOrigin(0.5);
    }
    for (let row = 0; row < BOARD_ROWS; row++) {
      const { y } = cellToPixel({ col: 0, row });
      this.add.text(BOARD_MARGIN / 2, y, String(row + 1), labelStyle).setOrigin(0.5);
    }
  }

  private refreshBoardBackground(): void {
    const floor = this.campaign.floorNumber;
    const filename = floor >= 1 && floor <= 10 ? 'faixa-1' : floor >= 11 && floor <= 20 ? 'faixa-2' : null;
    const texture = filename && this.textures.exists(`background-${filename}`) ? `background-${filename}` : null;
    if (this.boardBackground) {
      this.boardBackground.destroy();
      this.boardBackground = null;
    }
    if (!texture) return;
    // O fundo cobre toda a área do jogo; o tabuleiro fica em uma camada superior.
    this.boardBackground = this.add.image(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      texture,
    );
    // "Cover": preserva a proporção da arte e recorta o excedente, sem deformar.
    const source = this.textures.get(texture).getSourceImage() as HTMLImageElement;
    const scale = Math.max(GAME_WIDTH / source.width, GAME_HEIGHT / source.height);
    this.boardBackground.setScale(scale);
    this.boardBackground.setDepth(-1);
  }

  private refreshBoardPalette(): void {
    const regionTwo = this.campaign.floorNumber >= 11 && this.campaign.floorNumber <= 20;
    for (const { tile, col, row } of this.boardTiles) {
      const color = regionTwo
        ? ((col + row) % 2 === 0 ? 0x090909 : 0x8b0000)
        : ((col + row) % 2 === 0 ? COLORS.tileLight : COLORS.tileDark);
      tile.setFillStyle(color, 0.3);
    }
  }

  /** Obstáculos da batalha atual (a lista é vazia na primeira batalha). */
  private drawObstacles(): void {
    for (const cell of this.gameState.obstacles) {
      const { x, y } = cellToPixel(cell);
      const obstacle = this.add
        .rectangle(x, y, TILE_SIZE - 16, TILE_SIZE - 16, OBSTACLE_COLOR)
        .setStrokeStyle(3, OBSTACLE_BORDER)
        .setDepth(0.5); // acima das casas, abaixo dos destaques (1) e das peças (2)
      this.obstacleObjects.push(obstacle);
    }
  }

  /** Uma peça para cada unidade, inclusive as que cairão em combate (só ficam ocultas). */
  private buildUnitViews(): void {
    for (const unit of this.gameState.roster) {
      this.unitViews.set(unit.uid, this.createUnitView(unit));
    }
  }

  /**
   * Novo encontro (próximo andar) ou reinício da campanha: troca peças e obstáculos pelos do
   * encontro atual. Cada peça é destruída uma vez e recriada, então nada fica duplicado.
   */
  private rebuildUnits(): void {
    this.cancelStep();
    for (const view of this.unitViews.values()) {
      this.tweens.killTweensOf(view.container);
      view.container.destroy();
    }
    this.unitViews.clear();

    for (const obstacle of this.obstacleObjects) obstacle.destroy();
    this.obstacleObjects = [];
    this.refreshBoardBackground();
    this.refreshBoardPalette();

    this.drawObstacles();
    this.buildUnitViews();
    this.refresh(false);
  }

  // ---------- Input ----------

  private readonly handleEscape = (): void => {
    this.gameState.cancelAbility();
  };

  private handleCellClick(cell: Position): void {
    // Só a vez do jogador aceita cliques: durante a resolução do turno e depois da
    // vitória ou derrota o tabuleiro fica travado.
    if (this.gameState.phase !== 'player') return;

    // Escolhendo alvo de uma habilidade: o clique escolhe (a prévia aparece; confirmar é no painel).
    if (this.gameState.targeting) {
      this.gameState.chooseAbilityCell(cell);
      return;
    }

    const unit = this.gameState.getUnitAt(cell);

    if (unit) {
      if (unit.definition.team === 'hero') {
        this.gameState.toggleSelection(unit.uid);
      } else {
        this.gameState.clearSelection();
      }
      return;
    }

    if (this.gameState.selectedUnit && this.gameState.moveSelectedUnit(cell)) {
      return;
    }

    this.gameState.clearSelection();
  }

  private onStateChange(event: GameEvent): void {
    switch (event) {
      case 'select':
      case 'targeting':
        this.refresh(false);
        break;
      case 'reset':
      case 'encounter':
        this.rebuildUnits();
        break;
      case 'resolving':
        // O jogador acabou de agir (moveu ou usou habilidade): mostra o resultado e agenda o
        // primeiro passo. Os efeitos da habilidade já estão em lastDamage/lastHealing/lastEffect.
        this.refresh(true);
        this.playEffects();
        this.scheduleStep();
        break;
      case 'step':
        this.refresh(true);
        this.playEffects();
        this.pulseActor();
        break;
      case 'turn':
      case 'over':
        this.refresh(true);
        break;
    }
  }

  // ---------- Resolução do turno ----------

  /** Agenda o próximo passo; enquanto houver resolução, cada passo agenda o seguinte. */
  private scheduleStep(): void {
    this.cancelStep();
    this.stepTimer = this.time.delayedCall(STEP_DELAY_MS, () => {
      this.stepTimer = null;
      this.gameState.step();
      if (this.gameState.isResolving) {
        this.scheduleStep();
      }
    });
  }

  private cancelStep(): void {
    this.stepTimer?.remove(false);
    this.stepTimer = null;
  }

  /** Mostra números de dano e cura e o clarão da área da habilidade, se houver. */
  private playEffects(): void {
    this.showDamageEvents(this.gameState.lastDamage);
    this.showHealEvents(this.gameState.lastHealing);
    const effect = this.gameState.lastEffect;
    if (effect) this.flashArea(effect);
  }

  /** Destaca quem acabou de agir com um pequeno "pulso" na peça. */
  private pulseActor(): void {
    const actor = this.gameState.lastActor;
    if (!actor) return;
    const view = this.unitViews.get(actor.uid);
    if (!view) return;
    this.tweens.add({ targets: view.container, scale: 1.18, duration: 120, yoyo: true });
  }

  // ---------- Peças ----------

  private createUnitView(unit: Unit): UnitView {
    const def = unit.definition;
    const container = this.add.container(0, 0).setDepth(2);

    // Chefes continuam maiores; os heróis usam sprites PNG.
    // Entidade 2×2: o corpo ocupa visualmente as 4 casas (quadrado grande com anel ciano).
    const rank = def.team === 'monster' ? (def.rank ?? 'normal') : 'normal';
    const span = sizeOf(def).width;
    const large = span > 1;
    const size = large ? span * TILE_SIZE - 20 : rank === 'boss' ? 78 : rank === 'mini-boss' ? 72 : 66;
    const half = size / 2;
    const children: Phaser.GameObjects.GameObject[] = [];

    if (def.team === 'hero') {
      const heroTextures: Record<string, string> = {
        warrior: 'hero-warrior',
        assassin: 'hero-assassin',
        archer: 'hero-archer',
        mage: 'hero-mage',
        cleric: 'hero-cleric',
      };
      const texture = heroTextures[def.id];
      if (texture) {
        // O PNG é 32x32; exibimos ampliado para 64x64.
        children.push(this.add.image(0, -4, texture).setDisplaySize(64 * span, 64 * span));
      }
    } else {
      const monsterTextures: Record<string, string> = {
        cultist: 'monster-cultist',
        insane: 'monster-insane',
        acolyte: 'monster-acolyte',
        'deformed-devotee': 'monster-deformed-devotee',
        'shadow-creature': 'monster-shadow-creature',
        'abyssal-scaled': 'monster-abyssal-scaled',
        'scaled-guardian': 'monster-scaled-guardian',
        'rlyeh-horror': 'monster-rlyeh-horror',
        'abyss-idol': 'monster-abyss-idol',
        'vampiric-thrall': 'monster-vampiric-thrall',
        'blood-bat': 'monster-blood-bat',
        'night-hunter': 'monster-night-hunter',
        'blood-knight': 'monster-blood-knight',
        werewolf: 'monster-werewolf',
        winter: 'monster-inverno',
        'the-seventh': 'monster-o-setimo',
      };
      const texture = monsterTextures[def.id];
      if (texture && this.textures.exists(texture)) {
        const spriteSize = large ? size : rank === 'mini-boss' ? 72 : rank === 'boss' ? 78 : 64;
        children.push(this.add.image(0, -4, texture).setDisplaySize(spriteSize, spriteSize));
        if (rank !== 'normal') {
          const border = this.add.graphics();
          const borderColor = rank === 'boss' ? 0xc084fc : 0xfacc15;
          border.lineStyle(rank === 'boss' ? 5 : 4, borderColor, 0.95);
          border.strokeRoundedRect(-half, -4 - half, size, size, 12);
          if (large) {
            border.lineStyle(2, 0x67e8f9, 0.9);
            border.strokeRoundedRect(-half + 7, -4 - half + 7, size - 14, size - 14, 10);
          }
          children.push(border);
        }
      } else {
        // Fallback para monstros antigos que ainda não possuem sprite.
        const body = this.add.graphics();
        const border = rank === 'boss' ? 0xc084fc : rank === 'mini-boss' ? 0xfacc15 : COLORS.monsterBorder;
        body.fillStyle(def.color, 1).fillRoundedRect(-half, -4 - half, size, size, 12);
        body.lineStyle(rank === 'normal' ? 3 : 5, border, 1).strokeRoundedRect(-half, -4 - half, size, size, 12);
        if (rank === 'boss') body.lineStyle(2, 0xc084fc, 0.5).strokeRoundedRect(-half - 4, -4 - half - 4, size + 8, size + 8, 16);
        if (large) body.lineStyle(3, 0x67e8f9, 0.9).strokeRoundedRect(-half + 8, -4 - half + 8, size - 16, size - 16, 14);
        const symbol = this.add.text(0, -4, def.symbol, {
          fontFamily: SYMBOL_FONT,
          fontSize: `${large ? 84 : rank === 'boss' ? 46 : rank === 'mini-boss' ? 42 : 38}px`,
          color: '#ffffff',
          resolution: 2,
        }).setOrigin(0.5);
        children.push(body, symbol);
      }
    }    const hpBar = this.add.graphics();
    const stunMarker = this.add
      .text(half - 7, -half - 7, 'Zz', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '22px',
        fontStyle: 'bold',
        color: '#facc15',
        stroke: '#000000',
        strokeThickness: 4,
        resolution: 2,
      })
      .setOrigin(0.5)
      .setVisible(false);

    let facingMarker: Phaser.GameObjects.Graphics | null = null;
    if (def.attack.directions === 'facing') {
      // Triângulo apontando para a direita; a rotação o aponta para onde a unidade olha.
      facingMarker = this.add.graphics();
      facingMarker.fillStyle(0xffffff, 1).fillTriangle(28, -7, 40, 0, 28, 7);
      facingMarker.setPosition(0, -4);
      children.push(facingMarker);
    }

    children.push(hpBar, stunMarker);
    container.add(children);
    return {
      container,
      hpBar,
      barY: half + 3,
      barWidth: 60 + (size - 66),
      facingMarker,
      stunMarker,
    };
  }

  private drawHpBar(view: UnitView, unit: Unit): void {
    const width = view.barWidth;
    const height = 6;
    const x = -width / 2;
    const y = view.barY;
    const ratio = Math.max(0, Math.min(1, unit.hp / unit.maxHp));
    const color = ratio > 0.5 ? COLORS.hpHigh : ratio > 0.25 ? COLORS.hpMid : COLORS.hpLow;

    view.hpBar.clear();
    view.hpBar.fillStyle(0x000000, 0.6).fillRect(x, y, width, height);
    view.hpBar.fillStyle(color, 1).fillRect(x, y, width * ratio, height);
  }

  private updateFacing(view: UnitView, unit: Unit): void {
    if (!view.facingMarker) return;
    view.facingMarker.setRotation(Math.atan2(unit.facing.row, unit.facing.col));
  }

  /** Sincroniza peças, resultado e destaques com o estado atual. */
  private refresh(animate: boolean): void {
    for (const unit of this.gameState.roster) {
      const view = this.unitViews.get(unit.uid);
      if (!view) continue;

      const container = view.container;
      const { x, y } = footprintCenterPixel(unit.position, sizeOf(unit.definition));
      const moved = container.x !== x || container.y !== y;

      this.tweens.killTweensOf(container);
      container.setScale(1);

      if (unit.hp > 0) {
        container.setVisible(true).setAlpha(1);
        if (animate && moved) {
          this.tweens.add({ targets: container, x, y, duration: 180, ease: 'Cubic.Out' });
        } else {
          container.setPosition(x, y);
        }
      } else if (container.visible) {
        // Unidade derrotada: some do tabuleiro (e deixa de ocupar casa no GameState).
        if (animate) {
          this.tweens.add({
            targets: container,
            x,
            y,
            alpha: 0,
            duration: 300,
            delay: 150,
            onComplete: () => {
              container.setVisible(false);
            },
          });
        } else {
          container.setVisible(false);
        }
      }

      this.drawHpBar(view, unit);
      this.updateFacing(view, unit);
      view.stunMarker.setVisible(unit.hp > 0 && unit.stunned);
    }

    this.updateOutcomeOverlay();
    this.updateThreatText();
    this.drawOverlay();
  }

  // ---------- Dano e resultado ----------

  /** Centro (em pixels) do alvo de um golpe/cura: usa o tamanho da unidade atingida. */
  private eventCenter(targetUid: string, anchor: Position): { x: number; y: number } {
    const unit = this.gameState.roster.find((candidate) => candidate.uid === targetUid);
    return footprintCenterPixel(anchor, unit ? sizeOf(unit.definition) : SIZE_1X1);
  }

  private showDamageEvents(events: readonly DamageEvent[]): void {
    events.forEach((event, index) => {
      const { x, y } = this.eventCenter(event.targetUid, event.position);
      this.time.delayedCall(index * 140, () => this.spawnDamageText(x, y, event.amount));
    });
  }

  private showHealEvents(events: readonly HealEvent[]): void {
    events.forEach((event, index) => {
      const { x, y } = this.eventCenter(event.targetUid, event.position);
      this.time.delayedCall(index * 140, () => this.spawnFloatingText(x, y, `+${event.amount}`, '#bbf7d0', '#14532d'));
    });
  }

  /** Clarão colorido sobre a área afetada pela habilidade, que some em instantes. */
  private flashArea(effect: AbilityEffect): void {
    const flash = this.add.graphics().setDepth(4);
    flash.fillStyle(EFFECT_COLORS[effect.id], 0.6);
    for (const cell of effect.cells) {
      const { x, y } = cellToPixel(cell);
      flash.fillRect(x - TILE_SIZE / 2 + 2, y - TILE_SIZE / 2 + 2, TILE_SIZE - 4, TILE_SIZE - 4);
    }
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 700,
      onComplete: () => {
        flash.destroy();
      },
    });
  }

  private spawnDamageText(x: number, y: number, amount: number): void {
    this.spawnFloatingText(x, y, `-${amount}`, '#fecaca', '#7f1d1d');
  }

  private spawnFloatingText(x: number, y: number, label: string, color: string, stroke: string): void {
    const text = this.add
      .text(x, y - 20, label, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '28px',
        fontStyle: 'bold',
        color,
        stroke,
        strokeThickness: 5,
        resolution: 2,
      })
      .setOrigin(0.5)
      .setDepth(5);

    this.tweens.add({
      targets: text,
      y: y - 60,
      alpha: 0,
      duration: 800,
      ease: 'Cubic.Out',
      onComplete: () => {
        text.destroy();
      },
    });
  }

  private createOutcomeOverlay(): void {
    const background = this.add
      .rectangle(0, 0, BOARD_WIDTH, 170, 0x0b1220, 0.9)
      .setStrokeStyle(3, COLORS.selection);

    this.outcomeTitle = this.add
      .text(0, -22, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '64px',
        fontStyle: 'bold',
        color: '#facc15',
        resolution: 2,
      })
      .setOrigin(0.5);

    this.outcomeSubtitle = this.add
      .text(0, 42, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: '#cbd5e1',
        align: 'center',
        wordWrap: { width: BOARD_WIDTH - 40 },
        resolution: 2,
      })
      .setOrigin(0.5, 0);

    this.outcomeOverlay = this.add
      .container(GAME_WIDTH / 2, GAME_HEIGHT / 2, [background, this.outcomeTitle, this.outcomeSubtitle])
      .setDepth(10)
      .setVisible(false);
  }

  /** Mensagem de preparação do golpe, na margem de baixo do tabuleiro (escondida sem ameaça). */
  private createThreatText(): void {
    this.threatText = this.add
      .text(GAME_WIDTH / 2, BOARD_MARGIN + BOARD_HEIGHT + 21, '', {
        fontFamily: SYMBOL_FONT,
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#fca5a5',
        align: 'center',
        wordWrap: { width: BOARD_WIDTH },
        resolution: 2,
      })
      .setOrigin(0.5)
      .setVisible(false);
  }

  private updateThreatText(): void {
    const pending = this.gameState.pendingTelegraphs;
    if (pending.length === 0) {
      this.threatText.setVisible(false);
      return;
    }
    const intent = pending[0];
    this.threatText
      .setText(`⚠ ${intent.bossName} está preparando ${intent.attackName}! As casas em vermelho serão atingidas.`)
      .setVisible(true);
  }

  private updateOutcomeOverlay(): void {
    const status = this.campaign.status;
    if (status === 'fighting') {
      this.outcomeOverlay.setVisible(false);
      return;
    }

    const screen = END_SCREENS[status];
    this.outcomeTitle.setText(screen.title);
    this.outcomeTitle.setColor(screen.color);
    this.outcomeTitle.setFontSize(screen.title.length > 10 ? 40 : 64);
    this.outcomeSubtitle.setText(screen.subtitle);
    this.outcomeOverlay.setVisible(true);
  }

  // ---------- Destaques ----------

  private drawOverlay(): void {
    const g = this.overlay;
    g.clear();

    // Casas ameaçadas por golpes de chefe anunciados: vermelhas, sob as peças e os outros destaques.
    for (const intent of this.gameState.pendingTelegraphs) {
      for (const threatened of intent.cells) {
        const { x, y } = cellToPixel(threatened);
        g.fillStyle(THREAT_COLOR, 0.42);
        g.fillRect(x - TILE_SIZE / 2 + 2, y - TILE_SIZE / 2 + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        g.lineStyle(3, THREAT_COLOR, 0.95);
        g.strokeRect(x - TILE_SIZE / 2 + 4, y - TILE_SIZE / 2 + 4, TILE_SIZE - 8, TILE_SIZE - 8);
      }
    }

    const selected = this.gameState.phase === 'player' ? this.gameState.selectedUnit : null;
    const preview = selected ? this.gameState.abilityPreview : null;

    if (selected) {
      if (preview) {
        this.drawAbilityPreview(g, preview);
      } else {
        for (const move of this.gameState.getValidMoves(selected)) {
          const { x, y } = cellToPixel(move);
          g.fillStyle(COLORS.validMove, 0.3);
          g.fillRect(x - TILE_SIZE / 2 + 3, y - TILE_SIZE / 2 + 3, TILE_SIZE - 6, TILE_SIZE - 6);
          g.fillStyle(COLORS.validMove, 0.9);
          g.fillCircle(x, y, 9);
        }
      }

      g.lineStyle(4, COLORS.selection, 1);
      for (const own of unitCells(selected)) {
        const { x, y } = cellToPixel(own);
        g.strokeRect(x - TILE_SIZE / 2 + 3, y - TILE_SIZE / 2 + 3, TILE_SIZE - 6, TILE_SIZE - 6);
      }
    }

    if (this.hoverCell) {
      const { x, y } = cellToPixel(this.hoverCell);
      g.lineStyle(2, COLORS.hover, 0.7);
      g.strokeRect(x - TILE_SIZE / 2 + 1, y - TILE_SIZE / 2 + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    }
  }

  /**
   * Prévia da habilidade: casas escolhíveis (azul), área afetada (laranja) e escolha atual
   * (contorno amarelo). Aparece antes de o jogador confirmar.
   */
  private drawAbilityPreview(g: Phaser.GameObjects.Graphics, preview: AbilityPreview): void {
    for (const cell of preview.selectable) {
      const { x, y } = cellToPixel(cell);
      g.fillStyle(PREVIEW_SELECTABLE, 0.22);
      g.fillRect(x - TILE_SIZE / 2 + 3, y - TILE_SIZE / 2 + 3, TILE_SIZE - 6, TILE_SIZE - 6);
      g.lineStyle(2, PREVIEW_SELECTABLE, 0.8);
      g.strokeRect(x - TILE_SIZE / 2 + 3, y - TILE_SIZE / 2 + 3, TILE_SIZE - 6, TILE_SIZE - 6);
    }
    for (const cell of preview.effect) {
      const { x, y } = cellToPixel(cell);
      g.fillStyle(PREVIEW_EFFECT, 0.5);
      g.fillRect(x - TILE_SIZE / 2 + 3, y - TILE_SIZE / 2 + 3, TILE_SIZE - 6, TILE_SIZE - 6);
    }
    for (const cell of preview.chosen) {
      const { x, y } = cellToPixel(cell);
      g.lineStyle(4, PREVIEW_CHOSEN, 1);
      g.strokeRect(x - TILE_SIZE / 2 + 6, y - TILE_SIZE / 2 + 6, TILE_SIZE - 12, TILE_SIZE - 12);
    }
  }
}