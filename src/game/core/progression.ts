import type { EquipmentSlot, HeroProgression, InventoryItem, ItemDefinition, Unit } from '../types';
import { ITEM_DEFINITIONS } from '../data/items';

export const ATTRIBUTE_POINTS_PER_LEVEL = 3;
export const BASE_XP_TO_NEXT_LEVEL = 50;
export const XP_INCREASE_PER_LEVEL = 5;
export const CLASS_MULTIPLIERS: Record<string, { damage: number; hp: number; defense: number }> = {
  warrior: { damage: 1, hp: 1.5, defense: 1.4 },
  mage: { damage: 1.35, hp: 0.75, defense: 0.65 },
  cleric: { damage: 0.85, hp: 1, defense: 1 },
  assassin: { damage: 1.25, hp: 0.85, defense: 0.75 },
  archer: { damage: 1.15, hp: 0.9, defense: 0.8 },
};
export function createHeroProgression(): HeroProgression {
  return { level: 1, xp: 0, unspentAttributePoints: 0, attributes: { strength: 0, vitality: 0, defense: 0 } };
}
/** XP exigido para avançar do nível atual; cresce 5 pontos a cada nível. */
export function xpRequiredForNextLevel(level: number): number {
  return 2 * (BASE_XP_TO_NEXT_LEVEL + Math.max(0, level - 1) * XP_INCREASE_PER_LEVEL);
}

/** Penalidade por morte: 10% da barra do nível atual, sem nunca remover níveis. */
export function applyDeathXpPenalty(hero: Unit): number {
  const progression = hero.progression;
  if (!progression) return 0;
  const penalty = Math.ceil(xpRequiredForNextLevel(progression.level) * 0.1);
  const lost = Math.min(progression.xp, penalty);
  progression.xp -= lost;
  return lost;
}
export function xpRewardForMonster(monster: Unit): number {
  const multiplier = monster.definition.rank === 'boss' ? 10 : monster.definition.rank === 'mini-boss' ? 4 : 1;
  return Math.max(10, Math.round((monster.definition.maxHp + monster.definition.damage * 3) * multiplier));
}
export function awardKillXp(hero: Unit, monster: Unit): number {
  if (hero.definition.team !== 'hero' || !hero.progression) return 0;
  const p = hero.progression;
  const gained = xpRewardForMonster(monster);
  p.xp += gained;
  while (p.xp >= xpRequiredForNextLevel(p.level)) {
    p.xp -= xpRequiredForNextLevel(p.level);
    p.level += 1;
    p.unspentAttributePoints += ATTRIBUTE_POINTS_PER_LEVEL;
  }
  return gained;
}
export type AttributeName = keyof HeroProgression['attributes'];
export function allocateAttributePoint(hero: Unit, attribute: AttributeName, points = 1): boolean {
  const p = hero.progression;
  if (!p || !Number.isInteger(points) || points < 1 || p.unspentAttributePoints < points) return false;
  p.attributes[attribute] += points;
  p.unspentAttributePoints -= points;
  return true;
}

/** Inventário do jogador. O item permanece registrado mesmo quando equipado por um personagem. */
export class PlayerInventory {
  private readonly itemsByInstance = new Map<string, InventoryItem>();
  private readonly available = new Set<string>();
  private nextId = 1;
  get items(): readonly InventoryItem[] { return [...this.available].map((id) => this.itemsByInstance.get(id)!).filter(Boolean); }
  add(definitionId: string): InventoryItem {
    const item = { instanceId: `item-${this.nextId++}`, definitionId };
    this.itemsByInstance.set(item.instanceId, item);
    this.available.add(item.instanceId);
    return item;
  }
  has(instanceId: string): boolean { return this.available.has(instanceId); }
  clear(): void { this.itemsByInstance.clear(); this.available.clear(); this.nextId = 1; }
  equip(hero: Unit, instanceId: string, definitions: Readonly<Record<string, ItemDefinition>>): boolean {
    if (hero.definition.team !== 'hero' || !hero.progression || !this.available.has(instanceId)) return false;
    const item = this.itemsByInstance.get(instanceId)!;
    const definition = definitions[item.definitionId];
    if (!definition || hero.progression.level < (definition.minLevel ?? 1)) return false;
    hero.equipment ??= {};
    const oldId = hero.equipment[definition.slot];
    if (oldId) {
      const oldItem = this.itemsByInstance.get(oldId);
      const oldDefinition = oldItem ? definitions[oldItem.definitionId] : undefined;
      if (oldDefinition) applyEquipmentBonuses(hero, oldDefinition, -1);
      this.available.add(oldId);
    }
    this.available.delete(instanceId);
    hero.equipment[definition.slot] = instanceId;
    applyEquipmentBonuses(hero, definition, 1);
    return true;
  }
  unequip(hero: Unit, slot: EquipmentSlot, definitions: Readonly<Record<string, ItemDefinition>> = ITEM_DEFINITIONS): boolean {
    const id = hero.equipment?.[slot];
    if (!id || !this.itemsByInstance.has(id)) return false;
    const item = this.itemsByInstance.get(id)!;
    const definition = definitions[item.definitionId];
    if (definition) applyEquipmentBonuses(hero, definition, -1);
    delete hero.equipment![slot];
    this.available.add(id);
    return true;
  }
  definitionOf(instanceId: string): string | null { return this.itemsByInstance.get(instanceId)?.definitionId ?? null; }
}

function applyEquipmentBonuses(hero: Unit, item: ItemDefinition, direction: 1 | -1): void {
  if (item.bonuses.strength) hero.damage = Math.max(1, hero.damage + item.bonuses.strength * direction);
  if (item.bonuses.defense && hero.progression) {
    hero.progression.attributes.defense = Math.max(0, hero.progression.attributes.defense + item.bonuses.defense * direction);
  }
  if (item.bonuses.vitality) {
    const delta = item.bonuses.vitality * direction;
    hero.maxHp = Math.max(1, hero.maxHp + delta);
    hero.hp = Math.min(hero.maxHp, Math.max(0, hero.hp + delta));
  }
}
