import { mulberry32, shuffled } from './rng';
import { getBoard } from './boards';
import { adjustOffer, baseOffer, deriveReputation, type OfferDecision } from './dealer';
import type { BoardConfig, GameRecord, GameResult, IntelLoadout, Phase, Reputation } from './types';

/** Cases eliminated per round: 6,5,4,3,2 then 1s (spec §3.1). 9 rounds, 24 cases. */
export const ELIMINATION_SCHEDULE = [6, 5, 4, 3, 2, 1, 1, 1, 1] as const;
export const CASE_COUNT = 26;

export const NO_INTEL: IntelLoadout = { peek: false, formulaLeak: false, caseSwap: false, insurance: false };

export interface GameState {
  board: BoardConfig;
  seed: number;
  caseValues: number[];
  playerCase: number | null;
  openedCases: Set<number>;
  peeked: Map<number, number>;
  peekUsed: boolean;
  phase: Phase;
  round: number;
  casesToOpenThisRound: number;
  currentOffer: OfferDecision | null;
  /** Exact offer % exposed by Formula Leak for the current round, else null. */
  leakedOfferPct: number | null;
  leakAvailable: boolean;
  swapAvailable: boolean;
  insuranceAvailable: boolean;
  reputation: Reputation;
  result: GameResult | null;
}

export function createGame(
  boardId: number,
  seed: number,
  history: readonly GameRecord[] = [],
  intel: IntelLoadout = NO_INTEL,
): GameState {
  const board = getBoard(boardId);
  if (board.values.length !== CASE_COUNT) throw new Error(`Board ${boardId} must have ${CASE_COUNT} values`);
  const rand = mulberry32(seed);
  return {
    board,
    seed,
    caseValues: shuffled(board.values, rand),
    playerCase: null,
    openedCases: new Set(),
    peeked: new Map(),
    peekUsed: false,
    phase: 'pick',
    round: 0,
    casesToOpenThisRound: 0,
    currentOffer: null,
    leakedOfferPct: null,
    leakAvailable: intel.formulaLeak,
    swapAvailable: intel.caseSwap,
    insuranceAvailable: intel.insurance && !board.insuranceDenied,
    reputation: history.length >= board.adaptation.minGames ? deriveReputation(history) : 'neutral',
    result: null,
  };
}

/** Live EV over all unopened cases (player's case still in play). */
export function boardEV(state: GameState): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < state.caseValues.length; i++) {
    if (!state.openedCases.has(i)) {
      sum += state.caseValues[i];
      n++;
    }
  }
  return n === 0 ? 0 : sum / n;
}

export function remainingCases(state: GameState): number[] {
  const out: number[] = [];
  for (let i = 0; i < state.caseValues.length; i++) {
    if (!state.openedCases.has(i) && i !== state.playerCase) out.push(i);
  }
  return out;
}

/** Intel: Peek — reveal one case's value before picking (spec §3.3). */
export function peek(state: GameState, caseId: number): GameState {
  if (state.phase !== 'pick') throw new Error('Peek only before picking');
  if (state.peekUsed) throw new Error('Peek already used');
  if (caseId < 0 || caseId >= CASE_COUNT) throw new Error('Invalid case');
  const peeked = new Map(state.peeked);
  peeked.set(caseId, state.caseValues[caseId]);
  return { ...state, peeked, peekUsed: true };
}

export function pickCase(state: GameState, caseId: number): GameState {
  if (state.phase !== 'pick') throw new Error('Not in pick phase');
  if (caseId < 0 || caseId >= CASE_COUNT) throw new Error('Invalid case');
  return advanceToElimination({ ...state, playerCase: caseId, phase: 'eliminate', round: 1 });
}

function advanceToElimination(state: GameState): GameState {
  return { ...state, phase: 'eliminate', casesToOpenThisRound: ELIMINATION_SCHEDULE[state.round - 1] };
}

export function openCase(state: GameState, caseId: number): GameState {
  if (state.phase !== 'eliminate') throw new Error('Not in eliminate phase');
  if (caseId === state.playerCase) throw new Error('Cannot open your own case');
  if (state.openedCases.has(caseId)) throw new Error('Case already opened');
  const openedCases = new Set(state.openedCases);
  openedCases.add(caseId);
  const left = state.casesToOpenThisRound - 1;
  let next: GameState = { ...state, openedCases, casesToOpenThisRound: left };
  if (left === 0) next = makeOffer(next);
  return next;
}

function makeOffer(state: GameState): GameState {
  const ev = boardEV(state);
  const base = baseOffer(ev, state.round, state.board);
  const decision = adjustOffer(base, ev, state.round, state.reputation, state.board);
  return { ...state, phase: 'offer', currentOffer: decision };
}

/** Intel: Formula Leak — expose the exact offer % for this round. */
export function useFormulaLeak(state: GameState): GameState {
  if (!state.leakAvailable) throw new Error('Formula Leak not available');
  if (state.phase !== 'offer' || !state.currentOffer) throw new Error('No offer on the table');
  const ev = boardEV(state);
  return {
    ...state,
    leakAvailable: false,
    leakedOfferPct: ev > 0 ? state.currentOffer.offer / ev : 0,
  };
}

/** Intel: Case Swap — once mid-game, swap your case with any unopened case. */
export function useCaseSwap(state: GameState, newCaseId: number): GameState {
  if (!state.swapAvailable) throw new Error('Case Swap not available');
  if (state.phase !== 'eliminate' && state.phase !== 'offer') throw new Error('Swap only mid-game');
  if (state.openedCases.has(newCaseId)) throw new Error('Cannot swap with an opened case');
  if (newCaseId === state.playerCase) throw new Error('Already holding that case');
  return { ...state, playerCase: newCaseId, swapAvailable: false };
}

export function deal(state: GameState): GameState {
  if (state.phase !== 'offer' || !state.currentOffer || state.playerCase === null) {
    throw new Error('No offer to accept');
  }
  const caseValue = state.caseValues[state.playerCase];
  const offer = state.currentOffer.offer;
  // Intel: Insurance — mis-deal pays 25% of the difference (spec §3.3).
  const insurancePayout =
    state.insuranceAvailable && caseValue > offer ? Math.round(0.25 * (caseValue - offer)) : 0;
  return {
    ...state,
    phase: 'done',
    result: {
      outcome: 'deal',
      payout: offer + insurancePayout,
      caseValue,
      offerTaken: offer,
      insurancePayout,
      swappedAtEnd: false,
    },
  };
}

export function noDeal(state: GameState): GameState {
  if (state.phase !== 'offer') throw new Error('No offer to decline');
  const cleared: GameState = { ...state, currentOffer: null, leakedOfferPct: null };
  if (state.round >= ELIMINATION_SCHEDULE.length) {
    // Two cases remain: player's + one other → optional final swap (spec §3.1.6).
    return { ...cleared, phase: 'finalSwap' };
  }
  return advanceToElimination({ ...cleared, round: state.round + 1 });
}

/** Final two-case decision: keep your case or swap for the last remaining one. */
export function finalSwap(state: GameState, swap: boolean): GameState {
  if (state.phase !== 'finalSwap' || state.playerCase === null) throw new Error('Not in final swap');
  const remaining = remainingCases(state);
  if (remaining.length !== 1) throw new Error('Final swap requires exactly one other case');
  const finalCase = swap ? remaining[0] : state.playerCase;
  const caseValue = state.caseValues[finalCase];
  return {
    ...state,
    playerCase: finalCase,
    phase: 'done',
    result: { outcome: 'hold', payout: caseValue, caseValue, offerTaken: null, insurancePayout: 0, swappedAtEnd: swap },
  };
}

/** Convert a finished game into a history record for reputation tracking. */
export function toRecord(state: GameState, startingEv: number): GameRecord {
  if (!state.result) throw new Error('Game not finished');
  return {
    boardId: state.board.id,
    dealRound: state.result.outcome === 'deal' ? state.round : null,
    payout: state.result.payout,
    caseValue: state.result.caseValue,
    startingEv,
  };
}
