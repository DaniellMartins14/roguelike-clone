import './style.css';
import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './game/config';
import { Campaign } from './game/core/Campaign';
import { BattleScene } from './game/scenes/BattleScene';
import { SidePanel } from './ui/SidePanel';

const gameContainer = document.getElementById('game-container');
const panelRoot = document.getElementById('panel');

if (!gameContainer || !panelRoot) {
  throw new Error('Elementos #game-container e #panel não encontrados no index.html');
}

// A campanha guarda o andar atual, o grupo de heróis e o combate de cada andar.
const campaign = new Campaign();
new SidePanel(panelRoot, campaign);

const game = new Phaser.Game({
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

// Evita jogos duplicados quando o Vite recarrega o módulo (HMR).
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.destroy(true);
  });
}