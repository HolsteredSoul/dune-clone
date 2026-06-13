// Viewport over the world. Holds the world-space pixel position of the top-left corner and
// converts between world and screen space. Pans with WASD/arrows and screen-edge scrolling.

import { CAMERA_SPEED, EDGE_SCROLL_MARGIN, MAP_W, MAP_H, TILE } from '../world/constants';
import type { Input } from './input';

export class Camera {
  x = 0; // world px at the left edge of the view
  y = 0; // world px at the top edge of the view
  viewW = 0;
  viewH = 0;

  resize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    this.clamp();
  }

  centerOn(wx: number, wy: number): void {
    this.x = wx - this.viewW / 2;
    this.y = wy - this.viewH / 2;
    this.clamp();
  }

  update(dt: number, input: Input): void {
    let dx = 0;
    let dy = 0;
    // Arrow keys pan (letter keys are reserved for unit commands); edge-scroll below.
    if (input.isDown('ArrowLeft')) dx -= 1;
    if (input.isDown('ArrowRight')) dx += 1;
    if (input.isDown('ArrowUp')) dy -= 1;
    if (input.isDown('ArrowDown')) dy += 1;

    const m = EDGE_SCROLL_MARGIN;
    const inMap = input.mouseX >= 0 && input.mouseX <= this.viewW
      && input.mouseY >= 0 && input.mouseY <= this.viewH;
    if (inMap) {
      if (input.mouseX < m) dx -= 1;
      if (input.mouseX > this.viewW - m) dx += 1;
      if (input.mouseY < m) dy -= 1;
      if (input.mouseY > this.viewH - m) dy += 1;
    }

    this.x += dx * CAMERA_SPEED * dt;
    this.y += dy * CAMERA_SPEED * dt;
    this.clamp();
  }

  private clamp(): void {
    const maxX = Math.max(0, MAP_W * TILE - this.viewW);
    const maxY = Math.max(0, MAP_H * TILE - this.viewH);
    this.x = Math.min(Math.max(0, this.x), maxX);
    this.y = Math.min(Math.max(0, this.y), maxY);
  }
}
