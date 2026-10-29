import type { ItemDefinition } from '../types';

export const ITEM_DEFINITIONS: Readonly<Record<string, ItemDefinition>> = {
  'worn-right-glove': { id: 'worn-right-glove', name: 'Luva de Couro Gasto', slot: 'right-glove', minLevel: 1, bonuses: { strength: 1 } },
  'worn-left-glove': { id: 'worn-left-glove', name: 'Luva de Couro Remendada', slot: 'left-glove', minLevel: 1, bonuses: { defense: 1 } },
  'leather-boots': { id: 'leather-boots', name: 'Botas de Couro', slot: 'boots', minLevel: 1, bonuses: { vitality: 5 } },
  'padded-chest': { id: 'padded-chest', name: 'Peitoral Acolchoado', slot: 'chest', minLevel: 1, bonuses: { vitality: 10, defense: 1 } },
  'iron-helmet': { id: 'iron-helmet', name: 'Capacete de Ferro', slot: 'helmet', minLevel: 1, bonuses: { defense: 2 } },
  'traveler-pants': { id: 'traveler-pants', name: 'Calça de Viajante', slot: 'pants', minLevel: 1, bonuses: { vitality: 5 } },
  'rusty-sword': { id: 'rusty-sword', name: 'Espada Enferrujada', slot: 'weapon', minLevel: 1, bonuses: { strength: 3 } },
  'wooden-buckler': { id: 'wooden-buckler', name: 'Broquel de Madeira', slot: 'off-hand', minLevel: 1, bonuses: { defense: 2 } },
  'bloodsteel-sword': { id: 'bloodsteel-sword', name: 'Espada de Aço Sanguíneo', slot: 'weapon', minLevel: 1, bonuses: { strength: 7 } },
  'nightfang-dagger': { id: 'nightfang-dagger', name: 'Adaga Presa Noturna', slot: 'weapon', minLevel: 1, bonuses: { strength: 6 } },
  'mooncleaver': { id: 'mooncleaver', name: 'Talhadora da Lua Rubra', slot: 'weapon', minLevel: 1, bonuses: { strength: 9 } },
  'seventh-edge': { id: 'seventh-edge', name: 'Lâmina do Sétimo', slot: 'weapon', minLevel: 1, bonuses: { strength: 12 } },
};
