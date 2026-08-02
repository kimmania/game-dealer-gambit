import {
  createGame, pickCase, openCase, deal, noDeal, finalSwap,
  boardEV, toRecord, NO_INTEL, CASE_COUNT,
} from '../engine/game';
import type { GameState } from '../engine/game';
import { loadCampaign, saveCampaign } from './store';
import {
  sndLatch, sndFlip, sndEliminated, sndRing, sndRegister, sndWin, sndBad, startMusic,
} from './audio';

const fmt = (n: number): string => '$' + Math.round(n).toLocaleString('en-US');

let state: GameState;
let startingEv = 0;
let app: HTMLElement;

function newGame(): void {
  const campaign = loadCampaign();
  state = createGame(1, (Math.random() * 2 ** 31) | 0, campaign.history, NO_INTEL);
  startingEv = boardEV(state);
  render();
}

function setState(next: GameState): void {
  const prevPhase = state.phase;
  state = next;
  if (state.phase === 'offer' && prevPhase !== 'offer') sndRing();
  if (state.phase === 'done' && prevPhase !== 'done') finishGame();
  render();
}

function finishGame(): void {
  const campaign = loadCampaign();
  const record = toRecord(state, startingEv);
  campaign.history.push(record);
  campaign.bank += state.result!.payout;
  campaign.boardWinnings[1] = (campaign.boardWinnings[1] ?? 0) + state.result!.payout;
  campaign.boardGames[1] = (campaign.boardGames[1] ?? 0) + 1;
  saveCampaign(campaign);
  if (state.result!.payout >= startingEv) sndWin(); else sndBad();
}

function onCaseTap(id: number): void {
  if (state.phase === 'pick') {
    sndLatch();
    setState(pickCase(state, id));
  } else if (state.phase === 'eliminate') {
    if (id === state.playerCase || state.openedCases.has(id)) return;
    const value = state.caseValues[id];
    sndFlip();
    setState(openCase(state, id));
    sndEliminated(value >= boardEV(state));
  }
}

function stars(result: { payout: number; caseValue: number }): number {
  let s = 1;
  if (result.payout >= startingEv) s++;
  if (result.payout >= result.caseValue) s++;
  return s;
}

function el(tag: string, cls = '', text = ''): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function renderValueBoard(parent: HTMLElement): void {
  const ev = boardEV(state);
  const bar = el('div', 'ev-bar');
  bar.appendChild(el('span', 'ev-label', '📊 LIVE EV'));
  bar.appendChild(el('span', 'ev-value', fmt(ev)));
  parent.appendChild(bar);

  const board = el('div', 'value-board');
  const gone = new Set<number>();
  for (const c of state.openedCases) gone.add(state.caseValues[c]);
  const sorted = [...state.board.values].sort((a, b) => a - b);
  for (const v of sorted) {
    const dead = gone.has(v);
    if (dead) gone.delete(v); // strike only as many copies as opened
    board.appendChild(el('div', 'value-chip' + (dead ? ' gone' : ''), fmt(v)));
  }
  parent.appendChild(board);
}

function renderCaseWall(parent: HTMLElement): void {
  const wall = el('div', 'case-wall');
  for (let i = 0; i < CASE_COUNT; i++) {
    if (i === state.playerCase) continue; // player's case sits on the podium
    const btn = document.createElement('button');
    btn.className = 'case';
    btn.setAttribute('aria-label', `Case ${i + 1}`);
    if (state.openedCases.has(i)) {
      btn.classList.add('opened');
      btn.disabled = true;
      const v = el('span', 'case-value', fmt(state.caseValues[i]));
      btn.appendChild(v);
    } else {
      btn.textContent = String(i + 1);
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
  const c = el('div', 'case yours', String(state.playerCase + 1));
  pod.appendChild(c);
  parent.appendChild(pod);
}

function hintText(): string {
  switch (state.phase) {
    case 'pick': return 'Choose your case';
    case 'eliminate':
      return `Round ${state.round} — open ${state.casesToOpenThisRound} more case${state.casesToOpenThisRound === 1 ? '' : 's'}`;
    case 'offer': return 'The Dealer calls…';
    case 'finalSwap': return 'Final two. Keep your case, or swap?';
    default: return '';
  }
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
  evBox.appendChild(el('div', 'lbl', 'LIVE EV'));
  evBox.appendChild(el('div', 'amt', fmt(ev)));
  cmp.appendChild(offerBox);
  cmp.appendChild(evBox);
  card.appendChild(cmp);

  card.appendChild(el('div', 'offer-tag', `Dealer read: ${offer.reputationApplied}`));

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
  if (r.insurancePayout > 0) addRow('Insurance payout', fmt(r.insurancePayout));
  addRow('Starting EV', fmt(startingEv));
  if (r.payout >= startingEv) addRow('Beat the EV!', '+10% bonus unlocked');
  if (r.swappedAtEnd) addRow('Final swap', 'Yes');
  card.appendChild(lines);

  const campaign = loadCampaign();
  addRowBank(card, campaign.bank);

  const again = document.createElement('button');
  again.className = 'btn-deal hot';
  again.textContent = '▶ PLAY AGAIN';
  again.addEventListener('click', () => { sndLatch(); newGame(); });
  card.appendChild(again);

  overlay.appendChild(card);
  parent.appendChild(overlay);
}

function addRowBank(card: HTMLElement, bank: number): void {
  const p = el('p', 'offer-tag', `Career bank: ${fmt(bank)}`);
  card.appendChild(p);
}

function render(): void {
  app.innerHTML = '';

  const head = el('div', 'game-head');
  head.appendChild(el('span', '', `🎰 ${state.board.name}`));
  head.appendChild(el('span', '', state.phase === 'eliminate' || state.phase === 'offer' ? `Round ${state.round}/9` : ''));
  app.appendChild(head);

  const screen = el('div', 'screen');
  renderValueBoard(screen);
  renderPodium(screen);
  renderCaseWall(screen);
  screen.appendChild(el('div', 'hint', hintText()));
  app.appendChild(screen);

  if (state.phase === 'offer') renderOffer();
  else if (state.phase === 'finalSwap') renderFinalSwap();
  else if (state.phase === 'done') renderResult(app);
}

export function mountGame(root: HTMLElement): void {
  app = root;
  state = createGame(1, (Math.random() * 2 ** 31) | 0, loadCampaign().history, NO_INTEL);
  startingEv = boardEV(state);
  render();
  // Music + audio unlock on first gesture.
  const unlock = (): void => { startMusic(); document.removeEventListener('pointerdown', unlock); };
  document.addEventListener('pointerdown', unlock);
}
