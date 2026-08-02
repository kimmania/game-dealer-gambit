import {
  createGame, pickCase, openCase, deal, noDeal, finalSwap, peek,
  useFormulaLeak, useCaseSwap, boardEV, toRecord, CASE_COUNT,
} from '../engine/game';
import type { GameState } from '../engine/game';
import type { GameRecord, IntelLoadout } from '../engine/types';
import {
  sndLatch, sndFlip, sndEliminated, sndRing, sndRegister, sndWin, sndBad, startMusic,
} from './audio';
import { loadCampaign } from './store';
import { BOARDS } from '../engine/boards';
import { fmt, el } from './app';

export interface MountOpts {
  boardId: number;
  loadout: IntelLoadout;
  onExit: () => void;
  onFinish: (used: IntelLoadout, record: GameRecord, payout: number) => void;
}

let state: GameState;
let startingEv = 0;
let app: HTMLElement;
let opts: MountOpts;
let peekArmed = false;
let swapArmed = false;
let finished = false;
let revealBanner: string | null = null;

function setState(next: GameState): void {
  const prevPhase = state.phase;
  state = next;
  if (state.phase === 'offer' && prevPhase !== 'offer') sndRing();
  if (state.phase === 'done' && prevPhase !== 'done') finishGame();
  render();
}

function finishGame(): void {
  if (finished) return;
  finished = true;
  const used: IntelLoadout = {
    peek: state.peekUsed,
    formulaLeak: opts.loadout.formulaLeak && !state.leakAvailable,
    caseSwap: opts.loadout.caseSwap && !state.swapAvailable,
    // Insurance only burns when it actually pays out.
    insurance: state.result!.insurancePayout > 0,
  };
  const record = toRecord(state, startingEv);
  opts.onFinish(used, record, state.result!.payout);
  if (state.result!.payout >= startingEv) sndWin(); else sndBad();
}

function onCaseTap(id: number): void {
  if (state.phase === 'pick') {
    if (peekArmed) {
      peekArmed = false;
      sndFlip();
      setState(peek(state, id));
      return;
    }
    sndLatch();
    setState(pickCase(state, id));
  } else if (state.phase === 'eliminate') {
    if (id === state.playerCase || state.openedCases.has(id)) return;
    if (swapArmed) {
      swapArmed = false;
      sndFlip();
      setState(useCaseSwap(state, id));
      return;
    }
    const value = state.caseValues[id];
    const wasBig = value >= boardEV(state);
    sndFlip();
    const next = openCase(state, id);
    setState(next);
    sndEliminated(wasBig);
    // Reveal beat: let the player register the revealed value before the offer appears.
    if (next.phase === 'offer') {
      revealBanner = fmt(value);
      render();
      window.setTimeout(() => {
        revealBanner = null;
        render();
      }, 1300);
    }
  }
}

function stars(result: { payout: number; caseValue: number }): number {
  let s = 1;
  if (result.payout >= startingEv) s++;
  if (result.payout >= result.caseValue) s++;
  return s;
}

function renderValueBoard(parent: HTMLElement): void {
  const ev = boardEV(state);
  const bar = el('div', 'ev-bar');
  bar.appendChild(el('span', 'ev-label', '📊 BOARD AVERAGE'));
  bar.appendChild(el('span', 'ev-value', fmt(ev)));
  parent.appendChild(bar);

  const board = el('div', 'value-board');
  // Track remaining copies of each amount so duplicates strike individually.
  const remaining = new Map<number, number>();
  for (const v of state.board.values) remaining.set(v, (remaining.get(v) ?? 0) + 1);
  for (const c of state.openedCases) {
    const v = state.caseValues[c];
    remaining.set(v, (remaining.get(v) ?? 1) - 1);
  }
  const sorted = [...state.board.values].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    const v = sorted[i];
    const copies = remaining.get(v) ?? 0;
    const dup = i + 1 < sorted.length && sorted[i + 1] === v;
    if (copies <= 0 && !dup) {
      board.appendChild(el('div', 'value-chip gone', fmt(v)));
      continue;
    }
    if (dup) {
      // Group identical amounts into one chip: show count, strike when all copies gone.
      let run = 1;
      while (i + run < sorted.length && sorted[i + run] === v) run++;
      const total = run;
      const label = copies > 0 && copies < total ? `${fmt(v)} ×${copies}` : fmt(v);
      board.appendChild(el('div', 'value-chip' + (copies <= 0 ? ' gone' : ''), label));
      i += run - 1;
    } else {
      board.appendChild(el('div', 'value-chip' + (copies <= 0 ? ' gone' : ''), fmt(v)));
    }
  }
  parent.appendChild(board);
}

function renderCaseWall(parent: HTMLElement): void {
  const wall = el('div', 'case-wall');
  for (let i = 0; i < CASE_COUNT; i++) {
    if (i === state.playerCase) continue;
    const btn = document.createElement('button');
    btn.className = 'case';
    btn.setAttribute('aria-label', `Case ${i + 1}`);
    if (state.openedCases.has(i)) {
      btn.classList.add('opened');
      btn.disabled = true;
      btn.appendChild(el('span', 'case-value', fmt(state.caseValues[i])));
    } else {
      btn.textContent = String(i + 1);
      const peekedVal = state.peeked.get(i);
      if (peekedVal !== undefined) {
        btn.classList.add('peeked');
        btn.appendChild(el('span', 'case-value', fmt(peekedVal)));
      }
      btn.disabled = state.phase !== 'pick' && state.phase !== 'eliminate';
      btn.addEventListener('click', () => onCaseTap(i));
    }
    wall.appendChild(btn);
  }
  parent.appendChild(wall);
}

function renderPodium(parent: HTMLElement): void {
  if (state.playerCase === null) return;
  const pod = el('div', 'podium');
  pod.appendChild(el('span', 'podium-label', 'YOUR CASE'));
  pod.appendChild(el('div', 'case yours', String(state.playerCase + 1)));
  parent.appendChild(pod);
}

function hintText(): string {
  if (peekArmed) return '👁 Tap a case to peek inside';
  if (swapArmed) return '🔄 Tap a case to swap it for yours';
  switch (state.phase) {
    case 'pick': return state.playerCase == null ? 'Choose your case' : `Case #${state.playerCase + 1} is yours — now tap cases on the wall to open them`;
    case 'eliminate':
      return `Round ${state.round} — open ${state.casesToOpenThisRound} more case${state.casesToOpenThisRound === 1 ? '' : 's'}`;
    case 'offer': return 'The Dealer calls…';
    case 'finalSwap': return 'Final two. Keep your case, or swap?';
    default: return '';
  }
}

function renderIntelBar(parent: HTMLElement): void {
  const items: { show: boolean; icon: string; label: string; armed: boolean; fn: () => void }[] = [
    {
      show: state.phase === 'pick' && !state.peekUsed && opts.loadout.peek,
      icon: '👁', label: 'PEEK', armed: peekArmed,
      fn: () => { peekArmed = !peekArmed; sndLatch(); render(); },
    },
    {
      show: state.phase === 'eliminate' && state.swapAvailable,
      icon: '🔄', label: 'SWAP', armed: swapArmed,
      fn: () => { swapArmed = !swapArmed; sndLatch(); render(); },
    },
  ].filter((i) => i.show);
  if (items.length === 0 && !(state.insuranceAvailable && state.phase !== 'done')) return;
  const bar = el('div', 'intel-bar');
  for (const i of items) {
    const b = document.createElement('button');
    b.className = 'intel-btn' + (i.armed ? ' armed' : '');
    b.appendChild(el('span', 'menu-icon', i.icon));
    b.appendChild(el('span', '', i.label));
    b.addEventListener('click', i.fn);
    bar.appendChild(b);
  }
  if (state.insuranceAvailable && state.phase !== 'done') {
    bar.appendChild(el('span', 'intel-note', '🛡 Insurance active'));
  }
  parent.appendChild(bar);
}

function renderOffer(): void {
  const overlay = el('div', 'overlay');
  const card = el('div', 'card');
  card.appendChild(el('h2', '', '☎️ The Dealer Offers'));

  const ev = boardEV(state);
  const offer = state.currentOffer!;
  const cmp = el('div', 'offer-compare');
  const offerBox = el('div', 'box');
  offerBox.appendChild(el('div', 'lbl', 'OFFER'));
  offerBox.appendChild(el('div', 'amt', fmt(offer.offer)));
  const evBox = el('div', 'box ev');
  evBox.appendChild(el('div', 'lbl', 'BOARD AVERAGE'));
  evBox.appendChild(el('div', 'amt', fmt(ev)));
  cmp.appendChild(offerBox);
  cmp.appendChild(evBox);
  card.appendChild(cmp);

  card.appendChild(el('div', 'offer-tag', `Dealer read: ${offer.reputationApplied}`));

  if (state.leakedOfferPct !== null) {
    card.appendChild(el('div', 'leak-tag', `📠 LEAKED: this offer is ${(state.leakedOfferPct * 100).toFixed(1)}% of the board average`));
  } else if (state.leakAvailable) {
    const leak = document.createElement('button');
    leak.className = 'intel-btn';
    leak.appendChild(el('span', 'menu-icon', '📠'));
    leak.appendChild(el('span', '', 'FORMULA LEAK'));
    leak.addEventListener('click', () => { sndRegister(); setState(useFormulaLeak(state)); });
    card.appendChild(leak);
  }

  if (state.swapAvailable) {
    const swap = document.createElement('button');
    swap.className = 'intel-btn';
    swap.appendChild(el('span', 'menu-icon', '🔄'));
    swap.appendChild(el('span', '', 'CASE SWAP'));
    swap.addEventListener('click', () => {
      overlay.remove();
      swapArmed = true;
      render();
    });
    card.appendChild(swap);
  }

  const row = el('div', 'deal-row');
  const dealBtn = document.createElement('button');
  dealBtn.className = 'btn-deal' + (offer.offer >= ev ? ' hot' : '');
  dealBtn.textContent = 'DEAL';
  dealBtn.addEventListener('click', () => { sndRegister(); setState(deal(state)); });
  const noBtn = document.createElement('button');
  noBtn.className = 'btn-nodeal';
  noBtn.textContent = 'NO DEAL';
  noBtn.addEventListener('click', () => { sndLatch(); setState(noDeal(state)); });
  row.appendChild(dealBtn);
  row.appendChild(noBtn);
  card.appendChild(row);

  overlay.appendChild(card);
  app.appendChild(overlay);
}

function renderFinalSwap(): void {
  const overlay = el('div', 'overlay');
  const card = el('div', 'card');
  card.appendChild(el('h2', '', 'Two Cases Remain'));
  card.appendChild(el('p', 'offer-tag', `Keep Case #${state.playerCase! + 1} — or take the last one standing?`));
  const row = el('div', 'deal-row');
  const keep = document.createElement('button');
  keep.className = 'btn-deal hot';
  keep.textContent = `KEEP #${state.playerCase! + 1}`;
  keep.addEventListener('click', () => { sndFlip(); setState(finalSwap(state, false)); });
  const swap = document.createElement('button');
  swap.className = 'btn-nodeal';
  swap.textContent = '🔄 SWAP';
  swap.addEventListener('click', () => { sndFlip(); setState(finalSwap(state, true)); });
  row.appendChild(keep);
  row.appendChild(swap);
  card.appendChild(row);
  overlay.appendChild(card);
  app.appendChild(overlay);
}

function renderResult(parent: HTMLElement): void {
  const r = state.result!;
  const overlay = el('div', 'overlay');
  const card = el('div', 'card');
  card.appendChild(el('h2', '', r.outcome === 'deal' ? '🤝 DEAL!' : '🏆 You Held to the End'));
  card.appendChild(el('div', 'result-amt', fmt(r.payout)));
  card.appendChild(el('div', 'stars-big', '★'.repeat(stars(r)) + '☆'.repeat(3 - stars(r))));

  const lines = el('div', 'result-lines');
  const addRow = (k: string, v: string): void => {
    const row = el('div', 'row');
    row.appendChild(el('span', '', k));
    row.appendChild(el('span', '', v));
    lines.appendChild(row);
  };
  addRow('Your case held', fmt(r.caseValue));
  if (r.offerTaken !== null) addRow('Offer taken', fmt(r.offerTaken));
  if (r.insurancePayout > 0) addRow('🛡 Insurance saved you', fmt(r.insurancePayout));
  else if (state.insuranceAvailable && r.outcome === 'deal') addRow('🛡 Insurance', 'No payout — deal was fair');
  addRow('Starting board average', fmt(startingEv));
  if (r.payout >= startingEv) addRow('Beat the average!', '+10% bonus unlocked');
  if (r.swappedAtEnd) addRow('Final swap', 'Yes');

  // Progress toward the next table — show the math so the player knows what this win did.
  const campaign = loadCampaign();
  const thisBoard = state.board;
  const before = Math.max(0, (campaign.boardWinnings[thisBoard.id] ?? 0) - r.payout);
  const after = campaign.boardWinnings[thisBoard.id] ?? 0;
  const target = thisBoard.threshold ?? 0;
  const nextBoard = BOARDS.find((b) => b.id === thisBoard.id + 1);
  if (nextBoard) {
    addRow('Table progress', `${fmt(Math.min(after, target))} / ${fmt(target)}`);
    if (after >= target && before < target) addRow('🔓 UNLOCKED', nextBoard.name);
    else if (after < target) addRow('To unlock ' + nextBoard.name, `${fmt(target - after)} more`);
  } else {
    addRow('Final table cleared', '🏆 Campaign complete');
  }
  card.appendChild(lines);

  const board = state.board;
  const next = document.createElement('button');
  next.className = 'btn-deal hot';
  next.textContent = '▶ BACK TO TABLES';
  next.addEventListener('click', () => { sndLatch(); opts.onExit(); });
  card.appendChild(next);
  card.appendChild(el('p', 'offer-tag', `${board.name} winnings count toward your next table.`));

  overlay.appendChild(card);
  parent.appendChild(overlay);
}

function render(): void {
  app.innerHTML = '';

  const head = el('div', 'game-head');
  const home = document.createElement('button');
  home.className = 'btn-nav';
  home.textContent = '← TABLES';
  home.addEventListener('click', () => opts.onExit());
  head.appendChild(home);
  head.appendChild(el('span', '', `🎰 ${state.board.name}`));
  head.appendChild(el('span', '', state.phase === 'eliminate' || state.phase === 'offer' ? `Round ${state.round}/9` : ''));
  app.appendChild(head);

  const screen = el('div', 'screen');
  screen.appendChild(el('div', 'hint', hintText()));
  renderValueBoard(screen);
  renderPodium(screen);
  renderCaseWall(screen);
  renderIntelBar(screen);
  app.appendChild(screen);

  if (state.phase === 'offer' && revealBanner) {
    const banner = el('div', 'overlay reveal-beat');
    const card = el('div', 'card reveal-card');
    card.appendChild(el('div', 'lbl', 'REVEALED'));
    card.appendChild(el('div', 'reveal-value', revealBanner));
    card.appendChild(el('div', 'menu-tag', `Board average now ${fmt(boardEV(state))}`));
    banner.appendChild(card);
    app.appendChild(banner);
  } else if (state.phase === 'offer') renderOffer();
  else if (state.phase === 'finalSwap') renderFinalSwap();
  else if (state.phase === 'done') renderResult(app);
}

export function mountGame(root: HTMLElement, options: MountOpts): void {
  app = root;
  opts = options;
  peekArmed = false;
  swapArmed = false;
  finished = false;
  state = createGame(opts.boardId, (Math.random() * 2 ** 31) | 0, loadCampaign().history, opts.loadout);
  startingEv = boardEV(state);
  render();
  const unlock = (): void => { startMusic(); document.removeEventListener('pointerdown', unlock); };
  document.addEventListener('pointerdown', unlock);
}
