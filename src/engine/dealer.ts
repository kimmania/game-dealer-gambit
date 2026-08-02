import type { BoardConfig, GameRecord, Reputation } from './types';

/** Hard cap from spec §4.1: adjustments shift EV by at most ±8%. */
export const MAX_ADJUSTMENT_PCT = 0.08;

const HISTORY_WINDOW = 5;
const MIN_HISTORY = 3;

/**
 * Derive the player's reputation from recorded game history.
 * Pure and deterministic (spec §7: no black box).
 */
export function deriveReputation(history: readonly GameRecord[]): Reputation {
  if (history.length < MIN_HISTORY) return 'neutral';
  const recent = history.slice(-HISTORY_WINDOW);

  // Streak / cold (recency-based) take priority.
  const hotWins = recent.filter((g) => g.payout > g.startingEv).length;
  if (hotWins >= 3) return 'streaky';
  const badBeats = recent.filter((g) => g.payout < 0.25 * g.startingEv).length;
  if (badBeats >= 3) return 'cold';

  // Dealing temperament across full history. Held-to-end counts as round 9.
  const avgDealRound =
    history.reduce((sum, g) => sum + (g.dealRound ?? 9), 0) / history.length;
  if (avgDealRound >= 6) return 'fearless';
  if (avgDealRound <= 3) return 'cautious';
  return 'neutral';
}

export interface OfferDecision {
  baseOffer: number;
  offer: number;
  /** Signed fraction of EV the adjustment moved the offer (0 on board 1 / neutral). */
  adjustmentPct: number;
  reputationApplied: Reputation;
}

/**
 * The Adaptive Dealer (spec §3.2). Pure deterministic function of
 * (base offer, EV, round, reputation, board config).
 *
 * - fearless: offers stay below base (he thinks you'll crack late)
 * - cautious: early offers inflated (buy you out before you go deep)
 * - streaky:  offers tighten (respects your heat)
 * - cold:     offers soften (wants you back at the table)
 *
 * All adjustments bounded to ±8% of EV (spec §4.1).
 */
export function adjustOffer(
  baseOffer: number,
  ev: number,
  round: number,
  reputation: Reputation,
  board: BoardConfig,
): OfferDecision {
  let deltaPct = 0;
  let applied: Reputation = 'neutral';

  if (board.adaptation.enabled && reputation !== 'neutral') {
    applied = reputation;
    switch (reputation) {
      case 'fearless':
        deltaPct = -0.08;
        break;
      case 'cautious':
        // Generous early, fading as the game goes deep.
        deltaPct = round <= 4 ? 0.06 : round <= 6 ? 0.03 : 0;
        break;
      case 'streaky':
        deltaPct = board.adaptation.streakAware ? -0.05 : 0;
        break;
      case 'cold':
        deltaPct = board.adaptation.streakAware ? 0.04 : 0;
        break;
    }
  }

  // Bound the adjustment to ±8% of EV, always.
  const cappedDelta = Math.max(-MAX_ADJUSTMENT_PCT, Math.min(MAX_ADJUSTMENT_PCT, deltaPct));
  const offer = Math.max(0, Math.round(baseOffer + cappedDelta * ev));
  return { baseOffer, offer, adjustmentPct: cappedDelta, reputationApplied: applied };
}

/** Base offer: board EV × round percentage from the board's pinned curve. */
export function baseOffer(ev: number, round: number, board: BoardConfig): number {
  const pct = board.offerCurve[round - 1];
  if (pct === undefined) throw new Error(`No offer curve entry for round ${round}`);
  return Math.round(ev * pct);
}
