// Bootstrap: wire canvas, input, camera, renderer, UI, and the game controller, then run the
// fixed-timestep loop (step = simulation, frame = input + render).

import { GameLoop } from './core/loop';
import { Input } from './core/input';
import { Camera } from './core/camera';
import { Renderer } from './render/renderer';
import { Ui } from './render/ui';
import { Game } from './game/game';
import { SIM_HZ, SIDEBAR_W } from './world/constants';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('2D canvas context unavailable');

const input = new Input(canvas);
const camera = new Camera();

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx!.imageSmoothingEnabled = false;
  camera.resize(window.innerWidth - SIDEBAR_W, window.innerHeight);
}
resize();

const renderer = new Renderer(ctx);
const ui = new Ui(ctx);
const game = new Game(camera, input, renderer, ui);

window.addEventListener('resize', resize);
(window as unknown as { game: unknown }).game = game;

const loop = new GameLoop(SIM_HZ, (dt) => game.step(dt), () => game.frame());
loop.start();
