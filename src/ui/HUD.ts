import type { RaceManager } from '../race/RaceManager';
import type { CarState } from '../systems/physics';

function fmtTime(t: number): string {
  if (!isFinite(t)) return '--:--.--';
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

const CAR_COLOURS = ['#00e6ff', '#ff6e00', '#ff2e63', '#8eff32', '#ffd400', '#bb86fc'];

export class HUD {
  private panel: HTMLDivElement;
  private rows: { lap: HTMLSpanElement; current: HTMLSpanElement; best: HTMLSpanElement; status: HTMLSpanElement }[] = [];
  private overlay: HTMLDivElement;
  private difficulty: HTMLSelectElement;

  constructor(onDifficultyChange: (name: string) => void, carCount: number) {
    this.panel = document.createElement('div');
    this.panel.className = 'hud';

    const table = document.createElement('table');
    const head = table.insertRow();
    for (const h of ['', 'Laps', 'Current', 'Best', '']) {
      const th = document.createElement('th');
      th.textContent = h;
      head.appendChild(th);
    }
    for (let i = 0; i < carCount; i++) {
      const tr = table.insertRow();
      const name = tr.insertCell();
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = CAR_COLOURS[i % CAR_COLOURS.length];
      name.append(swatch, i === 0 ? 'You' : `Bot ${i}`);
      if (i === 0) tr.className = 'you';
      const mk = () => { const c = tr.insertCell(); const s = document.createElement('span'); c.appendChild(s); return s; };
      this.rows.push({ lap: mk(), current: mk(), best: mk(), status: mk() });
    }
    this.panel.appendChild(table);

    const controls = document.createElement('div');
    controls.className = 'hud-controls';
    const label = document.createElement('label');
    label.textContent = 'Bots: ';
    this.difficulty = document.createElement('select');
    for (const name of ['Easy', 'Medium', 'Hard']) {
      const opt = document.createElement('option');
      opt.value = name; opt.textContent = name;
      this.difficulty.appendChild(opt);
    }
    this.difficulty.value = 'Medium';
    this.difficulty.addEventListener('change', () => onDifficultyChange(this.difficulty.value));
    label.appendChild(this.difficulty);
    const hint = document.createElement('span');
    hint.className = 'hint';
    hint.textContent = 'Hold ↑ / W (or press and hold on touch) to accelerate';
    controls.append(label, hint);
    this.panel.appendChild(controls);
    document.body.appendChild(this.panel);

    this.overlay = document.createElement('div');
    this.overlay.className = 'race-message';
    document.body.appendChild(this.overlay);
  }

  update(race: RaceManager, cars: CarState[]) {
    cars.forEach((c, i) => {
      const r = this.rows[i];
      r.lap.textContent = String(race.laps[i]);
      r.current.textContent = fmtTime(race.currentLap[i]);
      r.best.textContent = fmtTime(race.bestLap[i]);
      r.status.textContent = c.deslotted ? 'OFF!' : '';
    });

    // Race messages (the countdown itself is shown by the start lights)
    let msg = '';
    if (race.isFalseStart() && race.status === 'countdown') msg = 'FALSE START!';
    if (race.status === 'running' && race.isFalseStart() && cars[0]?.v < 0.1) msg = 'PENALTY';
    if (race.status === 'running' && cars[0]?.deslotted) msg = 'OFF THE TRACK!';
    this.overlay.textContent = msg;
  }
}
