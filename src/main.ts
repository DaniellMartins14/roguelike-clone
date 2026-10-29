import './style.css';
import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './game/config';
import { Campaign } from './game/core/Campaign';
import { BattleScene } from './game/scenes/BattleScene';
import { SidePanel } from './ui/SidePanel';
import { PreparationScreen } from './ui/PreparationScreen';

const gameContainer = document.getElementById('game-container');
const panelRoot = document.getElementById('panel');

if (!gameContainer || !panelRoot) {
  throw new Error('Elementos #game-container e #panel não encontrados no index.html');
}

// Capturamos referências já validadas em constantes para manter o narrowing do TypeScript dentro dos callbacks.
const gameRoot: HTMLElement = gameContainer;
const panel: HTMLElement = panelRoot;

const campaign = new Campaign();
let game: Phaser.Game | null = null;
let sidePanel: SidePanel | null = null;

function showPreparation(resetCampaign = false): void {
  sidePanel?.destroy();
  sidePanel = null;
  game?.destroy(true);
  game = null;
  if (resetCampaign) campaign.restart(false);
  gameRoot.hidden = true;
  gameRoot.style.display = 'none';
  new PreparationScreen(panel, campaign, startExpedition);
}

function startExpedition(): void {
  panel.replaceChildren();
  gameRoot.hidden = false;
  gameRoot.style.display = '';
  sidePanel = new SidePanel(panel, campaign, () => showPreparation(true));
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: gameRoot,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: 'rgba(0,0,0,0)',
    transparent: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [new BattleScene(campaign)],
  });
}

showPreparation();

// Evita jogos duplicados quando o Vite recarrega o módulo (HMR).
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    sidePanel?.destroy();
    sidePanel = null;
    game?.destroy(true);
  });
}
