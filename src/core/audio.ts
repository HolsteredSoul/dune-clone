// Procedural Web Audio sound layer. Every cue is SYNTHESIZED at runtime (oscillators + filtered
// noise), so there are zero audio asset files to ship — mirroring the renderer's procedural
// explosion/sprite fallbacks and keeping the GitHub Pages deploy a pure static bundle.
//
// Headless-safe: the AudioContext is created lazily on the first user gesture (`unlock()`), and
// every play() short-circuits until then. The pure-sim (scripts/sim.ts) never imports this module
// — world.ts only pushes plain {name,x,y} data — but even direct import in Node would be inert.
//
// Browser autoplay policy: audio cannot start until a user gesture, so the controller calls
// `unlock()` on the first click/keypress (the brief-screen "Click to begin" satisfies it).

export type SoundName =
  | 'select' | 'move' | 'place' | 'build-start' | 'build-ready' | 'unit-ready'
  | 'cancel' | 'upgrade'
  | 'fire-gun' | 'fire-cannon' | 'fire-rocket' | 'fire-shell'
  | 'explosion' | 'explosion-big' | 'under-attack' | 'victory' | 'defeat';

const STORAGE_KEY = 'dune_muted';

// Minimum seconds between consecutive plays of the SAME cue — anti-spam + voice budgeting. A
// rattling battle collapses to a representative cadence rather than a wall of overlapping shots.
const THROTTLE: Partial<Record<string, number>> = {
  select: 0.04, move: 0.04,
  'fire-gun': 0.05, 'fire-cannon': 0.07, 'fire-rocket': 0.09, 'fire-shell': 0.09,
  explosion: 0.04, 'explosion-big': 0.05,
  'under-attack': 8,
};

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices = 0;
  private readonly maxVoices = 16;
  private readonly lastPlayed = new Map<string, number>();
  muted = false;
  private readonly volume = 0.34;

  constructor() {
    try {
      if (typeof localStorage !== 'undefined') this.muted = localStorage.getItem(STORAGE_KEY) === '1';
    } catch { /* localStorage can throw in private mode — default to unmuted */ }
  }

  /** Create/resume the AudioContext. MUST be called from inside a user-gesture handler. Idempotent
   *  and cheap once running, so the controller can call it on every input batch. */
  unlock(): void {
    if (typeof window === 'undefined') return;
    const AC = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) {
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor(); // tame summed peaks in big fights
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** Toggle mute, persisting the choice. Returns the new muted state. */
  toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, this.muted ? '1' : '0');
    } catch { /* ignore persistence failures */ }
    return this.muted;
  }

  /** Play a cue. `pan` ∈ [-1,1] places it in the stereo field (0 = centre). No-op until unlocked,
   *  while muted, when over the voice budget, or inside the per-cue throttle window. */
  play(name: string, pan = 0): void {
    const ctx = this.ctx, master = this.master;
    if (this.muted || !ctx || !master || ctx.state !== 'running') return;
    const t = ctx.currentTime;

    const min = THROTTLE[name];
    if (min !== undefined) {
      const last = this.lastPlayed.get(name);
      if (last !== undefined && t - last < min) return;
      this.lastPlayed.set(name, t);
    }
    if (this.voices >= this.maxVoices) return;

    // Per-cue output node, optionally through a stereo panner, into the master bus.
    const out = ctx.createGain();
    out.gain.value = 1;
    if (pan !== 0 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      out.connect(p);
      p.connect(master);
    } else {
      out.connect(master);
    }

    const dur = this.build(name, ctx, out, t);
    this.voices++;
    // Release the voice slot a hair after the longest scheduled node finishes.
    setTimeout(() => { this.voices = Math.max(0, this.voices - 1); }, (dur + 0.05) * 1000);
  }

  // ---- synth primitives --------------------------------------------------------------------

  /** A pitched blip: oscillator with an exponential pitch glide and a fast attack / decay. */
  private tone(ctx: AudioContext, out: AudioNode, t: number,
               f0: number, f1: number, dur: number,
               type: OscillatorType, peak: number, delay = 0): void {
    const start = t + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, start);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), start + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.01, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g); g.connect(out);
    o.start(start); o.stop(start + dur + 0.02);
  }

  /** A burst of filtered white noise — the workhorse for impacts, whooshes, and explosions. The
   *  filter cutoff can glide from f0→f1 for a "falling" boom or "rising" whoosh. */
  private noise(ctx: AudioContext, out: AudioNode, t: number, dur: number,
                type: BiquadFilterType, f0: number, f1: number, q: number, peak: number,
                delay = 0): void {
    const start = t + delay;
    const len = Math.max(1, Math.ceil(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.setValueAtTime(f0, start);
    if (f1 !== f0) filt.frequency.exponentialRampToValueAtTime(Math.max(1, f1), start + dur);
    filt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(filt); filt.connect(g); g.connect(out);
    src.start(start); src.stop(start + dur + 0.02);
  }

  /** Build a named cue's nodes; returns the total duration so play() can free the voice slot. */
  private build(name: string, ctx: AudioContext, out: AudioNode, t: number): number {
    switch (name) {
      // ---- UI / command cues ----
      case 'select':
        this.tone(ctx, out, t, 620, 880, 0.07, 'square', 0.16);
        return 0.07;
      case 'move':
        this.tone(ctx, out, t, 360, 500, 0.09, 'triangle', 0.15);
        return 0.09;
      case 'place':
        this.noise(ctx, out, t, 0.10, 'lowpass', 900, 400, 1, 0.22);
        this.tone(ctx, out, t, 150, 80, 0.12, 'square', 0.16);
        return 0.12;
      case 'build-start':
        this.tone(ctx, out, t, 300, 360, 0.10, 'sawtooth', 0.11);
        return 0.10;
      case 'build-ready':
        this.tone(ctx, out, t, 523, 523, 0.10, 'sine', 0.18);
        this.tone(ctx, out, t, 784, 784, 0.14, 'sine', 0.16, 0.09);
        return 0.23;
      case 'unit-ready':
        this.tone(ctx, out, t, 440, 440, 0.08, 'triangle', 0.16);
        this.tone(ctx, out, t, 660, 660, 0.12, 'triangle', 0.15, 0.08);
        return 0.20;
      case 'cancel':
        this.tone(ctx, out, t, 480, 280, 0.10, 'square', 0.15);
        return 0.10;
      case 'upgrade':
        this.tone(ctx, out, t, 523, 523, 0.08, 'sine', 0.16);
        this.tone(ctx, out, t, 659, 659, 0.08, 'sine', 0.16, 0.07);
        this.tone(ctx, out, t, 784, 784, 0.16, 'sine', 0.16, 0.14);
        return 0.30;

      // ---- weapon fire (one per damage type) ----
      case 'fire-gun':
        this.noise(ctx, out, t, 0.05, 'highpass', 1200, 1200, 0.7, 0.20);
        this.tone(ctx, out, t, 220, 120, 0.04, 'square', 0.07);
        return 0.06;
      case 'fire-cannon':
        this.tone(ctx, out, t, 180, 70, 0.14, 'square', 0.24);
        this.noise(ctx, out, t, 0.06, 'lowpass', 600, 300, 1, 0.18);
        return 0.14;
      case 'fire-rocket':
        this.noise(ctx, out, t, 0.24, 'bandpass', 300, 2400, 0.6, 0.18);
        this.tone(ctx, out, t, 160, 440, 0.20, 'sawtooth', 0.10);
        return 0.24;
      case 'fire-shell':
        this.tone(ctx, out, t, 110, 46, 0.18, 'square', 0.26);
        this.noise(ctx, out, t, 0.10, 'lowpass', 320, 160, 1, 0.18);
        return 0.18;

      // ---- explosions ----
      case 'explosion':
        this.noise(ctx, out, t, 0.30, 'lowpass', 900, 120, 0.8, 0.28);
        this.tone(ctx, out, t, 170, 40, 0.30, 'sine', 0.26);
        return 0.30;
      case 'explosion-big':
        this.noise(ctx, out, t, 0.05, 'highpass', 2200, 2200, 0.5, 0.20); // initial crack
        this.noise(ctx, out, t, 0.46, 'lowpass', 1100, 90, 0.9, 0.32);
        this.tone(ctx, out, t, 130, 30, 0.46, 'sine', 0.34);
        return 0.46;

      // ---- alerts / stingers ----
      case 'under-attack':
        this.tone(ctx, out, t, 440, 440, 0.16, 'square', 0.20);
        this.tone(ctx, out, t, 330, 330, 0.16, 'square', 0.20, 0.2);
        this.tone(ctx, out, t, 440, 440, 0.18, 'square', 0.20, 0.4);
        return 0.6;
      case 'victory': {
        const notes = [392, 523, 659, 784];
        notes.forEach((f, i) => this.tone(ctx, out, t, f, f, 0.18, 'sine', 0.18, i * 0.12));
        return 0.12 * notes.length + 0.18;
      }
      case 'defeat': {
        const notes = [392, 330, 262, 196];
        notes.forEach((f, i) => this.tone(ctx, out, t, f, f, 0.24, 'triangle', 0.18, i * 0.14));
        return 0.14 * notes.length + 0.24;
      }

      default:
        return 0.05;
    }
  }
}

/** Process-wide singleton — imported directly by the controller (and anything that needs it). */
export const audio = new AudioEngine();
