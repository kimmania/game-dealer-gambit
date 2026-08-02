import { BOARDS } from '../engine/boards';
import { deriveReputation } from '../engine/dealer';
import { loadCampaign, saveCampaign, INTEL_PRICES, INTEL_INFO } from './store';
import type { CampaignState, IntelInventory } from './store';
import { mountGame } from './game';

export const fmt = (n: number): string => '$' + Math.round(n).toLocaleString('en-US');

export function el(tag: string, cls = '', text = ''): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

type Screen = 'menu' | 'boards' | 'tellsheet' | 'shop' | 'casebook';

let app: HTMLElement;
let campaign: CampaignState;

function persist(): void {
  saveCampaign(campaign);
}

function topbar(title: string, showBack: boolean): HTMLElement {
  const bar = el('div', 'topbar');
  if (showBack) {
    const back = document.createElement('button');
    back.className = 'btn-nav';
    back.textContent = '← MENU';
    back.addEventListener('click', () => go('menu'));
    bar.appendChild(back);
  } else {
    bar.appendChild(el('span', '', ''));
  }
  bar.appendChild(el('span', 'topbar-title', title));
  bar.appendChild(el('span', 'bank', fmt(campaign.bank)));
  return bar;
}

function go(screen: Screen): void {
  campaign = loadCampaign();
  app.innerHTML = '';
  switch (screen) {
    case 'menu': renderMenu(); break;
    case 'boards': renderBoards(); break;
    case 'tellsheet': renderTellSheet(); break;
    case 'shop': renderShop(); break;
    case 'casebook': renderCasebook(); break;
  }
}

/* ---------- Menu ---------- */

function renderMenu(): void {
  app.appendChild(el('div', 'menu-logo', '🎰'));
  app.appendChild(el('h1', 'menu-title', "DEALER'S GAMBIT"));
  app.appendChild(el('p', 'menu-tag', 'A case-elimination duel against an adaptive Dealer.'));

  const nav = el('div', 'menu-nav');
  const item = (icon: string, label: string, fn: () => void): void => {
    const b = document.createElement('button');
    b.className = 'menu-btn';
    b.appendChild(el('span', 'menu-icon', icon));
    b.appendChild(el('span', '', label));
    b.addEventListener('click', fn);
    nav.appendChild(b);
  };
  item('▶', 'PLAY', () => go('boards'));
  item('📋', 'TELL SHEET', () => go('tellsheet'));
  item('🕵️', 'INTEL SHOP', () => go('shop'));
  item('📖', 'CASEBOOK', () => go('casebook'));
  item('⚙️', 'SETTINGS', () => openSettings());
  app.appendChild(nav);
}

/* ---------- Board select ---------- */

function renderBoards(): void {
  app.appendChild(topbar('Choose Your Table', true));
  const list = el('div', 'board-list');
  for (const b of BOARDS) {
    const unlocked = b.id <= campaign.unlockedBoard;
    const won = campaign.boardWinnings[b.id] ?? 0;
    const card = document.createElement('button');
    card.className = 'board-card' + (unlocked ? '' : ' locked');
    card.disabled = !unlocked;
    card.appendChild(el('div', 'board-name', `${unlocked ? '🎰' : '🔒'} ${b.name}`));
    card.appendChild(el('div', 'board-meta', `Top prize ${fmt(b.topPrize)}`));
    const prog = Math.min(1, won / b.threshold);
    const bar = el('div', 'board-progress');
    const fill = el('div', 'fill');
    fill.style.width = `${Math.round(prog * 100)}%`;
    bar.appendChild(fill);
    card.appendChild(bar);
    card.appendChild(el('div', 'board-meta',
      unlocked
        ? `Table winnings ${fmt(won)} / ${fmt(b.threshold)}`
        : `Clear the previous table to unlock (${fmt(b.threshold)} needed)`));
    if (unlocked) {
      card.addEventListener('click', () => startGame(b.id));
    }
    list.appendChild(card);
  }
  app.appendChild(list);
}

function startGame(boardId: number): void {
  // Load intel flags from inventory; consumption is settled when the game ends.
  const loadout = {
    peek: campaign.intel.peek > 0,
    formulaLeak: campaign.intel.formulaLeak > 0,
    caseSwap: campaign.intel.caseSwap > 0,
    insurance: campaign.intel.insurance > 0,
  };
  mountGame(app, {
    boardId,
    loadout,
    onExit: () => go('boards'),
    onFinish: (used, record, payout) => {
      campaign = loadCampaign();
      for (const k of Object.keys(used) as (keyof IntelInventory)[]) {
        if (used[k]) campaign.intel[k] = Math.max(0, campaign.intel[k] - 1);
      }
      const b = record.boardId;
      campaign.bank += payout;
      campaign.boardWinnings[b] = (campaign.boardWinnings[b] ?? 0) + payout;
      campaign.boardGames[b] = (campaign.boardGames[b] ?? 0) + 1;
      if (payout >= record.caseValue && payout >= record.startingEv) campaign.boardPerfect[b] = true;
      const board = BOARDS.find((x) => x.id === b);
      if (board && (campaign.boardWinnings[b] ?? 0) >= board.threshold && b < 5) {
        campaign.unlockedBoard = Math.max(campaign.unlockedBoard, b + 1);
      }
      recordNotables(campaign, record);
      persist();
    },
  });
}

/* ---------- Casebook ---------- */

function recordNotables(c: CampaignState, record: { boardId: number; dealRound: number | null; payout: number; caseValue: number; startingEv: number }): void {
  const boardName = BOARDS.find((b) => b.id === record.boardId)?.name ?? `Board ${record.boardId}`;
  const upsert = (kind: 'biggestDeal' | 'worstBeat' | 'longestHold', value: number, detail: string): void => {
    const existing = c.casebook.find((n) => n.kind === kind);
    if (existing && existing.payout >= value) return;
    const entry = { kind, boardId: record.boardId, boardName, payout: value, detail, when: Date.now() };
    if (existing) Object.assign(existing, entry);
    else c.casebook.push(entry);
  };
  if (record.dealRound !== null) {
    upsert('biggestDeal', record.payout, `Dealt for ${fmt(record.payout)} at ${boardName}`);
  }
  const beatScore = record.startingEv - record.payout; // how far below EV you finished
  upsert('worstBeat', beatScore, `Walked with ${fmt(record.payout)} on a ${fmt(record.startingEv)} table at ${boardName}`);
  const holdDepth = record.dealRound ?? 9;
  upsert('longestHold', holdDepth, `Survived to round ${holdDepth} at ${boardName}`);
}

function renderCasebook(): void {
  app.appendChild(topbar('Casebook', true));
  const wrap = el('div', 'stat-grid');
  const label: Record<string, string> = {
    biggestDeal: '🏆 Biggest Deal',
    worstBeat: '💔 Worst Beat',
    longestHold: '⏳ Longest Hold',
  };
  if (campaign.casebook.length === 0) {
    app.appendChild(el('p', 'menu-tag', 'No notable games yet. The Dealer is waiting.'));
  }
  for (const n of campaign.casebook) {
    const card = el('div', 'stat-card');
    card.appendChild(el('div', 'stat-title', label[n.kind] ?? n.kind));
    card.appendChild(el('div', 'stat-value', n.kind === 'longestHold' ? `Round ${n.payout}` : fmt(n.payout)));
    card.appendChild(el('div', 'stat-detail', n.detail));
    card.appendChild(el('div', 'stat-detail', new Date(n.when).toLocaleDateString()));
    wrap.appendChild(card);
  }
  app.appendChild(wrap);

  const total = campaign.history.length;
  if (total > 0) {
    const card = el('div', 'stat-card');
    card.appendChild(el('div', 'stat-title', '📊 Career'));
    card.appendChild(el('div', 'stat-value', `${total} games`));
    card.appendChild(el('div', 'stat-detail', `Career bank ${fmt(campaign.bank)}`));
    wrap.appendChild(card);
  }
}

/* ---------- Tell Sheet ---------- */

const REP_EXPLAIN: Record<string, { icon: string; name: string; blurb: string; adj: string }> = {
  neutral: {
    icon: '🎭', name: 'Neutral',
    blurb: "The Dealer hasn't read you yet. Fewer than 3 recorded games, or no clear pattern.",
    adj: 'No adjustment. Offers follow the board curve exactly (±0%).',
  },
  fearless: {
    icon: '🦁', name: 'Fearless',
    blurb: 'You hold deep — your average deal comes in round 6 or later. The Dealer thinks you’ll crack late and lowballs you.',
    adj: 'Offers reduced by 8% of live EV, every round.',
  },
  cautious: {
    icon: '🐢', name: 'Cautious',
    blurb: 'You deal early — average deal by round 3. The Dealer buys you out before you go deep with inflated early offers.',
    adj: '+6% of live EV in rounds 1–4, +3% in rounds 5–6, then back to the curve.',
  },
  streaky: {
    icon: '🔥', name: 'Streaky',
    blurb: 'You’ve beaten the starting EV in 3+ of your last 5 games. The Dealer respects the heat and tightens up. (Boards 4–5 only.)',
    adj: 'Offers reduced by 5% of live EV.',
  },
  cold: {
    icon: '🧊', name: 'Cold',
    blurb: 'You’ve finished under 25% of starting EV in 3+ of your last 5 games. The Dealer softens offers to keep you at the table. (Boards 4–5 only.)',
    adj: 'Offers increased by 4% of live EV.',
  },
};

function renderTellSheet(): void {
  app.appendChild(topbar('Tell Sheet', true));
  const rep = deriveReputation(campaign.history);
  const cur = REP_EXPLAIN[rep];
  const hero = el('div', 'rep-hero');
  hero.appendChild(el('div', 'rep-icon', cur.icon));
  hero.appendChild(el('div', 'rep-name', cur.name.toUpperCase()));
  hero.appendChild(el('p', 'menu-tag', `${campaign.history.length} games on record — every adjustment below is exactly what the Dealer applies. No black box.`));
  app.appendChild(hero);

  for (const key of Object.keys(REP_EXPLAIN)) {
    const r = REP_EXPLAIN[key];
    const card = el('div', 'rep-card' + (key === rep ? ' current' : ''));
    card.appendChild(el('div', 'stat-title', `${r.icon} ${r.name}${key === rep ? ' — YOU ARE HERE' : ''}`));
    card.appendChild(el('p', '', r.blurb));
    card.appendChild(el('div', 'rep-adj', `Adjustment: ${r.adj}`));
    app.appendChild(card);
  }
  app.appendChild(el('p', 'menu-tag', 'Hard cap: the Dealer can never shift an offer more than ±8% of live EV.'));
}

/* ---------- Intel shop ---------- */

function renderShop(): void {
  app.appendChild(topbar('Intel Shop', true));
  app.appendChild(el('p', 'menu-tag', 'Spend banked winnings on intel. Each item is consumed when used in a game.'));
  for (const key of Object.keys(INTEL_INFO) as (keyof IntelInventory)[]) {
    const info = INTEL_INFO[key];
    const price = INTEL_PRICES[key];
    const held = campaign.intel[key];
    const card = el('div', 'shop-card');
    card.appendChild(el('div', 'shop-icon', info.icon));
    const body = el('div', 'shop-body');
    body.appendChild(el('div', 'stat-title', `${info.name} — ${fmt(price)}`));
    body.appendChild(el('div', 'stat-detail', info.desc));
    body.appendChild(el('div', 'stat-detail', `Held: ${held}`));
    card.appendChild(body);
    const buy = document.createElement('button');
    buy.className = 'btn-deal';
    buy.textContent = 'BUY';
    buy.disabled = campaign.bank < price;
    buy.addEventListener('click', () => {
      campaign.bank -= price;
      campaign.intel[key] += 1;
      persist();
      go('shop');
    });
    card.appendChild(buy);
    app.appendChild(card);
  }
}

/* ---------- Settings ---------- */

export function openSettings(): void {
  const overlay = el('div', 'overlay');
  const card = el('div', 'card');
  card.appendChild(el('h2', '', '⚙️ Settings'));
  const toggle = (label: string, key: 'sound' | 'music' | 'reducedMotion' | 'colorBlind'): void => {
    const b = document.createElement('button');
    b.className = 'menu-btn setting-toggle';
    b.appendChild(el('span', '', label));
    b.appendChild(el('span', '', campaign.settings[key] ? 'ON' : 'OFF'));
    b.addEventListener('click', () => {
      campaign.settings[key] = !campaign.settings[key];
      persist();
      document.body.classList.toggle('colorblind', campaign.settings.colorBlind);
      document.body.classList.toggle('reduced-motion', campaign.settings.reducedMotion);
      overlay.remove();
      openSettings();
    });
    card.appendChild(b);
  };
  toggle('🔊 Sound effects', 'sound');
  toggle('🎵 Music', 'music');
  toggle('🐢 Reduced motion', 'reducedMotion');
  toggle('🎨 Color-blind friendly', 'colorBlind');
  const close = document.createElement('button');
  close.className = 'btn-nodeal';
  close.textContent = 'CLOSE';
  close.addEventListener('click', () => overlay.remove());
  card.appendChild(close);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

/* ---------- First-launch tutorial ---------- */

function maybeTutorial(): void {
  if (campaign.settings.tutorialDone) return;
  const overlay = el('div', 'overlay');
  const card = el('div', 'card tutorial');
  let step = 0;
  const steps: { icon: string; title: string; body: string }[] = [
    { icon: '💼', title: 'Pick your case', body: '26 cases, one fortune. Tap any case to claim it as yours — its value stays hidden until the end.' },
    { icon: '🗑', title: 'Open cases', body: 'Each round you eliminate cases from the wall. Every value you remove changes the <strong>board average</strong> — the average of every amount still in play. Offers above it beat the math.' },
    { icon: '☎️', title: 'The Dealer calls', body: 'After each round the Dealer makes an offer based on the board average — and on your reputation. Check the Tell Sheet: every adjustment is published.' },
    { icon: '🤝', title: 'Deal or hold', body: 'Take the DEAL to bank the offer, or say NO DEAL and keep going. Hold to the final two and you may swap cases. Winnings bank toward unlocking bigger tables.' },
  ];
  const renderStep = (): void => {
    card.innerHTML = '';
    const s = steps[step];
    card.appendChild(el('div', 'rep-icon', s.icon));
    card.appendChild(el('h2', '', s.title));
    card.appendChild(el('p', '', s.body));
    card.appendChild(el('p', 'menu-tag', `Step ${step + 1} of ${steps.length}`));
    const row = el('div', 'deal-row');
    const next = document.createElement('button');
    next.className = 'btn-deal hot';
    next.textContent = step < steps.length - 1 ? 'NEXT' : '▶ TAKE A SEAT';
    next.addEventListener('click', () => {
      if (step < steps.length - 1) { step++; renderStep(); }
      else dismiss();
    });
    const skip = document.createElement('button');
    skip.className = 'btn-nodeal';
    skip.textContent = 'SKIP';
    skip.addEventListener('click', dismiss);
    row.appendChild(skip);
    row.appendChild(next);
    card.appendChild(row);
  };
  const dismiss = (): void => {
    campaign.settings.tutorialDone = true;
    persist();
    overlay.remove();
  };
  renderStep();
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

/* ---------- Boot ---------- */

export function mountApp(root: HTMLElement): void {
  app = root;
  campaign = loadCampaign();
  document.body.classList.toggle('colorblind', campaign.settings.colorBlind);
  document.body.classList.toggle('reduced-motion', campaign.settings.reducedMotion);
  go('menu');
  maybeTutorial();
}
