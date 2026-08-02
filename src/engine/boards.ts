import boardsJson from '../data/boards.json';
import type { BoardConfig } from './types';

export const BOARDS: BoardConfig[] = boardsJson.boards as BoardConfig[];

export function getBoard(id: number): BoardConfig {
  const board = BOARDS.find((b) => b.id === id);
  if (!board) throw new Error(`Unknown board id: ${id}`);
  return board;
}

/** Expected value of a set of remaining case values. */
export function expectedValue(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
