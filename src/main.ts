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

const campaign = new Campaign();
let game: Phaser.Game | null = null;
let sidePanel: SidePanel | null = null;

gameContainer.hidden = true;
gameContainer.style.display = 'none';

function startExpedition(): void {
  panelRoot.replaceChildren();
  gameContainer.hidden = false;
  gameContainer.style.display = '';
  sidePanel = new SidePanel(panelRoot, campaign);
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: gameContainer,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#0b1220',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [new BattleScene(campaign)],
  });
}

new PreparationScreen(panelRoot, campaign, startExpedition);

// Evita jogos duplicados quando o Vite recarrega o módulo (HMR).
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game?.destroy(true);
    sidePanel = null;
  });
}
