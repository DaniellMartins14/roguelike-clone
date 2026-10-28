import type { UnitSize } from '../types';

/** Tamanho padrão de toda entidade. */
export const SIZE_1X1: UnitSize = { width: 1, height: 1 };

/** Tamanho especial para criaturas colossais. É o máximo suportado (não existem 3×3 ou maiores). */
export const SIZE_2X2: UnitSize = { width: 2, height: 2 };
