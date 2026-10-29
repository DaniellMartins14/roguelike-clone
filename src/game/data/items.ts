import type { ItemDefinition } from '../types';

const F1 = 1;
const F2 = 11;
const W = ['warrior'] as const;
const A = ['assassin'] as const;
const M = ['mage'] as const;
const C = ['cleric'] as const;
const R = ['archer'] as const;

export const ITEM_DEFINITIONS: Readonly<Record<string, ItemDefinition>> = {
  // Compatibilidade com equipamentos antigos; novos kits seguem slots padronizados.
  'worn-right-glove': { id: 'worn-right-glove', name: 'Luva de Couro Gasto', slot: 'weapon', minLevel: F1, sellPrice: 2, bonuses: { strength: 1 } },
  'worn-left-glove': { id: 'worn-left-glove', name: 'Luva de Couro Remendada', slot: 'off-hand', minLevel: F1, sellPrice: 2, bonuses: { defense: 1 } },
  'leather-boots': { id: 'leather-boots', name: 'Botas de Couro', slot: 'boots', minLevel: F1, sellPrice: 5, bonuses: { vitality: 5 } },
  'padded-chest': { id: 'padded-chest', name: 'Peitoral Acolchoado', slot: 'chest', minLevel: F1, sellPrice: 8, bonuses: { vitality: 10, defense: 1 } },
  'iron-helmet': { id: 'iron-helmet', name: 'Capacete de Ferro', slot: 'helmet', minLevel: F1, sellPrice: 7, bonuses: { defense: 2 } },
  'traveler-pants': { id: 'traveler-pants', name: 'Calça de Viajante', slot: 'boots', minLevel: F1, sellPrice: 5, bonuses: { vitality: 5 } },
  'rusty-sword': { id: 'rusty-sword', name: 'Espada Enferrujada', slot: 'weapon', minLevel: F1, sellPrice: 4, bonuses: { strength: 3 } },
  'wooden-buckler': { id: 'wooden-buckler', name: 'Broquel de Madeira', slot: 'off-hand', minLevel: F1, sellPrice: 5, bonuses: { defense: 2 } },

  // Faixa 1 — armas exclusivas por classe.
  'short-sword': { id: 'short-sword', name: 'Espada curta', slot: 'weapon', allowedClasses: W, sellPrice: 8, bonuses: { strength: 4 } },
  'axe': { id: 'axe', name: 'Machado', slot: 'weapon', allowedClasses: W, sellPrice: 10, bonuses: { strength: 5 } },
  'shield': { id: 'shield', name: 'Escudo', slot: 'off-hand', allowedClasses: W, sellPrice: 7, bonuses: { defense: 3 } },
  'knife': { id: 'knife', name: 'Faca', slot: 'weapon', allowedClasses: A, sellPrice: 7, bonuses: { strength: 4 } },
  'dagger': { id: 'dagger', name: 'Punhal', slot: 'weapon', allowedClasses: A, sellPrice: 9, bonuses: { strength: 5 } },
  'offhand-knife': { id: 'offhand-knife', name: 'Faca secundária', slot: 'off-hand', allowedClasses: A, sellPrice: 5, bonuses: { strength: 2 } },
  'offhand-dagger': { id: 'offhand-dagger', name: 'Punhal secundário', slot: 'off-hand', allowedClasses: A, sellPrice: 6, bonuses: { strength: 3 } },
  'wand': { id: 'wand', name: 'Varinha', slot: 'weapon', allowedClasses: M, sellPrice: 8, bonuses: { strength: 4 } },
  'staff': { id: 'staff', name: 'Cajado', slot: 'weapon', allowedClasses: M, sellPrice: 10, bonuses: { strength: 5 } },
  'magic-tome': { id: 'magic-tome', name: 'Tomo de magia', slot: 'off-hand', allowedClasses: M, sellPrice: 8, bonuses: { strength: 4 } },
  'glove': { id: 'glove', name: 'Luva', slot: 'weapon', allowedClasses: C, sellPrice: 7, bonuses: { strength: 3 } },
  'consecrated-staff': { id: 'consecrated-staff', name: 'Cajado consagrado', slot: 'weapon', allowedClasses: C, sellPrice: 10, bonuses: { strength: 5 } },
  'cleric-tome': { id: 'cleric-tome', name: 'Tomo de magia', slot: 'off-hand', allowedClasses: C, sellPrice: 8, bonuses: { strength: 4 } },
  'shortbow': { id: 'shortbow', name: 'Arco curto', slot: 'weapon', allowedClasses: R, sellPrice: 12, bonuses: { strength: 7 } },
  'longbow': { id: 'longbow', name: 'Arco longo', slot: 'weapon', allowedClasses: R, sellPrice: 15, bonuses: { strength: 9 } },

  // Amuletos especiais da faixa 1.
  'shadow-claw': { id: 'shadow-claw', name: 'Garra do Sombrio', slot: 'amulet', sellPrice: 20, bonuses: { strength: 5, vitality: 5, defense: 5 } },
  'cthulhu-tentacle': { id: 'cthulhu-tentacle', name: 'Tentáculo de Cthulhu', slot: 'amulet', sellPrice: 30, bonuses: { strength: 10, vitality: 10, defense: 10 } },

  // Faixa 2 — armas exclusivas por classe.
  'long-sword': { id: 'long-sword', name: 'Espada longa', slot: 'weapon', minLevel: F2, allowedClasses: W, sellPrice: 25, bonuses: { strength: 10 } },
  'double-axe': { id: 'double-axe', name: 'Machado duplo', slot: 'weapon', minLevel: F2, allowedClasses: W, sellPrice: 30, bonuses: { strength: 12 } },
  'iron-shield': { id: 'iron-shield', name: 'Escudo de ferro', slot: 'off-hand', minLevel: F2, allowedClasses: W, sellPrice: 22, bonuses: { defense: 7 } },
  'sharp-knife': { id: 'sharp-knife', name: 'Faca afiada', slot: 'weapon', minLevel: F2, allowedClasses: A, sellPrice: 24, bonuses: { strength: 10 } },
  'sharp-dagger': { id: 'sharp-dagger', name: 'Punhal afiado', slot: 'weapon', minLevel: F2, allowedClasses: A, sellPrice: 28, bonuses: { strength: 12 } },
  'offhand-sharp-knife': { id: 'offhand-sharp-knife', name: 'Faca afiada secundária', slot: 'off-hand', minLevel: F2, allowedClasses: A, sellPrice: 20, bonuses: { strength: 7 } },
  'offhand-sharp-dagger': { id: 'offhand-sharp-dagger', name: 'Punhal afiado secundário', slot: 'off-hand', minLevel: F2, allowedClasses: A, sellPrice: 23, bonuses: { strength: 8 } },
  'magic-wand': { id: 'magic-wand', name: 'Varinha mágica', slot: 'weapon', minLevel: F2, allowedClasses: M, sellPrice: 25, bonuses: { strength: 10 } },
  'magic-staff': { id: 'magic-staff', name: 'Cajado mágico', slot: 'weapon', minLevel: F2, allowedClasses: M, sellPrice: 30, bonuses: { strength: 12 } },
  'damage-tome': { id: 'damage-tome', name: 'Tomo de magia de dano', slot: 'off-hand', minLevel: F2, allowedClasses: M, sellPrice: 25, bonuses: { strength: 10 } },
  'white-glove': { id: 'white-glove', name: 'Luva branca', slot: 'weapon', minLevel: F2, allowedClasses: C, sellPrice: 22, bonuses: { strength: 8 } },
  'superior-consecrated-staff': { id: 'superior-consecrated-staff', name: 'Cajado consagrado superior', slot: 'weapon', minLevel: F2, allowedClasses: C, sellPrice: 30, bonuses: { strength: 12 } },
  'vitality-tome': { id: 'vitality-tome', name: 'Tomo de magia de vida', slot: 'off-hand', minLevel: F2, allowedClasses: C, sellPrice: 25, bonuses: { vitality: 10 } },
  'expert-shortbow': { id: 'expert-shortbow', name: 'Arco curto especialista', slot: 'weapon', minLevel: F2, allowedClasses: R, sellPrice: 35, bonuses: { strength: 15 } },
  'expert-longbow': { id: 'expert-longbow', name: 'Arco longo especialista', slot: 'weapon', minLevel: F2, allowedClasses: R, sellPrice: 40, bonuses: { strength: 18 } },

  // Amuletos especiais da faixa 2.
  'winter-cloak': { id: 'winter-cloak', name: 'Capa do Inverno', slot: 'amulet', minLevel: F2, sellPrice: 45, bonuses: {}, defensePercent: 10 },
  'seventh-fang': { id: 'seventh-fang', name: 'Dente do Sétimo', slot: 'amulet', minLevel: F2, sellPrice: 45, bonuses: {}, lifestealPercent: 5 },

  // IDs antigos mantidos para não quebrar drops já configurados.
  'bloodsteel-sword': { id: 'bloodsteel-sword', name: 'Espada de Aço Sanguíneo', slot: 'weapon', minLevel: F2, sellPrice: 20, bonuses: { strength: 7 } },
  'nightfang-dagger': { id: 'nightfang-dagger', name: 'Adaga Presa Noturna', slot: 'weapon', minLevel: F2, sellPrice: 18, bonuses: { strength: 6 } },
  'mooncleaver': { id: 'mooncleaver', name: 'Talhadora da Lua Rubra', slot: 'weapon', minLevel: F2, sellPrice: 25, bonuses: { strength: 9 } },
  'seventh-edge': { id: 'seventh-edge', name: 'Lâmina do Sétimo', slot: 'weapon', minLevel: F2, sellPrice: 30, bonuses: { strength: 12 } },
};
