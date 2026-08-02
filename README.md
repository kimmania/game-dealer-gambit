# Dealer's Gambit

A case-elimination game of wits against an **adaptive Dealer**. Pick a case, open 24 others across 9 rounds, and decide — Deal or No Deal — while the Dealer studies your history and adjusts every offer. The twist: his entire read on you is published on the **Tell Sheet**. No black box.

## Play

**https://kimmania.github.io/game-dealer-gambit/**

Installable PWA — add to home screen for fullscreen, offline-capable play.

## Features

- **5 progressive tables** (The Parlor → The Bank Itself), each with its own case values, offer curve, and cumulative-winnings unlock threshold
- **Adaptive Dealer** with 5 reputation states (neutral / fearless / cautious / streaky / cold), derived deterministically from your last games — every adjustment percentage shown on the Tell Sheet, hard-capped at ±8% of live EV
- **Intel shop**: buy Peek, Formula Leak, Case Swap, and Insurance with banked winnings; held items surface in-game at the right moment
- **Casebook**: auto-recorded notable games (biggest deal, worst beat, longest hold) plus career stats
- **Live EV board**, final-two case swap, star ratings, persistent bank across sessions
- Settings: sound, music, reduced motion, color-blind palette — all persisted

## Develop

```bash
npm install
npm run dev        # vite dev server
npm run build      # typecheck + production build (dist/)
npm test           # 32 engine unit tests (vitest)
npm run simulate   # Monte-Carlo dealer/EV simulation
```

Engine is pure TypeScript (`src/engine/`) — deterministic, seeded RNG, no DOM — with UI in `src/ui/`.

## Stack

Vite · TypeScript · vite-plugin-pwa (Workbox) · Vitest · GitHub Pages
