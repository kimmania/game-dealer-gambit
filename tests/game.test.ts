import { describe, it, expect } from 'vitest';
import {
  createGame, pickCase, openCase, deal, noDeal, finalSwap,
  peek, useFormulaLeak, useCaseSwap, boardEV, remainingCases,
  ELIMINATION_SCHEDULE, NO_INTEL, toRecord, type GameState,
} from '../src/engine/game';
import { getBoard } from '../src/engine/boards';
import { baseOffer } from '../src/engine/dealer';
import type { GameRecord } from '../src/engine/types';

/** Play to the first offer: pick case 0, open the first N available cases. */
function toFirstOffer(state: GameState): GameState {
  let s = pickCase(state, 0);
  for (let i = 0; i < ELIMINATION_SCHEDULE[0]; i++) {
    const [c] = remainingCases(s);
    s = openCase(s, c);
  }
  return s;
}

describe('game state machine', () => {
  it('deals 26 cases from the board value table', () => {
    const s = createGame(1, 1234);
    expect(s.caseValues).toHaveLength(26);
    expect(s.caseValues.slice().sort((a, b) => a - b))
      .toEqual(getBoard(1).values.slice().sort((a, b) => a - b));
  });

  it('follows pick → eliminate → offer flow with the 6,5,4,3,2,1... schedule', () => {
    let s = toFirstOffer(createGame(1, 99));
    expect(s.phase).toBe('offer');
    expect(s.round).toBe(1);
    expect(s.openedCases.size).toBe(6);
    expect(s.currentOffer).not.toBeNull();
    // No Deal → round 2, 5 cases to open.
    s = noDeal(s);
    expect(s.phase).toBe('eliminate');
    expect(s.round).toBe(2);
    expect(s.casesToOpenThisRound).toBe(5);
  });

  it('DEAL ends the game at the offer value', () => {
    const s = deal(toFirstOffer(createGame(1, 7)));
    expect(s.phase).toBe('done');
    expect(s.result?.outcome).toBe('deal');
    expect(s.result?.payout).toBe(s.result?.offerTaken);
  });

  it('full no-deal run reaches final swap and pays the held case', () => {
    let s = toFirstOffer(createGame(1, 55));
    while (s.phase === 'offer') {
      s = noDeal(s);
      while (s.phase === 'eliminate') {
        const [c] = remainingCases(s);
        s = openCase(s, c);
      }
    }
    expect(s.phase).toBe('finalSwap');
    expect(remainingCases(s)).toHaveLength(1);
    const held = s.caseValues[s.playerCase!];
    const keep = finalSwap(s, false);
    expect(keep.result?.payout).toBe(held);
    expect(keep.result?.swappedAtEnd).toBe(false);
    const swapped = finalSwap(s, true);
    expect(swapped.result?.swappedAtEnd).toBe(true);
    expect(swapped.result?.payout).toBe(s.caseValues[remainingCases(s)[0]]);
  });

  it('rejects illegal moves', () => {
    const s = createGame(1, 5);
    expect(() => openCase(s, 3)).toThrow();
    const p = pickCase(s, 0);
    expect(() => openCase(p, 0)).toThrow('own case');
    expect(() => deal(p)).toThrow();
  });

  it('tracks live EV after every elimination', () => {
    let s = pickCase(createGame(1, 42), 0);
    const fullEv = getBoard(1).values.reduce((a, b) => a + b, 0) / 26;
    expect(boardEV(s)).toBeCloseTo(fullEv);
    const [c] = remainingCases(s);
    const removed = s.caseValues[c];
    s = openCase(s, c);
    expect(boardEV(s)).toBeCloseTo((fullEv * 26 - removed) / 25);
  });

  it('offer matches EV × curve (board 1: 60% round 1)', () => {
    const s = toFirstOffer(createGame(1, 4242));
    expect(s.currentOffer!.offer).toBe(baseOffer(boardEV(s), 1, getBoard(1)));
  });

  it('is deterministic: same seed + history → same cases and same offer', () => {
    const history: GameRecord[] = [
      { boardId: 2, dealRound: 7, payout: 5000, caseValue: 5, startingEv: 10000 },
      { boardId: 2, dealRound: 8, payout: 5000, caseValue: 5, startingEv: 10000 },
      { boardId: 2, dealRound: null, payout: 5000, caseValue: 5, startingEv: 10000 },
    ];
    const a = toFirstOffer(createGame(2, 777, history));
    const b = toFirstOffer(createGame(2, 777, history));
    expect(a.caseValues).toEqual(b.caseValues);
    expect(a.reputation).toBe('fearless');
    expect(a.currentOffer).toEqual(b.currentOffer);
    // Different seed → (almost surely) different deal.
    const c = createGame(2, 778, history);
    expect(c.caseValues).not.toEqual(a.caseValues);
  });
});

describe('intel items', () => {
  it('Peek reveals one case value before picking, once only', () => {
    let s = createGame(1, 11, [], { ...NO_INTEL, peek: true });
    s = peek(s, 12);
    expect(s.peeked.get(12)).toBe(s.caseValues[12]);
    expect(() => peek(s, 13)).toThrow();
    expect(() => peek(pickCase(s, 0), 14)).toThrow('before picking');
  });

  it('Formula Leak exposes the exact offer % for one round', () => {
    let s = createGame(1, 21, [], { ...NO_INTEL, formulaLeak: true });
    s = toFirstOffer(s);
    s = useFormulaLeak(s);
    expect(s.leakedOfferPct).toBeCloseTo(0.6, 2);
    expect(s.leakAvailable).toBe(false);
    expect(() => useFormulaLeak(s)).toThrow();
  });

  it('Case Swap swaps the held case once mid-game', () => {
    let s = createGame(1, 31, [], { ...NO_INTEL, caseSwap: true });
    s = toFirstOffer(s);
    const target = remainingCases(s)[0];
    s = useCaseSwap(s, target);
    expect(s.playerCase).toBe(target);
    expect(s.swapAvailable).toBe(false);
    expect(() => useCaseSwap(s, 1)).toThrow();
  });

  it('Insurance pays 25% of the difference on a mis-deal, 0 on a good deal', () => {
    // Find a seed where case value > offer (mis-deal).
    let misdeal: GameState | null = null;
    let goodDeal: GameState | null = null;
    for (let seed = 1; seed < 200 && (!misdeal || !goodDeal); seed++) {
      const s = toFirstOffer(createGame(1, seed, [], { ...NO_INTEL, insurance: true }));
      const cv = s.caseValues[s.playerCase!];
      if (cv > s.currentOffer!.offer && !misdeal) misdeal = s;
      if (cv < s.currentOffer!.offer && !goodDeal) goodDeal = s;
    }
    expect(misdeal).not.toBeNull();
    expect(goodDeal).not.toBeNull();
    const m = deal(misdeal!);
    const expected = Math.round(0.25 * (m.result!.caseValue - m.result!.offerTaken!));
    expect(m.result!.insurancePayout).toBe(expected);
    expect(m.result!.payout).toBe(m.result!.offerTaken! + expected);
    expect(deal(goodDeal!).result!.insurancePayout).toBe(0);
  });

  it('Board 5 denies insurance', () => {
    const s = createGame(5, 1, [], { ...NO_INTEL, insurance: true });
    expect(s.insuranceAvailable).toBe(false);
  });
});

describe('history record', () => {
  it('records deal round for deals, null for holds', () => {
    const s = deal(toFirstOffer(createGame(1, 7)));
    const r = toRecord(s, boardEV(createGame(1, 7)));
    expect(r.dealRound).toBe(1);
    expect(r.payout).toBe(s.result!.payout);
  });
});
