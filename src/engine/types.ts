export interface BoardConfig {
  id: number;
  name: string;
  theme: string;
  topPrize: number;
  /** 26 case values. */
  values: number[];
  /** Base offer as % of EV, one entry per round (9 rounds). */
  offerCurve: number[];
  /** Cumulative-winnings threshold to clear the board. */
  threshold: number;
  adaptation: {
    enabled: boolean;
    /** Minimum recorded games before the Dealer adapts on this board. */
    minGames: number;
    /** Board 4+: streak/cold adjustments active. */
    streakAware: boolean;
  };
  /** Board 5: Dealer denies Insurance intel. */
  insuranceDenied: boolean;
}

export type Reputation = 'neutral' | 'fearless' | 'cautious' | 'streaky' | 'cold';

/** One recorded finished game, used to derive reputation. */
export interface GameRecord {
  boardId: number;
  /** Round the player dealt (1..9), or null if they held to the end. */
  dealRound: number | null;
  payout: number;
  caseValue: number;
  /** Board EV at game start. */
  startingEv: number;
}

export interface IntelLoadout {
  peek: boolean;
  formulaLeak: boolean;
  caseSwap: boolean;
  insurance: boolean;
}

export type Phase = 'pick' | 'eliminate' | 'offer' | 'finalSwap' | 'done';

export interface GameResult {
  outcome: 'deal' | 'hold';
  payout: number;
  caseValue: number;
  offerTaken: number | null;
  insurancePayout: number;
  swappedAtEnd: boolean;
}
