import type { Campaign, CampaignStatus } from '../game/core/Campaign';
import type { GameState } from '../game/core/GameState';
import type { BattlePhase, EncounterType, Unit } from '../game/types';
import { xpRequiredForNextLevel } from '../game/core/progression';

const MODE_LABEL: Record<CampaignStatus, string> = {
  fighting: 'Em combate',
  'floor-cleared': 'Andar concluído — escolha avançar',
  defeated: 'Derrota — campanha encerrada',
  completed: 'Campanha concluída!',
};

const RANK_LABEL: Record<EncounterType, string> = {
  normal: '',
  'mini-boss': 'MINI-CHEFE',
  boss: 'CHEFE',
};

const PHASE_LABEL: Record<BattlePhase, string> = {
  player: 'Vez do jogador',
  heroes: 'Resolvendo: heróis atacando…',
  telegraphs: 'Resolvendo: golpe do chefe…',
  monsters: 'Resolvendo: monstros agindo…',
  over: 'Combate encerrado',
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function section(title: string, content: HTMLElement, className?: string): HTMLElement {
  const wrapper = el('section', className);
  wrapper.append(el('h2', undefined, title), content);
  return wrapper;
}

export class SidePanel {
  private readonly campaign: Campaign;
  private readonly state: GameState;

  // Campanha: andar atual, tipo de encontro e modo (combate / andar concluído / fim)
  private readonly floorEl = el('span', 'floor-label');
  private readonly encounterEl = el('span', 'encounter-chip');
  private readonly floorNameEl = el('div', 'floor-name');
  private readonly modeEl = el('div', 'mode');
  private readonly advanceButton = el('button', 'btn-advance');
  private readonly resetButton = el('button', 'btn-reset', 'Reiniciar campanha');

  private readonly turnEl = el('span', 'turn-value');
  private readonly phaseEl = el('div', 'phase');
  private readonly telegraphBox = el('section', 'telegraph-box');
  private readonly bannerEl = el('div', 'banner');
  private readonly statusEl = el('p', 'status');
  private readonly characterStatsBox = el('section', 'character-stats');

  // Habilidade do herói selecionado
  private readonly abilityBox = el('section', 'ability-box');
  private readonly abilityNameEl = el('span', 'ability-name');
  private readonly abilityStatusEl = el('span', 'ability-status');
  private readonly abilityDescEl = el('p', 'ability-desc');
  private readonly abilityHintEl = el('p', 'ability-hint');
  private readonly noticeEl = el('p', 'notice');
  private readonly useButton = el('button', 'btn-ability', 'Usar habilidade');
  private readonly confirmButton = el('button', 'btn-confirm', 'Confirmar');
  private readonly cancelButton = el('button', 'btn-cancel', 'Cancelar');

  private readonly heroesEl = el('div', 'unit-list');
  private readonly monstersEl = el('div', 'unit-list');
  private readonly logEl = el('ol', 'log');
  private readonly passButton = el('button', 'btn-pass', 'Passar a vez');

  constructor(root: HTMLElement, campaign: Campaign) {
    this.campaign = campaign;
    this.state = campaign.battle;

    const title = el('h1', undefined, 'Roguelike Alfa');

    const floorRow = el('div', 'floor-row');
    floorRow.append(this.floorEl, this.encounterEl);
    const campaignBox = el('div', 'campaign-box');
    campaignBox.append(floorRow, this.floorNameEl, this.modeEl);

    // "Avançar" só aparece com o andar concluído; cliques repetidos são recusados pela campanha.
    this.advanceButton.type = 'button';
    this.advanceButton.hidden = true;
    this.advanceButton.addEventListener('click', () => this.campaign.advance());

    const turnBox = el('div', 'turn-box');
    turnBox.append(el('span', 'turn-label', 'Turno'), this.turnEl);

    this.bannerEl.hidden = true;
    this.telegraphBox.hidden = true;
    this.buildAbilityBox();

    this.passButton.type = 'button';
    this.passButton.addEventListener('click', () => this.state.passTurn());

    this.resetButton.type = 'button';
    this.resetButton.addEventListener('click', () => this.campaign.restart());

    const actions = el('div', 'actions');
    actions.append(this.passButton, this.resetButton);

    root.replaceChildren(
      title,
      campaignBox,
      turnBox,
      this.phaseEl,
      this.telegraphBox,
      this.bannerEl,
      this.advanceButton,
      this.statusEl,
      this.characterStatsBox,
      this.abilityBox,
      section('Heróis', this.heroesEl),
      section('Monstros', this.monstersEl),
      section('Registro de combate', this.logEl, 'log-section'),
      actions,
    );

    this.state.subscribe(() => this.render());
    this.render();
  }

  private buildAbilityBox(): void {
    for (const button of [this.useButton, this.confirmButton, this.cancelButton]) {
      button.type = 'button';
    }
    this.useButton.addEventListener('click', () => this.state.beginAbility());
    this.confirmButton.addEventListener('click', () => this.state.confirmAbility());
    this.cancelButton.addEventListener('click', () => this.state.cancelAbility());

    const head = el('div', 'ability-head');
    head.append(this.abilityNameEl, this.abilityStatusEl);

    const buttons = el('div', 'ability-actions');
    buttons.append(this.useButton, this.confirmButton, this.cancelButton);

    this.abilityBox.append(
      el('h2', undefined, 'Habilidade especial'),
      head,
      this.abilityDescEl,
      this.abilityHintEl,
      this.noticeEl,
      buttons,
    );
    this.abilityBox.hidden = true;
  }

  private render(): void {
    const phase = this.state.phase;
    const status = this.campaign.status;
    const canAct = phase === 'player';
    const floor = this.campaign.floorNumber;

    this.floorEl.textContent = `Andar ${floor}/${this.campaign.totalFloors}`;
    this.encounterEl.textContent = this.campaign.encounterLabel;
    this.encounterEl.className = `encounter-chip encounter-chip--${this.campaign.encounterType}`;
    this.floorNameEl.textContent = this.campaign.floor.name;
    this.modeEl.textContent = MODE_LABEL[status];
    this.modeEl.dataset.mode = status;

    this.turnEl.textContent = String(this.state.turn);
    this.phaseEl.textContent = PHASE_LABEL[phase];
    this.phaseEl.dataset.phase = phase;
    this.phaseEl.hidden = status !== 'fighting';
    this.passButton.disabled = !canAct;

    this.renderCampaignEnd(status, floor);
    this.renderTelegraphs();

    const selected = this.state.selectedUnit;
    const targeting = this.state.targeting;
    if (status === 'floor-cleared') {
      this.statusEl.textContent = `Andar ${floor} concluído. Avance quando quiser: o grupo mantém o PV atual.`;
    } else if (status === 'completed') {
      this.statusEl.textContent = 'Fim da campanha de teste. Reinicie para jogar de novo.';
    } else if (status === 'defeated') {
      this.statusEl.textContent = 'Fim de jogo. Reinicie a campanha para voltar ao andar 1.';
    } else if (!canAct) {
      this.statusEl.textContent = 'Aguarde: o turno está sendo resolvido.';
    } else if (targeting && selected) {
      this.statusEl.textContent = `${selected.definition.name}: escolhendo o alvo da habilidade.`;
    } else if (selected) {
      this.statusEl.textContent =
        `${selected.definition.name} selecionado. Clique em uma casa verde para mover ou use a habilidade. ` +
        'Depois disso os heróis atacam e os monstros respondem.';
    } else {
      this.statusEl.textContent = 'Clique em um herói para selecioná-lo ou passe a vez.';
    }

    this.renderCharacterStats(selected);
    this.renderAbility(selected, canAct);

    this.heroesEl.replaceChildren(...this.state.heroRoster.map((unit) => this.createUnitCard(unit)));
    this.monstersEl.replaceChildren(...this.state.monsterRoster.map((unit) => this.createUnitCard(unit)));

    const items = this.state.log.map((entry) => {
      const item = el('li', `log-${entry.kind}`);
      item.append(el('span', 'log-turn', `T${entry.turn}`), document.createTextNode(entry.message));
      return item;
    });
    this.logEl.replaceChildren(...items);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  /** Aviso dos golpes de chefe anunciados (some quando são resolvidos ou cancelados). */
  private renderTelegraphs(): void {
    const pending = this.state.pendingTelegraphs;
    this.telegraphBox.hidden = pending.length === 0;
    if (pending.length === 0) return;

    const lines = pending.map((intent) => {
      const line = el('p', 'telegraph-line');
      line.append(
        el('strong', undefined, `⚠ ${intent.bossName} está preparando ${intent.attackName}!`),
        document.createTextNode(
          ` As casas em vermelho serão atingidas (${intent.damage} de dano, ${intent.cells.length} casas).`,
        ),
      );
      return line;
    });
    const hint = el(
      'p',
      'telegraph-hint',
      'Mova um herói para fora da área antes da resolução — ou passe a vez e aceite o golpe.',
    );
    this.telegraphBox.replaceChildren(...lines, hint);
  }

  /** Banner de fim de andar/campanha e botão "Avançar" (só visível com o andar concluído). */
  private renderCampaignEnd(status: CampaignStatus, floor: number): void {
    this.bannerEl.hidden = status === 'fighting';
    this.advanceButton.hidden = status !== 'floor-cleared';
    this.resetButton.classList.toggle('btn-reset--highlight', status === 'defeated' || status === 'completed');

    switch (status) {
      case 'fighting':
        break;
      case 'floor-cleared':
        this.bannerEl.className = 'banner banner--cleared';
        this.bannerEl.textContent = `Andar ${floor} concluído! Todos os monstros foram derrotados.`;
        this.advanceButton.textContent = `Avançar para o andar ${floor + 1}`;
        break;
      case 'completed':
        this.bannerEl.className = 'banner banner--completed';
        this.bannerEl.textContent =
          'Campanha de teste concluída! O Ídolo do Abismo foi derrotado e todos os 10 andares foram vencidos.';
        break;
      case 'defeated':
        this.bannerEl.className = 'banner banner--defeat';
        this.bannerEl.textContent = `Derrota! Todos os heróis foram derrotados. A campanha terminou no andar ${floor}.`;
        break;
    }
  }


  /** Painel de atributos e progresso do herói selecionado. */
  private renderCharacterStats(selected: Unit | null): void {
    if (!selected || selected.definition.team !== 'hero' || !selected.progression) {
      this.characterStatsBox.hidden = true;
      this.characterStatsBox.replaceChildren();
      return;
    }

    const p = selected.progression;
    const needed = xpRequiredForNextLevel(p.level);
    const ratio = Math.max(0, Math.min(1, p.xp / needed));
    const header = el('div', 'character-stats__header');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;';
    header.append(
      el('h2', undefined, selected.definition.name),
      el('strong', undefined, `NÍVEL ${p.level}`),
    );

    const xpRow = el('div', 'character-stats__xp-row');
    xpRow.style.cssText = 'display:flex;justify-content:space-between;gap:8px;font-size:0.85rem;margin:6px 0;';
    xpRow.append(
      el('span', undefined, 'Experiência'),
      el('strong', undefined, `${p.xp} / ${needed} XP`),
    );
    const xpFill = el('div', 'character-stats__xp-fill');
    xpFill.style.cssText = `height:100%;width:${ratio * 100}%;background:#a78bfa;border-radius:inherit;transition:width 160ms ease;`;
    const xpBar = el('div', 'character-stats__xp-bar');
    xpBar.style.cssText = 'height:9px;background:#272536;border:1px solid #4b465e;border-radius:6px;overflow:hidden;';
    xpBar.append(xpFill);
    const remaining = el('p', 'character-stats__remaining', `Faltam ${Math.max(0, needed - p.xp)} XP para o próximo nível`);
    remaining.style.cssText = 'font-size:0.78rem;opacity:0.8;margin:5px 0 10px;';

    const stats = el('div', 'character-stats__grid');
    stats.style.cssText = 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;';
    const values: Array<[string, string]> = [
      ['PV', `${selected.hp} / ${selected.maxHp}`],
      ['Dano', String(selected.damage)],
      ['Força', String(p.attributes.strength)],
      ['Vitalidade', String(p.attributes.vitality)],
      ['Defesa', String(p.attributes.defense)],
      ['Pontos livres', String(p.unspentAttributePoints)],
    ];
    for (const [label, value] of values) {
      const tile = el('div', 'character-stats__tile');
      tile.style.cssText = 'background:#171923;border:1px solid #343746;padding:7px 9px;border-radius:4px;display:flex;justify-content:space-between;gap:6px;';
      tile.append(el('span', undefined, label), el('strong', undefined, value));
      stats.append(tile);
    }

    this.characterStatsBox.hidden = false;
    this.characterStatsBox.style.cssText = 'padding:12px;margin:8px 0;background:#20212b;border:1px solid #4b465e;border-radius:5px;color:#f3f0ff;';
    this.characterStatsBox.replaceChildren(header, xpRow, xpBar, remaining, stats);
  }

  /** Mostra nome, descrição, disponibilidade e controles da habilidade do herói selecionado. */
  private renderAbility(selected: Unit | null, canAct: boolean): void {
    const ability = selected?.definition.ability ?? null;
    if (!selected || !ability || !canAct) {
      this.abilityBox.hidden = true;
      return;
    }

    const used = selected.abilityUsed;
    const targeting = this.state.targeting;

    this.abilityBox.hidden = false;
    this.abilityNameEl.textContent = ability.name;
    this.abilityStatusEl.textContent = used ? 'Já utilizada' : 'Disponível';
    this.abilityStatusEl.className = `ability-status ability-status--${used ? 'used' : 'ready'}`;
    this.abilityDescEl.textContent = ability.description;

    // Escolhendo alvo: instrução do passo atual + Confirmar/Cancelar. Senão: botão "Usar".
    this.useButton.hidden = targeting !== null;
    this.useButton.disabled = !this.state.canUseAbility(selected);
    this.confirmButton.hidden = targeting === null;
    this.confirmButton.disabled = !this.state.canConfirmAbility;
    this.cancelButton.hidden = targeting === null;

    if (targeting) {
      this.abilityHintEl.textContent = this.state.targetingHint;
    } else if (used) {
      this.abilityHintEl.textContent = 'Esta habilidade já foi usada neste combate.';
    } else {
      this.abilityHintEl.textContent = 'Usar a habilidade substitui o movimento deste turno.';
    }

    const notice = this.state.notice;
    this.noticeEl.hidden = notice === null;
    this.noticeEl.textContent = notice ?? '';
  }

  private createUnitCard(unit: Unit): HTMLElement {
    const def = unit.definition;
    const isHero = def.team === 'hero';
    const alive = unit.hp > 0;

    let card: HTMLElement;
    if (isHero) {
      const button = el('button', 'unit-card');
      button.type = 'button';
      button.disabled = !alive || this.state.phase !== 'player';
      button.addEventListener('click', () => this.state.toggleSelection(unit.uid));
      card = button;
    } else {
      card = el('div', 'unit-card');
    }

    if (!alive) {
      card.classList.add('dead');
    } else if (unit.uid === this.state.selectedUid) {
      card.classList.add('selected');
    }

    const rank: EncounterType = isHero ? 'normal' : (def.rank ?? 'normal');
    const badgeClass = isHero ? 'badge' : rank === 'normal' ? 'badge badge--monster' : `badge badge--monster badge--${rank}`;
    const badge = el('span', badgeClass, def.symbol);
    badge.style.background = cssColor(def.color);

    const name = el('span', 'unit-name', def.name);
    if (rank !== 'normal') name.append(el('span', `unit-rank unit-rank--${rank}`, RANK_LABEL[rank]));

    const top = el('div', 'unit-top');
    top.append(name, el('span', 'unit-hp', `PV ${unit.hp}/${unit.maxHp}`));

    const fill = el('div', 'hp-fill');
    const ratio = Math.max(0, Math.min(1, unit.hp / unit.maxHp));
    fill.style.width = `${ratio * 100}%`;
    if (ratio <= 0.25) {
      fill.classList.add('hp-fill--low');
    } else if (ratio <= 0.5) {
      fill.classList.add('hp-fill--mid');
    }
    const bar = el('div', 'hp-bar');
    bar.append(fill);

    const info = el('div', 'unit-info');
    info.append(top, bar, el('div', 'unit-stats', this.statsText(unit, alive)));

    card.append(badge, info);
    return card;
  }

  private statsText(unit: Unit, alive: boolean): string {
    if (!alive) return 'Derrotado';
    const def = unit.definition;
    let text = `Dano ${unit.damage} · Mov ${def.movement}`;
    if (def.ability) {
      text += ` · ${def.ability.name}: ${unit.abilityUsed ? 'usada' : 'pronta'}`;
    }
    if (unit.stunned) text += ' · Atordoado';
    return text;
  }
}