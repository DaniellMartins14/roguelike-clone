import type { TelegraphConfig, TelegraphedAttack } from '../types';

/**
 * Ataques telegrafados dos chefes. Só dados: o formato da área vive em core/telegraph.ts, a
 * resolução no GameState. Para um novo chefe, basta montar uma `TelegraphConfig` com estes (ou
 * novos) ataques e colocá-la na definição dele.
 *
 * Referência de dano: heróis têm 16-30 PV; o corpo a corpo do Ídolo causa 8.
 *
 * Calibração (bot simples, 400 campanhas, golpes de 10 e 12 com 1 turno de pausa): quem ignora o
 * aviso vence o Ídolo em ~17% das tentativas; quem considera as casas vermelhas ao se mover, em
 * ~73%. Com golpes de 9/10 a diferença era pequena (50% x 77%), então o aviso quase não importava.
 */

/**
 * Varredura do Abismo: atinge a LINHA INTEIRA (6 casas) do herói mais próximo do chefe.
 * É 1/6 do tabuleiro; basta um herói dar um passo para outra linha para escapar.
 */
export const ABYSS_SWEEP: TelegraphedAttack = {
  id: 'abyss-sweep',
  name: 'Varredura do Abismo',
  pattern: 'row',
  targeting: 'nearest-hero',
  damage: 10,
};

/**
 * Pilar do Abismo: CRUZ de 5 casas (a casa do herói mais ferido e as 4 vizinhas ortogonais).
 * Um passo na diagonal já tira o herói da área.
 */
export const ABYSS_PILLAR: TelegraphedAttack = {
  id: 'abyss-pillar',
  name: 'Pilar do Abismo',
  pattern: 'cross',
  targeting: 'lowest-hp-hero',
  damage: 12,
};

/** O Ídolo alterna Varredura e Pilar, com um turno livre entre os golpes. */
export const ABYSS_IDOL_TELEGRAPH: TelegraphConfig = {
  attacks: [ABYSS_SWEEP, ABYSS_PILLAR],
  cooldownTurns: 1,
};
