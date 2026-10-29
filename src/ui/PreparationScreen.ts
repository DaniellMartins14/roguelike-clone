import type { Campaign } from '../game/core/Campaign';
import type { EquipmentSlot, Position, Unit } from '../game/types';
import { ITEM_DEFINITIONS } from '../game/data/items';
import warriorSprite from '../assets/sprites/warrior.png';
import assassinSprite from '../assets/sprites/assassin.png';
import archerSprite from '../assets/sprites/archer.png';
import mageSprite from '../assets/sprites/mage.png';
import clericSprite from '../assets/sprites/cleric.png';

const HERO_SPRITES: Record<string, string> = {
  warrior: warriorSprite,
  assassin: assassinSprite,
  archer: archerSprite,
  mage: mageSprite,
  cleric: clericSprite,
};


const SLOTS: Array<{ id: EquipmentSlot; label: string }> = [
  { id: 'right-glove', label: 'Luva direita' }, { id: 'left-glove', label: 'Luva esquerda' },
  { id: 'boots', label: 'Botas' }, { id: 'chest', label: 'Peitoral' },
  { id: 'helmet', label: 'Capacete' }, { id: 'pants', label: 'Calça' },
  { id: 'weapon', label: 'Arma' }, { id: 'off-hand', label: 'Mão secundária' },
];
const STYLE = {
  card: 'padding:12px;border:1px solid #394150;border-radius:10px;background:#151d2b;color:#f3f4f6;',
  button: 'padding:10px;border:1px solid #475569;border-radius:8px;background:#202b3d;color:#f3f4f6;cursor:pointer;',
};

export class PreparationScreen {
  private selectedHero: Unit;
  private readonly selectedUids = new Set<string>();
  private readonly positions = new Map<string, Position>();
  private readonly root: HTMLElement;
  private readonly campaign: Campaign;
  private readonly onStart: () => void;
  private message = '';

  constructor(root: HTMLElement, campaign: Campaign, onStart: () => void) {
    this.root = root;
    this.campaign = campaign;
    this.onStart = onStart;
    const available = campaign.party.filter((hero) => hero.hp > 0);
    const initialParty = campaign.activeParty.filter((hero) => hero.hp > 0).slice(0, 3);
    for (const hero of initialParty) this.selectedUids.add(hero.uid);
    if (this.selectedUids.size === 0) available.slice(0, 3).forEach((hero) => this.selectedUids.add(hero.uid));
    this.selectedHero = available.find((hero) => this.selectedUids.has(hero.uid)) ?? available[0] ?? campaign.party[0];
    available.forEach((hero, index) => this.positions.set(hero.uid, { col: index % 6, row: 5 }));
    this.render();
  }

  private render(): void {
    const page = document.createElement('main');
    page.className = 'preparation-screen';
    page.style.cssText = 'width:min(100%,1180px);margin:auto;padding:clamp(12px,2vw,24px);color:#f3f4f6;font-family:system-ui,sans-serif;';
    const eyebrow = document.createElement('p');
    eyebrow.textContent = 'ROGUELIKE ALFA · BASE DE OPERAÇÕES';
    eyebrow.style.cssText = 'color:#a78bfa;font-weight:800;letter-spacing:.16em;font-size:.75rem;margin:0 0 8px;';
    const heading = document.createElement('h1');
    heading.textContent = 'Preparar expedição';
    heading.style.cssText = 'font-size:clamp(2rem,4vw,3rem);margin:0;';
    const subtitle = document.createElement('p');
    subtitle.textContent = 'Monte sua equipe, posicione os heróis e confira seus equipamentos antes de entrar na masmorra.';
    subtitle.style.cssText = 'color:#aeb8c8;line-height:1.4;margin:6px 0 12px;max-width:760px;';
    const goldBalance = document.createElement('div');
    goldBalance.textContent = `🪙 Ouro disponível: ${this.campaign.gold}`;
    goldBalance.style.cssText = 'display:inline-flex;align-items:center;padding:8px 12px;margin:0 0 12px;border:1px solid #a16207;border-radius:9px;background:#422006;color:#fde68a;font-weight:800;';
    page.append(eyebrow, heading, subtitle, goldBalance);

    const columns = document.createElement('div');
    columns.style.cssText = 'display:grid;grid-template-columns:minmax(220px,.8fr) minmax(0,1.2fr);gap:12px;align-items:start;';
    const left = document.createElement('section');
    left.style.cssText = STYLE.card;
    const rosterTitle = document.createElement('h2');
    rosterTitle.textContent = `Sua equipe · ${this.selectedUids.size}/3`;
    rosterTitle.style.cssText = 'margin:0 0 6px;font-size:1.15rem;';
    const rosterHint = document.createElement('p');
    rosterHint.textContent = 'Escolha de 1 a 3 personagens. Clique no nome para selecionar e no botão para incluir/remover.';
    rosterHint.style.cssText = 'color:#94a3b8;font-size:.85rem;line-height:1.4;margin:0 0 12px;';
    const roster = document.createElement('div');
    roster.style.cssText = 'display:grid;gap:8px;';
    for (const hero of this.campaign.party) {
      const chosen = this.selectedUids.has(hero.uid);
      const row = document.createElement('div');
      row.style.cssText = `display:flex;gap:8px;align-items:center;padding:10px;border:1px solid ${chosen ? '#8b5cf6' : '#394150'};border-radius:8px;background:${chosen ? '#2b2341' : '#101723'};opacity:${hero.hp > 0 ? '1' : '.55'};`;
      const select = document.createElement('button');
      select.type = 'button';
      select.textContent = `${hero.definition.name} · Nv. ${hero.progression?.level ?? 1}${hero.hp <= 0 ? ' · Caído' : ''}`;
      select.style.cssText = 'flex:1;text-align:left;border:0;background:transparent;color:#fff;cursor:pointer;padding:4px;';
      select.disabled = hero.hp <= 0;
      select.addEventListener('click', () => { this.selectedHero = hero; this.message = ''; this.render(); });
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.textContent = chosen ? 'Remover' : 'Adicionar';
      toggle.style.cssText = STYLE.button;
      toggle.disabled = hero.hp <= 0 || (!chosen && this.selectedUids.size >= 3);
      toggle.addEventListener('click', () => {
        if (chosen) {
          if (this.selectedUids.size <= 1) { this.message = 'A equipe precisa ter pelo menos um herói.'; }
          else { this.selectedUids.delete(hero.uid); this.message = ''; }
        } else {
          this.selectedUids.add(hero.uid); this.selectedHero = hero; this.message = '';
          const used = [...this.selectedUids].map((uid) => this.positions.get(uid)).filter(Boolean) as Position[];
          const pos = this.positions.get(hero.uid)!;
          if (used.filter((p) => p.col === pos.col && p.row === pos.row).length > 1) {
            const free = this.findFreePosition();
            if (free) this.positions.set(hero.uid, free);
          }
        }
        this.render();
      });
      row.append(select, toggle);
      roster.append(row);
    }
    left.append(rosterTitle, rosterHint, roster);

    const right = document.createElement('div');
    right.style.cssText = 'display:grid;gap:12px;';
    const boardCard = document.createElement('section');
    boardCard.style.cssText = STYLE.card;
    const boardTitle = document.createElement('h2');
    boardTitle.textContent = 'Formação inicial';
    boardTitle.style.cssText = 'margin:0 0 5px;font-size:1.15rem;';
    const boardHint = document.createElement('p');
    boardHint.textContent = `Personagem selecionado: ${this.selectedHero.definition.name}. Clique em uma casa livre das três linhas inferiores para posicioná-lo.`;
    boardHint.style.cssText = 'color:#94a3b8;font-size:.83rem;line-height:1.4;margin:0 0 12px;';
    const board = document.createElement('div');
    board.style.cssText = 'display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:4px;max-width:540px;margin:auto;';
    for (let row = 0; row < 6; row++) for (let col = 0; col < 6; col++) {
      const occupant = [...this.selectedUids].map((uid) => this.campaign.party.find((hero) => hero.uid === uid)!).find((hero) => {
        const pos = this.positions.get(hero.uid);
        return pos?.col === col && pos?.row === row;
      });
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.title = occupant ? `${occupant.definition.name} · clique para ver equipamentos e inventário` : `Coluna ${col + 1}, linha ${row + 1}`;
      cell.style.cssText = `display:flex;align-items:center;justify-content:center;aspect-ratio:1;overflow:hidden;padding:2px;border:1px solid ${occupant?.uid === this.selectedHero.uid ? '#facc15' : occupant ? '#8b5cf6' : '#394150'};border-radius:6px;background:${occupant ? '#293449' : row >= 3 ? '#263244' : '#101723'};color:white;font-weight:800;cursor:${occupant || row >= 3 ? 'pointer' : 'not-allowed'};`;
      if (occupant) {
        const sprite = HERO_SPRITES[occupant.definition.id];
        if (sprite) {
          const image = document.createElement('img');
          image.src = sprite;
          image.alt = occupant.definition.name;
          image.draggable = false;
          image.style.cssText = 'display:block;width:100%;height:100%;max-width:64px;max-height:64px;object-fit:contain;pointer-events:none;image-rendering:pixelated;';
          cell.append(image);
        } else {
          cell.textContent = occupant.definition.name.slice(0, 2).toUpperCase();
        }
      } else {
        cell.textContent = row >= 3 ? '·' : '';
      }
      cell.disabled = row < 3 && !occupant;
      cell.addEventListener('click', () => {
        // Clicar no sprite seleciona esse herói; o painel de equipamento/inventário acompanha a seleção.
        if (occupant) {
          this.selectedHero = occupant;
          this.message = '';
          this.render();
          return;
        }
        if (row < 3) return;
        const collision = [...this.selectedUids].map((uid) => this.positions.get(uid)).some((pos) => pos && pos.col === col && pos.row === row && !(pos.col === this.positions.get(this.selectedHero.uid)?.col && pos.row === this.positions.get(this.selectedHero.uid)?.row));
        if (collision) { this.message = 'Essa casa já está ocupada por outro herói.'; this.render(); return; }
        this.positions.set(this.selectedHero.uid, { col, row });
        this.message = '';
        this.render();
      });
      board.append(cell);
    }
    boardCard.append(boardTitle, boardHint, board);
    right.append(boardCard);

    const equipmentCard = document.createElement('section');
    equipmentCard.style.cssText = STYLE.card;
    const equipmentTitle = document.createElement('h2');
    equipmentTitle.textContent = `Equipamentos · ${this.selectedHero.definition.name}`;
    equipmentTitle.style.cssText = 'margin:0 0 10px;font-size:1.15rem;';
    const slots = document.createElement('div');
    slots.style.cssText = 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;';
    for (const slot of SLOTS) {
      const card = document.createElement('div');
      card.style.cssText = 'padding:8px;border:1px dashed #475569;border-radius:7px;background:#101723;';
      const equippedId = this.selectedHero.equipment?.[slot.id];
      const name = equippedId ? (ITEM_DEFINITIONS[this.campaign.inventory.definitionOf(equippedId) ?? '']?.name ?? 'Item') : 'Vazio';
      const label = document.createElement('div');
      label.textContent = slot.label;
      label.style.cssText = 'font-size:.75rem;color:#94a3b8;';
      const value = document.createElement('strong');
      value.textContent = name;
      value.style.cssText = 'font-size:.85rem;';
      card.append(label, value);
      if (equippedId) {
        const remove = document.createElement('button');
        remove.type = 'button'; remove.textContent = 'Remover'; remove.style.cssText = STYLE.button + 'display:block;margin-top:6px;padding:5px 8px;font-size:.75rem;';
        remove.addEventListener('click', () => { this.campaign.inventory.unequip(this.selectedHero, slot.id); this.render(); });
        card.append(remove);
      }
      slots.append(card);
    }
    const inventoryTitle = document.createElement('h3');
    inventoryTitle.textContent = 'Inventário disponível';
    inventoryTitle.style.cssText = 'font-size:.9rem;margin:14px 0 8px;color:#cbd5e1;';
    const items = document.createElement('div');
    items.style.cssText = 'display:grid;gap:6px;';
    for (const item of this.campaign.inventory.items) {
      const def = ITEM_DEFINITIONS[item.definitionId];
      if (!def) continue;
      const button = document.createElement('button');
      button.type = 'button';
      const bonus = Object.entries(def.bonuses).map(([key, amount]) => `${key === 'strength' ? 'Força' : key === 'vitality' ? 'Vitalidade' : 'Defesa'} +${amount}`).join(' · ');
      button.textContent = `${def.name} · ${SLOTS.find((s) => s.id === def.slot)?.label ?? def.slot} · ${bonus || 'Sem bônus'}`;
      button.style.cssText = STYLE.button + 'text-align:left;font-size:.8rem;';
      button.disabled = this.selectedHero.hp <= 0 || (this.selectedHero.progression?.level ?? 1) < (def.minLevel ?? 1);
      button.addEventListener('click', () => {
        if (this.campaign.inventory.equip(this.selectedHero, item.instanceId, ITEM_DEFINITIONS)) this.render();
        else { this.message = 'Não foi possível equipar esse item.'; this.render(); }
      });
      items.append(button);
    }
    equipmentCard.append(equipmentTitle, slots, inventoryTitle, items);
    right.append(equipmentCard);
    columns.append(left, right);
    page.append(columns);

    const footer = document.createElement('section');
    footer.style.cssText = 'margin-top:12px;padding:16px;border:1px solid #394150;border-radius:10px;background:#111827;';
    const summary = document.createElement('p');
    summary.textContent = `${this.selectedUids.size} herói(s) selecionado(s) · Andar inicial: 1 · Máximo por equipe: 3`;
    summary.style.cssText = 'margin:0 0 10px;color:#cbd5e1;';
    const warning = document.createElement('p');
    warning.textContent = this.message || 'A formação pode ser alterada antes de cada expedição.';
    warning.style.cssText = `margin:0 0 12px;color:${this.message ? '#fca5a5' : '#94a3b8'};font-size:.9rem;`;
    const start = document.createElement('button');
    start.type = 'button'; start.textContent = 'Entrar na masmorra'; start.style.cssText = 'width:100%;padding:14px;border:0;border-radius:8px;background:#7c3aed;color:white;font-weight:800;font-size:1rem;cursor:pointer;';
    start.disabled = this.selectedUids.size < 1 || this.selectedUids.size > 3;
    start.addEventListener('click', () => {
      const positions = Object.fromEntries([...this.positions.entries()]);
      const ok = this.campaign.configureParty([...this.selectedUids], positions);
      if (!ok) { this.message = 'Confira a equipe: selecione de 1 a 3 heróis vivos e deixe cada um em uma casa diferente.'; this.render(); return; }
      this.onStart();
    });
    footer.append(summary, warning, start);
    page.append(footer);
    this.root.replaceChildren(page);
  }

  private findFreePosition(): Position | null {
    for (let row = 3; row < 6; row++) for (let col = 0; col < 6; col++) {
      const used = [...this.selectedUids].some((uid) => {
        if (uid === this.selectedHero.uid) return false;
        const pos = this.positions.get(uid);
        return pos?.col === col && pos?.row === row;
      });
      if (!used) return { col, row };
    }
    return null;
  }
}
