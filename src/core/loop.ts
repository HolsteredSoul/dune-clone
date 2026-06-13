// Fixed-timestep game loop with an accumulator: the simulation advances in constant
// `1/hz` steps (deterministic, frame-rate independent), while rendering happens once per
// animation frame.

export class GameLoop {
  private last = 0;
  private acc = 0;
  private running = false;
  private readonly step: number;

  constructor(
    hz: number,
    private readonly update: (dt: number) => void,
    private readonly render: () => void,
  ) {
    this.step = 1 / hz;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    let elapsed = (now - this.last) / 1000;
    this.last = now;
    if (elapsed > 0.25) elapsed = 0.25; // clamp huge gaps (e.g. background tab)
    this.acc += elapsed;
    while (this.acc >= this.step) {
      this.update(this.step);
      this.acc -= this.step;
    }
    this.render();
    requestAnimationFrame(this.frame);
  };
}
