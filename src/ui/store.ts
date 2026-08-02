import type { GameRecord } from '../engine/types';

export interface IntelInventory {
  peek: number;
  formulaLeak: number;
  caseSwap: number;
  insurance: number;
}

export interface NotableGame {
  kind: 'biggestDeal' | 'worstBeat' | 'longestHold';
  boardId: number;
  boardName: string;
  payout: number;
  detail: string;
  when: number;
}

export interface Settings {
  sound: boolean;
  music: boolean;
  reducedMotion: boolean;
  colorBlind: boolean;
  tutorialDone: boolean;
}

export interface CampaignState {
  bank: number;
  /** Cumulative winnings per board id. */
  boardWinnings: Record<number, number>;
  /** Games played per board id (for star 2). */
  boardGames: Record<number, number>;
  /** Perfect game achieved per board id. */
  boardPerfect: Record<number, boolean>;
  unlockedBoard: number;
  history: GameRecord[];
  intel: IntelInventory;
  casebook: NotableGame[];
  settings: Settings;
}

const KEY = 'dealers-gambit-v1';

const DEFAULTS: CampaignState = {
  bank: 0,
  boardWinnings: {},
  boardGames: {},
  boardPerfect: {},
  unlockedBoard: 1,
  history: [],
  intel: { peek: 0, formulaLeak: 0, caseSwap: 0, insurance: 0 },
  casebook: [],
  settings: { sound: true, music: true, reducedMotion: false, colorBlind: false, tutorialDone: false },
};

export function loadCampaign(): CampaignState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const parsed = JSON.parse(raw) as Partial<CampaignState>;
    return {
      ...structuredClone(DEFAULTS),
      ...parsed,
      intel: { ...DEFAULTS.intel, ...(parsed.intel ?? {}) },
      settings: { ...DEFAULTS.settings, ...(parsed.settings ?? {}) },
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export function saveCampaign(state: CampaignState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export const INTEL_PRICES: Record<keyof IntelInventory, number> = {
  peek: 500,
  formulaLeak: 750,
  caseSwap: 1200,
  insurance: 1500,
};

export const INTEL_INFO: Record<keyof IntelInventory, { icon: string; name: string; desc: string }> = {
  peek: { icon: '👁', name: 'Peek', desc: 'Reveal the contents of 1 case before picking yours.' },
  formulaLeak: { icon: '📠', name: 'Formula Leak', desc: "Expose the exact % of EV behind this round's offer." },
  caseSwap: { icon: '🔄', name: 'Case Swap', desc: 'Once mid-game, swap your case with any unopened case.' },
  insurance: { icon: '🛡', name: 'Insurance', desc: 'If you deal and your case was worth more, get 25% of the difference.' },
};
