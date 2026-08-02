import { describe, it, expect } from 'vitest';
import { getBoard, BOARDS, expectedValue } from '../src/engine/boards';
import { baseOffer, adjustOffer, deriveReputation, MAX_ADJUSTMENT_PCT } from '../src/engine/dealer';
import type { GameRecord } from '../src/engine/types';

describe('boards', () => {
  it('has 5 boards, each with 26 values, 9-curve, top prize present', () => {
    expect(BOARDS).toHaveLength(5);
    for (const b of BOARDS) {
      expect(b.values).toHaveLength(26);
      expect(b.offerCurve).toHaveLength(9);
      expect(b.values).toContain(b.topPrize);
      // Curves rise toward their end cap per spec §4.2.
      expect(b.offerCurve[8]).toBeGreaterThan(b.offerCurve[0]);
    }
    expect(getBoard(1).offerCurve[0]).toBeCloseTo(0.6);
    expect(getBoard(1).offerCurve[8]).toBeCloseTo(0.95);
    expect(getBoard(5).offerCurve[0]).toBeCloseTo(0.45);
    expect(getBoard(5).offerCurve[8]).toBeCloseTo(0.85);
    expect(getBoard(5).insuranceDenied).toBe(true);
  });
});

describe('EV + base offer curve', () => {
  it('computes expected value', () => {
    expect(expectedValue([10, 20, 30])).toBe(20);
    expect(expectedValue([])).toBe(0);
  });
  it('base offer = EV × curve pct, rounded', () => {
    const b = getBoard(1);
    expect(baseOffer(10000, 1, b)).toBe(6000);
    expect(baseOffer(10000, 9, b)).toBe(9500);
    const b5 = getBoard(5);
    expect(baseOffer(200000, 1, b5)).toBe(90000);
  });
});

const rec = (dealRound: number | null, payout: number, startingEv = 10000): GameRecord => ({
  boardId: 2, dealRound, payout, caseValue: 5000, startingEv,
});

describe('reputation derivation', () => {
  it('neutral with too little history', () => {
    expect(deriveReputation([rec(1, 100), rec(9, 9000)])).toBe('neutral');
  });
  it('fearless: rarely deals before round 6', () => {
    expect(deriveReputation([rec(7, 5000), rec(8, 5000), rec(null, 5000)])).toBe('fearless');
  });
  it('cautious: deals early', () => {
    expect(deriveReputation([rec(1, 5000), rec(2, 5000), rec(3, 5000)])).toBe('cautious');
  });
  it('streaky: 3+ of last 5 above starting EV', () => {
    const h = [rec(1, 20000), rec(2, 15000), rec(3, 12000), rec(1, 100), rec(2, 100)];
    expect(deriveReputation(h)).toBe('streaky');
  });
  it('cold: 3+ of last 5 below 25% of starting EV', () => {
    const h = [rec(1, 100), rec(2, 100), rec(3, 100), rec(9, 99999), rec(9, 99999)];
    expect(deriveReputation(h)).toBe('cold');
  });
});

describe('adaptive dealer adjustments', () => {
  const ev = 50000;
  const base = 30000;
  it('board 1 never adapts (naive dealer)', () => {
    const d = adjustOffer(base, ev, 1, 'fearless', getBoard(1));
    expect(d.offer).toBe(base);
    expect(d.adjustmentPct).toBe(0);
  });
  it('fearless: offers drop below base', () => {
    const d = adjustOffer(base, ev, 3, 'fearless', getBoard(2));
    expect(d.offer).toBeLessThan(base);
    expect(d.offer).toBe(base - 0.08 * ev);
  });
  it('cautious: early offers inflated, fades late', () => {
    expect(adjustOffer(base, ev, 2, 'cautious', getBoard(2)).offer).toBe(base + 0.06 * ev);
    expect(adjustOffer(base, ev, 5, 'cautious', getBoard(2)).offer).toBe(base + 0.03 * ev);
    expect(adjustOffer(base, ev, 8, 'cautious', getBoard(2)).offer).toBe(base);
  });
  it('streaky: tightens on streak-aware boards only', () => {
    expect(adjustOffer(base, ev, 4, 'streaky', getBoard(4)).offer).toBe(base - 0.05 * ev);
    expect(adjustOffer(base, ev, 4, 'streaky', getBoard(2)).offer).toBe(base);
  });
  it('cold: softens on streak-aware boards only', () => {
    expect(adjustOffer(base, ev, 4, 'cold', getBoard(5)).offer).toBe(base + 0.04 * ev);
    expect(adjustOffer(base, ev, 4, 'cold', getBoard(3)).offer).toBe(base);
  });
  it('every reputation stays within ±8% of EV across all boards and rounds', () => {
    for (const rep of ['fearless', 'cautious', 'streaky', 'cold', 'neutral'] as const) {
      for (const board of BOARDS) {
        for (let round = 1; round <= 9; round++) {
          const d = adjustOffer(base, ev, round, rep, board);
          expect(Math.abs(d.offer - base)).toBeLessThanOrEqual(MAX_ADJUSTMENT_PCT * ev + 1);
        }
      }
    }
  });
  it('is a pure function: same inputs → same offer', () => {
    const a = adjustOffer(base, ev, 3, 'fearless', getBoard(3));
    const b = adjustOffer(base, ev, 3, 'fearless', getBoard(3));
    expect(a).toEqual(b);
  });
});
