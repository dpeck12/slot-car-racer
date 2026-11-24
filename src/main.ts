import * as PIXI from 'pixi.js';
import { FixedStepLoop } from './engine/loop';
import { Track } from './track/Track';
import { Physics } from './systems/physics';
import { Input } from './systems/input';
import { Bot } from './ai/Bot';
import { RaceManager } from './race/RaceManager';
import { HUD } from './ui/HUD';
import { StartUI } from './ui/StartUI';

const appContainer = document.getElementById('app')!;

const app = new PIXI.Application({
  backgroundColor: 0x1f6f2f, // grass
  resizeTo: appContainer,
  antialias: true,
  resolution: Math.max(1, Math.floor(window.devicePixelRatio || 1)),
  autoDensity: true
});
appContainer.appendChild(app.view as HTMLCanvasElement);

// World scale: meters per pixel
const METERS_PER_PIXEL = 0.02; // 50 px = 1 m

async function bootstrap() {
  // BASE_URL keeps asset paths working when the game is served from a sub-path (GitHub Pages).
  const track = await Track.load(`${import.meta.env.BASE_URL}assets/tracks/complex.json`, METERS_PER_PIXEL);

  const physics = new Physics(track, METERS_PER_PIXEL);
  const input = new Input();
  const botCount = 3; // more than 1 bot opponent
  const carCount = 1 + botCount; // index 0 = human
  physics.initCars(carCount);
  const bots: Bot[] = new Array(botCount).fill(0).map(() => new Bot(track));
  const race = new RaceManager(track.totalLengthMeters, carCount);
  const hud = new HUD((name) => bots.forEach(b => b.setDifficulty(name)), carCount);
  const startUI = new StartUI(() => race.startCountdown(3));

  // Graphics layers
  const gTrack = new PIXI.Graphics();
  const gEdges = new PIXI.Graphics();
  app.stage.addChild(gTrack);
  app.stage.addChild(gEdges);
  // Car sprites
  const makeCarTexture = (color: number) => {
    const g = new PIXI.Graphics();
    const width = 10;
    const length = 22;
    g.beginFill(color);
    g.drawRect(-length / 2, -width / 2, length, width);
    g.endFill();
    return app.renderer.generateTexture(g);
  };
  const palette = [0x00e6ff, 0xff6e00, 0xff2e63, 0x8eff32, 0xffd400, 0xbb86fc];
  const sprites: PIXI.Sprite[] = new Array(carCount).fill(0).map((_, i) => {
    const tex = makeCarTexture(palette[i % palette.length]);
    const sp = new PIXI.Sprite(tex);
    sp.anchor.set(0.5);
    app.stage.addChild(sp);
    return sp;
  });

  const bounds = track.boundsPx;

  // Track surface: a wide stroke along the centreline. Unlike a filled polygon
  // this can't produce stray triangles, and it handles tight corners cleanly.
  const drawLoop = (g: PIXI.Graphics, pts: { x: number; y: number }[]) => {
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.closePath();
  };
  gTrack.lineStyle({ width: track.laneWidthPx, color: 0x2b2b2b, join: PIXI.LINE_JOIN.ROUND, cap: PIXI.LINE_CAP.ROUND });
  drawLoop(gTrack, track.pointsPx);
  // The slot the cars run in
  gTrack.lineStyle({ width: 2, color: 0x111111, join: PIXI.LINE_JOIN.ROUND });
  drawLoop(gTrack, track.pointsPx);

  // Edge lines
  gEdges.lineStyle(2, 0xffffff);
  drawLoop(gEdges, track.leftEdgePx);
  drawLoop(gEdges, track.rightEdgePx);

  // Chequered start/finish line across the track at s = 0
  {
    const p = track.samplePose(0);
    const nx = -Math.sin(p.headingRad), ny = Math.cos(p.headingRad);
    const tx = Math.cos(p.headingRad), ty = Math.sin(p.headingRad);
    const squares = 8, size = track.laneWidthPx / squares;
    for (let row = 0; row < 2; row++) {
      for (let k = 0; k < squares; k++) {
        gEdges.lineStyle(0);
        gEdges.beginFill((k + row) % 2 === 0 ? 0xffffff : 0x111111);
        const off = -track.laneWidthPx / 2 + k * size;
        const along = (row - 1) * size;
        const cx = p.x + nx * off + tx * along, cy = p.y + ny * off + ty * along;
        gEdges.drawPolygon([
          cx, cy,
          cx + nx * size, cy + ny * size,
          cx + nx * size + tx * size, cy + ny * size + ty * size,
          cx + tx * size, cy + ty * size
        ]);
        gEdges.endFill();
      }
    }
  }

  // Starting grid: one box per car in single file behind the line (slot cars share
  // one slot, so side-by-side grid slots would put two cars on the same spot).
  const gridSpacingMeters = 1.6;
  const gridS: number[] = new Array(carCount).fill(0).map((_, i) => -(i + 0.5) * gridSpacingMeters);
  gEdges.lineStyle(2, 0xffffff, 0.8);
  for (const s of gridS) {
    const p = track.samplePose(s);
    const nx = -Math.sin(p.headingRad), ny = Math.cos(p.headingRad);
    const tx = Math.cos(p.headingRad), ty = Math.sin(p.headingRad);
    const halfL = 18, halfW = track.laneWidthPx * 0.35;
    const corner = (a: number, b: number) => [p.x + tx * a + nx * b, p.y + ty * a + ny * b] as const;
    const pts = [corner(-halfL, -halfW), corner(halfL, -halfW), corner(halfL, halfW), corner(-halfL, halfW)];
    gEdges.moveTo(pts[0][0], pts[0][1]);
    for (const q of pts.slice(1)) gEdges.lineTo(q[0], q[1]);
    gEdges.lineTo(pts[0][0], pts[0][1]);
  }

  // Fit the whole track on screen, leaving room for the HUD panel, and refit on resize.
  const fitCamera = () => {
    const marginCam = 40 + track.laneWidthPx;
    // Keep the track clear of the HUD panel in the top-left corner.
    const hudBottom = document.querySelector('.hud')?.getBoundingClientRect().bottom ?? 0;
    const topReserve = Math.min(hudBottom + 8, app.renderer.screen.height * 0.35);
    const screenW = app.renderer.screen.width;
    const screenH = app.renderer.screen.height;
    const scaleX = (screenW - marginCam * 2) / bounds.width;
    const scaleY = (screenH - topReserve - marginCam * 2) / bounds.height;
    const scale = Math.max(0.05, Math.min(scaleX, scaleY));
    app.stage.scale.set(scale);
    app.stage.position.set(
      screenW / 2 - (bounds.x + bounds.width / 2) * scale,
      topReserve + (screenH - topReserve) / 2 - (bounds.y + bounds.height / 2) * scale
    );
  };
  fitCamera();
  app.renderer.on('resize', fitCamera);

  // Place cars on the grid. Positions are negative (just behind the line) so the
  // first crossing of the line starts the lap clock instead of counting a lap.
  for (let i = 0; i < carCount; i++) {
    physics.cars[i].sMeters = gridS[i];
    physics.cars[i].v = 0;
    physics.cars[i].deslotted = false;
    physics.cars[i].marshalTimer = 0;
  }

  // Previous states for interpolation
  let prevStates = physics.cars.map(c => ({ ...c }));

  const loop = new FixedStepLoop(1 / 120, (dt) => {
    // Inputs
    input.update();

    // Bot updates for each bot car (indices 1..carCount-1)
    const throttles: number[] = new Array(carCount).fill(0);
    // human throttle (index 0)
    throttles[0] = race.throttleMultiplier(0) * input.state.throttle;
    for (let b = 0; b < botCount; b++) {
      const idx = 1 + b;
      const botOut = bots[b].update(physics.cars[idx], dt);
      throttles[idx] = race.throttleMultiplier(idx) * botOut.throttle;
    }

    // Physics step
    // Capture previous states before update
    prevStates = physics.cars.map(c => ({ ...c }));
    physics.update(dt, throttles);
    race.update(physics.cars, dt, input.state);
  }, (alpha, dt) => {
    // Render cars via sprite transforms with prev→current interpolation
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const renderCar = (sprite: PIXI.Sprite, prev: typeof physics.cars[number], curr: typeof physics.cars[number]) => {
      let x: number, y: number, rot: number;
      const prevOff = prev.deslotted && prev.offX !== undefined && prev.offY !== undefined;
      const currOff = curr.deslotted && curr.offX !== undefined && curr.offY !== undefined;
      if (prevOff || currOff) {
        const px = prev.offX ?? curr.offX ?? 0;
        const py = prev.offY ?? curr.offY ?? 0;
        const cx = curr.offX ?? prev.offX ?? px;
        const cy = curr.offY ?? prev.offY ?? py;
        x = lerp(px, cx, alpha);
        y = lerp(py, cy, alpha);
        const ang = Math.atan2(curr.offVY ?? prev.offVY ?? 0, curr.offVX ?? prev.offVX ?? 0);
        rot = ang;
      } else {
        const s = lerp(prev.sMeters, curr.sMeters, alpha);
        const pose = track.samplePose(s);
        x = pose.x; y = pose.y; rot = pose.headingRad;
      }
      sprite.position.set(x, y);
      sprite.rotation = rot;
    };

    for (let i = 0; i < carCount; i++) {
      renderCar(sprites[i], prevStates[i], physics.cars[i]);
    }

    hud.update(race, physics.cars);
    startUI.update(race);
  });

  loop.start();
}

bootstrap().catch((err) => console.error(err));
