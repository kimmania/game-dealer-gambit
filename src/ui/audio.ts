/** Synthesized Web Audio sounds — no assets. All lazily created, no-ops until a user gesture. */
let ctx: AudioContext | null = null;
let enabled = true;
let musicOn = true;
let musicTimer: number | null = null;

export function setSoundEnabled(v: boolean): void {
  enabled = v;
}
export function setMusicEnabled(v: boolean): void {
  musicOn = v;
  if (!v) stopMusic();
}

function ac(): AudioContext | null {
  if (!enabled) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, when = 0, slideTo?: number): void {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + when;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur: number, gain: number, when = 0, lowpass = 2000): void {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + when;
  const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = lowpass;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
}

/** Heavy case latch click. */
export function sndLatch(): void {
  noise(0.06, 0.5, 0, 1200);
  tone(180, 0.08, 'square', 0.15);
}

/** Paper flip reveal. */
export function sndFlip(): void {
  noise(0.12, 0.25, 0, 4000);
  tone(900, 0.1, 'sine', 0.06, 0, 1400);
}

/** Low thunk when a small amount dies / high sting when big dies. */
export function sndEliminated(big: boolean): void {
  if (big) {
    tone(220, 0.35, 'sawtooth', 0.12, 0, 90);
    noise(0.2, 0.3, 0, 800);
  } else {
    tone(520, 0.12, 'triangle', 0.12);
    tone(660, 0.1, 'triangle', 0.1, 0.08);
  }
}

/** Dealer phone ring. */
export function sndRing(): void {
  for (let i = 0; i < 2; i++) {
    tone(1200, 0.18, 'sine', 0.12, i * 0.25);
    tone(1000, 0.18, 'sine', 0.1, i * 0.25 + 0.02);
  }
}

/** Cash register tally (offer/deal). */
export function sndRegister(): void {
  tone(880, 0.08, 'square', 0.1);
  tone(1100, 0.08, 'square', 0.1, 0.09);
  tone(1400, 0.15, 'square', 0.12, 0.18);
  noise(0.1, 0.2, 0.05, 6000);
}

/** Win fanfare. */
export function sndWin(): void {
  [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.14, i * 0.12));
}

export function sndBad(): void {
  tone(330, 0.3, 'sawtooth', 0.12, 0, 160);
  tone(220, 0.4, 'sawtooth', 0.1, 0.2, 110);
}

/** Quiet ambient dealer-room pulse. */
export function startMusic(): void {
  if (!musicOn || musicTimer !== null) return;
  const notes = [110, 130.8, 98, 146.8];
  let i = 0;
  const tick = (): void => {
    if (!musicOn) return;
    const c = ac();
    if (c) {
      tone(notes[i % notes.length], 1.6, 'sine', 0.035);
      tone(notes[i % notes.length] * 2, 1.6, 'sine', 0.012);
    }
    i++;
  };
  tick();
  musicTimer = window.setInterval(tick, 1700);
}

export function stopMusic(): void {
  if (musicTimer !== null) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}
