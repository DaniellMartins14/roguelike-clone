import type { Campaign } from '../game/core/Campaign';
import type { EquipmentSlot, Unit } from '../game/types';

const SLOTS: Array<{ id: EquipmentSlot; label: string }> = [
  { id: 'right-glove', label: 'Luva direita' },
  { id: 'left-glove', label: 'Luva esquerda' },
  { id: 'boots', label: 'Botas' },
  { id: 'chest', label: 'Peitoral' },
  { id: 'helmet', label: 'Capacete' },
  { id: 'pants', label: 'Calça' },
  { id: 'weapon', label: 'Arma' },
  { id: 'off-hand', label: 'Mão secundária' },
];

/** Tela inicial de preparação. A UI de itens será ligada ao inventário conforme o sistema de drops for criado. */
export class PreparationScreen {
  private selectedHero: Unit;
  private readonly root: HTMLElement;
  private readonly campaign: Campaign;
  private readonly onStart: () => void;

  constructor(root: HTMLElement, campaign: Campaign, onStart: () => void) {
    this.root = root;
    this.campaign = campaign;
    this.onStart = onStart;
    this.selectedHero = campaign.party[0];
    this.render();
  }

  private render(): void {
    const page = document.createElement('section');
    page.className = 'preparation-screen';
    page.style.cssText = 'max-width:760px;margin:24px auto;padding:20px;color:#f3f4f6;background:#151923;border:1px solid #394150;border-radius:12px;font-family:system-ui,sans-serif;';
    const heading = document.createElement('h1');
    heading.textContent = 'Preparação';
    heading.style.cssText = 'margin:0 0 6px;font-size:1.8rem;';
    const subtitle = document.createElement('p');
    subtitle.textContent = 'Organize os equipamentos do grupo antes de iniciar a expedição.';
    subtitle.style.cssText = 'margin:0 0 18px;color:#aeb8c8;';
    page.append(heading, subtitle);

    const layout = document.createElement('div');
    layout.style.cssText = 'display:grid;grid-template-columns:minmax(140px,0.8fr) minmax(240px,1.4fr);gap:16px;';
    const roster = document.createElement('nav');
    roster.setAttribute('aria-label', 'Personagens');
    roster.style.cssText = 'display:grid;align-content:start;gap:8px;';
    for (const hero of this.campaign.party) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = hero.definition.name + ' · Nv. ' + (hero.progression?.level ?? 1);
      button.style.cssText = 'padding:11px;text-align:left;border:1px solid ' + (hero.uid === this.selectedHero.uid ? '#a78bfa' : '#394150') + ';border-radius:7px;background:' + (hero.uid === this.selectedHero.uid ? '#302747' : '#202633') + ';color:#fff;cursor:pointer;';
      button.setAttribute('aria-pressed', String(hero.uid === this.selectedHero.uid));
      button.addEventListener('click', () => { this.selectedHero = hero; this.render(); });
      roster.append(button);
    }

    const detail = document.createElement('section');
    detail.style.cssText = 'padding:14px;border:1px solid #394150;border-radius:8px;background:#1c2230;';
    const heroTitle = document.createElement('h2');
    heroTitle.textContent = this.selectedHero.definition.name;
    heroTitle.style.cssText = 'margin:0 0 4px;font-size:1.25rem;';
    const level = document.createElement('p');
    level.textContent = 'Nível ' + (this.selectedHero.progression?.level ?? 1) + ' · ' + this.selectedHero.hp + '/' + this.selectedHero.maxHp + ' PV';
    level.style.cssText = 'margin:0 0 12px;color:#aeb8c8;font-size:.9rem;';
    const slots = document.createElement('div');
    slots.style.cssText = 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;';
    for (const slot of SLOTS) {
      const card = document.createElement('div');
      card.style.cssText = 'min-height:58px;padding:9px;border:1px dashed #4b5563;border-radius:7px;background:#151923;';
      const label = document.createElement('div');
      label.textContent = slot.label;
      label.style.cssText = 'font-size:.8rem;color:#aeb8c8;margin-bottom:5px;';
      const equippedId = this.selectedHero.equipment?.[slot.id];
      const value = document.createElement('strong');
      value.textContent = equippedId ? (this.campaign.inventory.definitionOf(equippedId) ?? 'Item') : 'Vazio';
      value.style.cssText = 'font-size:.9rem;';
      card.append(label, value);
      slots.append(card);
    }
    detail.append(heroTitle, level, slots);
    layout.append(roster, detail);
    page.append(layout);

    const inventory = document.createElement('section');
    inventory.style.cssText = 'margin-top:16px;padding:14px;border:1px solid #394150;border-radius:8px;';
    const inventoryTitle = document.createElement('h2');
    inventoryTitle.textContent = 'Inventário compartilhado';
    inventoryTitle.style.cssText = 'font-size:1.1rem;margin:0 0 6px;';
    const inventoryText = document.createElement('p');
    inventoryText.textContent = this.campaign.inventory.items.length
      ? 'Selecione um item para equipá-lo. Os itens equipados ficam vinculados ao personagem e não podem ser duplicados.'
      : 'O inventário está vazio. Os itens poderão ser distribuídos aqui quando o sistema de coleta for implementado.';
    inventoryText.style.cssText = 'margin:0;color:#aeb8c8;font-size:.9rem;';
    inventory.append(inventoryTitle, inventoryText);
    page.append(inventory);

    const start = document.createElement('button');
    start.type = 'button';
    start.textContent = 'Começar expedição';
    start.style.cssText = 'width:100%;margin-top:16px;padding:13px;border:0;border-radius:8px;background:#7c5ce0;color:white;font-weight:700;font-size:1rem;cursor:pointer;';
    start.addEventListener('click', this.onStart);
    page.append(start);

    this.root.replaceChildren(page);
  }
}
