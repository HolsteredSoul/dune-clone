// Input collects continuous state (keys, mouse position/buttons) plus a queue of discrete
// events (clicks, key presses) that the controller drains once per rendered frame. Discrete
// events must not be processed per fixed-sim-step, or a single click would fire many times.

export interface PointerEvent2 {
  kind: 'leftdown' | 'leftup' | 'rightdown';
  x: number;
  y: number;
}

export class Input {
  private readonly keys = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  leftDown = false;
  rightDown = false;

  readonly pointerEvents: PointerEvent2[] = [];
  readonly keyPresses: string[] = [];

  constructor(target: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (!e.repeat) this.keyPresses.push(e.code);
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
