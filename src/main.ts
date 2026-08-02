import {
  createGame, pickCase, openCase, noDeal, deal, finalSwap,
  remainingCases, boardEV, toRecord,
} from './engine/game';
import type { GameState } from './engine/game';

const lines: string[] = [];
function log(msg: string): void {
  lines.push(msg);
  console.log(msg);
}

// Scripted simulated game on Board 1: hold to the final swap.
let s: GameState = createGame(1, 20260802);
log(`Board: ${s.board.name} — starting EV $${boardEV(s).toFixed(0)}`);
s = pickCase(s, 13);
log(`Picked case #13. Round 1: open ${s.casesToOpenThisRound} cases.`);

while (s.phase !== 'done') {
  while (s.phase === 'eliminate') {
    const [c] = remainingCases(s);
    s = openCase(s, c);
  }
  if (s.phase === 'offer') {
    log(
      `Round ${s.round} offer: $${s.currentOffer!.offer} ` +
      `(base $${s.currentOffer!.baseOffer}, board EV $${boardEV(s).toFixed(0)})`,
    );
    // Scripted policy: deal at round 7+ if the offer beats EV, else hold on.
    if (s.round >= 7 && s.currentOffer!.offer >= boardEV(s)) {
      s = deal(s);
      log(`DEAL! Payout $${s.result!.payout} (case held $${s.result!.caseValue})`);
    } else {
      s = noDeal(s);
    }
  } else if (s.phase === 'finalSwap') {
    s = finalSwap(s, false);
    log(`Held to the end. Final case pays $${s.result!.payout}`);
  }
}

const record = toRecord(s, 0);
log(`Game record: ${JSON.stringify(record)}`);

document.getElementById('log')!.textContent = lines.join('\n');
