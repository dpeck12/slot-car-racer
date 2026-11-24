// Headless check of the bot AI: runs bots around the track with the game's own
// physics and reports any de-slots (cars flying off). Usage:
//   npx esbuild scripts/sim.ts --bundle --platform=node --outfile=.sim.cjs && node .sim.cjs [Easy|Medium|Hard] [seconds]
import { readFileSync } from 'node:fs';
import { Track, type TrackData } from '../src/track/Track';
import { Physics } from '../src/systems/physics';
import { Bot } from '../src/ai/Bot';

const MPP = 0.02;
const difficulty = process.argv[2] ?? 'Medium';
const seconds = Number(process.argv[3] ?? 180);
const data = JSON.parse(readFileSync('public/assets/tracks/complex.json', 'utf8')) as TrackData;
const track = new (Track as unknown as new (d: TrackData, m: number) => Track)(data, MPP);

const n = 3;
const physics = new Physics(track, MPP);
physics.initCars(n);
physics.cars.forEach((c, i) => { c.sMeters = -(i + 0.5) * 1.6; });
const bots = new Array(n).fill(0).map(() => { const b = new Bot(track); b.setDifficulty(difficulty); return b; });

const dt = 1 / 120;
const wasOff = new Array(n).fill(false);
const offs: string[] = [];
for (let step = 0; step < seconds / dt; step++) {
  const throttles = physics.cars.map((c, i) => bots[i].update(c, dt).throttle);
  const before = physics.cars.map(c => ({ s: c.sMeters, v: c.v }));
  physics.update(dt, throttles);
  physics.cars.forEach((c, i) => {
    if (c.deslotted && !wasOff[i]) {
      const L = track.totalLengthMeters;
      const sW = ((before[i].s % L) + L) % L;
      offs.push(`t=${(step * dt).toFixed(1)}s bot${i + 1} s=${sW.toFixed(2)}m (${(100 * sW / L).toFixed(0)}% of lap) v=${before[i].v.toFixed(2)}m/s`);
    }
    wasOff[i] = c.deslotted;
  });
}
console.log(`track length ${track.totalLengthMeters.toFixed(1)} m, difficulty ${difficulty}, ${seconds}s`);
console.log(`laps: ${physics.cars.map(c => (c.sMeters / track.totalLengthMeters).toFixed(2)).join(', ')}`);
console.log(offs.length ? offs.join('\n') : 'no de-slots');
