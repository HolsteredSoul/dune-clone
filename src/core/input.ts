// Input collects continuous state (keys, mouse position/buttons) plus a queue of discrete
// events (clicks, key presses) that the controller drains once per rendered frame. Discrete
// events must not be processed per fixed-sim-step, or a single click would fire many times.

export interface PointerEvent2 {
  kind: 'leftdown' | 'leftup' | 'rightdown';
  x: number;
  y: number;
}

/** A discrete key press with the modifier state captured at press time (so control-group
 *  assign-vs-select isn't ambiguous if a modifier is released before the frame processes it). */
export interface KeyPress {
  code: string;
  ctrl: boolean;
  shift: boolean;
}

export class Input {
  private readonly keys = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  leftDown = false;
  rightDown = false;

  readonly pointerEvents: PointerEvent2[] = [];
  readonly keyPresses: KeyPress[] = [];

  constructor(target: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      // Best-effort suppress browser defaults for modifier+digit (control groups). Ctrl+digit is
      // a reserved tab-switch in most browsers and may not be preventable — Shift+digit is the
      // reliable assign modifier (see Game.onKey).
      if ((e.ctrlKey || e.shiftKey) && /^Digit[1-9]$/.test(e.code)) e.preventDefault();
      // Quick-save / quick-load shortcuts: stop the browser's Save-page / address-bar defaults.
      if (e.ctrlKey && (e.code === 'KeyS' || e.code === 'KeyL')) e.preventDefault();
      if (!e.repeat) this.keyPresses.push({ code: e.code, ctrl: e.ctrlKey, shift: e.shiftKey });
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.leftDown = false; });

    const pos = (e: MouseEvent) => {
      const r = target.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
    };
    target.addEventListener('mousemove', pos);
    target.addEventListener('mousedown', (e) => {
      pos(e);
      if (e.button === 0) { this.leftDown = true; this.push('leftdown'); }
      else if (e.button === 2) { this.rightDown = true; this.push('rightdown'); }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) { this.leftDown = false; this.push('leftup'); }
      else if (e.button === 2) { this.rightDown = false; }
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private push(kind: PointerEvent2['kind']): void {
    this.pointerEvents.push({ kind, x: this.mouseX, y: this.mouseY });
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  /** Clear discrete event queues; call once per rendered frame after processing. */
  flush(): void {
    this.pointerEvents.length = 0;
    this.keyPresses.length = 0;
  }
}
