import type { Position, UnitSize } from './types';

export const BOARD_COLS = 6;
export const BOARD_ROWS = 6;

export const TILE_SIZE = 96;
export const BOARD_MARGIN = 40;

export const BOARD_WIDTH = BOARD_COLS * TILE_SIZE;
export const BOARD_HEIGHT = BOARD_ROWS * TILE_SIZE;

export const GAME_WIDTH = BOARD_WIDTH + BOARD_MARGIN * 2;
export const GAME_HEIGHT = BOARD_HEIGHT + BOARD_MARGIN * 2;

export const SYMBOL_FONT =
  '"Segoe UI Symbol", "Noto Sans Symbols 2", "Noto Sans Symbols", "DejaVu Sans", Arial, sans-serif';

export const COLORS = {
  frame: 0x334155,
  tileLight: 0x2b3a55,
  tileDark: 0x213047,
  tileBorder: 0x0f172a,
  validMove: 0x4ade80,
  selection: 0xfacc15,
  hover: 0xffffff,
  monsterBorder: 0xfca5a5,
  hpHigh: 0x4ade80,
  hpMid: 0xfacc15,
  hpLow: 0xef4444,
} as const;

/** Converte uma casa (coluna, linha) para o pixel do centro dela. */
export function cellToPixel(cell: Position): { x: number; y: number } {
  return {
    x: BOARD_MARGIN + cell.col * TILE_SIZE + TILE_SIZE / 2,
    y: BOARD_MARGIN + cell.row * TILE_SIZE + TILE_SIZE / 2,
  };
}
/** Pixel do centro da área ocupada por uma entidade (1×1: o centro da casa; 2×2: o centro das 4 casas). */
export function footprintCenterPixel(
  anchor: Position,
  size: UnitSize = { width: 1, height: 1 },
): { x: number; y: number } {
  const { x, y } = cellToPixel(anchor);
  return {
    x: x + ((size.width - 1) * TILE_SIZE) / 2,
    y: y + ((size.height - 1) * TILE_SIZE) / 2,
  };
}