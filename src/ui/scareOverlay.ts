import { Rng } from '../core/rng';

/**
 * Скример — поверх всего, в полный экран, в обход пиксельного пост-эффекта: лицо должно ударить
 * сразу и целиком, а не выплыть из глубины сцены. Лицо рисуется процедурно (canvas 2D) в двух
 * фазах — «рот открывается» — и меняется скачками, как в покадровой анимации.
 *
 * Последовательность (мс): 0 — удар (лицо уже во весь экран, рывок ближе) → 480 — темнота,
 * игрок выдыхает → 720 — второй удар вплотную, красный, → 1000 — гаснет.
 */
export class ScareOverlay {
  private readonly root: HTMLElement;
  private readonly face: HTMLElement;
  private readonly frames: HTMLCanvasElement[];
  private start = -1;
  private raf = 0;
  private flashes = true;
  private lastFrame = -1;
  private readonly rng = new Rng(4242);

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'scare hidden';
    this.face = document.createElement('div');
    this.face.className = 'scare-face';
    this.root.appendChild(this.face);
    parent.appendChild(this.root);
    this.frames = [paintFace(13, 0), paintFace(13, 1), paintFace(13, 2)];
    for (const f of this.frames) this.face.appendChild(f);
  }

  get active(): boolean {
    return this.start >= 0;
  }

  play(reduceFlashes: boolean): void {
    this.flashes = !reduceFlashes;
    this.start = performance.now();
    this.lastFrame = -1;
    this.root.classList.remove('hidden');
    cancelAnimationFrame(this.raf);
    const tick = (): void => {
      if (!this.step()) return;
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  private show(i: number): void {
    this.frames.forEach((f, k) => (f.style.visibility = k === i ? 'visible' : 'hidden'));
  }

  private step(): boolean {
    const t = performance.now() - this.start;
    const r = this.rng;
    const st = this.face.style;
    const root = this.root.style;
    if (t > 1100) {
      this.root.classList.add('hidden');
      this.start = -1;
      return false;
    }
    // покадрово: поза меняется скачком 14 раз в секунду, не плавно
    const frame = Math.floor(t / 70);
    const jump = frame !== this.lastFrame;
    this.lastFrame = frame;
    let scale = 1;
    let visible = true;
    let which = 0;
    let filter = 'contrast(1.35) brightness(1.05)';
    let invert = false;
    root.opacity = '1';
    if (t < 480) {
      // первый удар: в первом же кадре — во весь экран, за 90 мс рывком ещё ближе
      scale = t < 90 ? 1.18 + (t / 90) * 0.22 : 1.4 + (t - 90) * 0.0002;
      which = t < 160 ? 0 : 1;
      if (this.flashes && t < 45) invert = true;
    } else if (t < 720) {
      // темнота: передышка, игрок успевает выдохнуть
      visible = false;
    } else {
      // второй удар — вплотную, рот раскрыт до конца, кровь в глазах
      scale = 1.95 + (t - 720) * 0.0004;
      which = 2;
      filter = 'contrast(1.8) brightness(0.62) sepia(1) saturate(3.4) hue-rotate(-48deg)';
      if (this.flashes && t < 760) invert = true;
      if (t > 960) root.opacity = String(Math.max(0, 1 - (t - 960) / 140));
    }
    // негатив — на весь экран разом (белая вспышка с чёрным лицом), а не прямоугольником
    root.filter = invert ? 'invert(1)' : '';
    this.face.style.visibility = visible ? 'visible' : 'hidden';
    if (visible) {
      this.show(which);
      if (jump) {
        const dx = r.range(-3, 3);
        const dy = r.range(-3, 3);
        const rot = r.range(-4, 4);
        st.setProperty('--dx', `${dx}%`);
        st.setProperty('--dy', `${dy}%`);
        st.setProperty('--rot', `${rot}deg`);
      }
      st.transform = `translate(calc(-50% + var(--dx, 0%)), calc(-50% + var(--dy, 0%))) rotate(var(--rot, 0deg)) scale(${scale.toFixed(3)})`;
      st.filter = filter;
    }
    return true;
  }
}

/**
 * Процедурный портрет. Не «монстр», а почти человек — поэтому и страшно: вытянутый бледный череп,
 * провалы глаз с точками-зрачками, разинутая растянутая пасть, мокрые волосы, потёки, плёночное зерно.
 * phase: 0 — рот приоткрыт, 1 — раскрыт, 2 — раскрыт до предела, глаза в крови.
 */
function paintFace(seed: number, phase: number): HTMLCanvasElement {
  const W = 480;
  const H = 640;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  if (!g) return cv;
  const r = new Rng(seed);
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  const cx = W / 2;
  const cy = H * 0.48;

  // волосы позади головы
  g.strokeStyle = '#050606';
  g.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const x0 = cx + r.range(-150, 150);
    g.lineWidth = r.range(3, 9);
    g.beginPath();
    g.moveTo(x0, cy - 250);
    g.bezierCurveTo(x0 + r.range(-60, 60), cy - 80, x0 + r.range(-80, 80), cy + 120, x0 + r.range(-60, 60), H + 20);
    g.stroke();
  }

  // лицо: вытянутый овал, свет сверху-спереди, кожа серо-зелёная, как у утопленника
  const skin = g.createRadialGradient(cx - 20, cy - 70, 30, cx, cy, 260);
  skin.addColorStop(0, '#c9c6b4');
  skin.addColorStop(0.45, '#8f907f');
  skin.addColorStop(0.8, '#43463d');
  skin.addColorStop(1, '#0d0e0c');
  g.fillStyle = skin;
  // не овал: широкий лоб, острые скулы, длинный узкий подбородок; челюсть отвисает вместе с ртом
  const jawDrop = phase === 0 ? 0 : phase === 1 ? 45 : 95;
  g.beginPath();
  g.moveTo(cx, cy - 238);
  g.bezierCurveTo(cx + 120, cy - 240, cx + 158, cy - 140, cx + 150, cy - 40);
  g.bezierCurveTo(cx + 146, cy + 40, cx + 120, cy + 110 + jawDrop * 0.4, cx + 70, cy + 190 + jawDrop);
  g.bezierCurveTo(cx + 35, cy + 236 + jawDrop, cx - 35, cy + 240 + jawDrop, cx - 74, cy + 186 + jawDrop);
  g.bezierCurveTo(cx - 122, cy + 104 + jawDrop * 0.4, cx - 152, cy + 30, cx - 148, cy - 50);
  g.bezierCurveTo(cx - 150, cy - 150, cx - 112, cy - 238, cx, cy - 238);
  g.fill();
  // снизу — тень от фонаря в руках: свет падает сверху, подбородок тонет в темноте
  const under = g.createLinearGradient(0, cy + 60, 0, cy + 260 + jawDrop);
  under.addColorStop(0, 'rgba(0,0,0,0)');
  under.addColorStop(1, 'rgba(0,0,0,0.7)');
  g.fillStyle = under;
  g.fillRect(0, cy + 60, W, 320);

  // впалые щёки и виски
  for (const s of [-1, 1]) {
    const hollow = g.createRadialGradient(cx + s * 95, cy + 40, 5, cx + s * 95, cy + 40, 90);
    hollow.addColorStop(0, 'rgba(10,12,10,0.75)');
    hollow.addColorStop(1, 'rgba(10,12,10,0)');
    g.fillStyle = hollow;
    g.beginPath();
    g.ellipse(cx + s * 95, cy + 40, 70, 110, 0, 0, Math.PI * 2);
    g.fill();
  }

  // пятна и жилки — кожа не гладкая
  for (let i = 0; i < 260; i++) {
    const a = r.range(0, Math.PI * 2);
    const d = Math.sqrt(r.next());
    const x = cx + Math.cos(a) * 140 * d;
    const y = cy + Math.sin(a) * 225 * d;
    g.fillStyle = `rgba(${r.chance(0.2) ? '60,20,20' : '20,24,20'},${r.range(0.05, 0.22)})`;
    g.beginPath();
    g.ellipse(x, y, r.range(2, 14), r.range(2, 10), r.range(0, 3), 0, Math.PI * 2);
    g.fill();
  }

  // глаза: провалы разной величины, внутри — мелкие белые точки, смотрят мимо друг друга
  const eyeScale = phase === 2 ? 1.25 : phase === 1 ? 1.1 : 1;
  const eyes: [number, number, number, number, number, number][] = [
    [cx - 58, cy - 55, 44, 54, -6, 4],
    [cx + 60, cy - 46, 36, 46, 7, -3],
  ];
  for (const [ex, ey, rx, ry, px, py] of eyes) {
    const sock = g.createRadialGradient(ex, ey, 4, ex, ey, rx * 1.6 * eyeScale);
    sock.addColorStop(0, '#000');
    sock.addColorStop(0.55, '#020202');
    sock.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sock;
    g.beginPath();
    g.ellipse(ex, ey, rx * 1.6 * eyeScale, ry * 1.5 * eyeScale, r.range(-0.2, 0.2), 0, Math.PI * 2);
    g.fill();
    if (phase === 2) {
      g.fillStyle = 'rgba(150,10,10,0.55)';
      g.beginPath();
      g.ellipse(ex, ey, rx * 0.8, ry * 0.7, 0, 0, Math.PI * 2);
      g.fill();
    }
    // зрачок: крошечный, яркий — взгляд «сквозь»
    g.fillStyle = '#f4f1e6';
    g.beginPath();
    g.arc(ex + px, ey + py, phase === 2 ? 3.5 : 5, 0, Math.PI * 2);
    g.fill();
    // потёк из глаза
    g.strokeStyle = phase === 2 ? 'rgba(90,6,6,0.9)' : 'rgba(25,18,14,0.8)';
    g.lineWidth = r.range(4, 8);
    g.beginPath();
    g.moveTo(ex + r.range(-8, 8), ey + ry);
    g.bezierCurveTo(ex + r.range(-12, 12), ey + 90, ex + r.range(-16, 16), ey + 140, ex + r.range(-20, 20), ey + r.range(170, 230));
    g.stroke();
  }

  // нос — почти нет: две тёмные щели
  g.fillStyle = 'rgba(8,8,8,0.85)';
  g.beginPath();
  g.ellipse(cx - 9, cy + 30, 5, 10, 0.3, 0, Math.PI * 2);
  g.ellipse(cx + 9, cy + 30, 5, 10, -0.3, 0, Math.PI * 2);
  g.fill();

  // пасть: растянута вниз, неестественно — челюсть будто вывихнута
  const mh = phase === 0 ? 70 : phase === 1 ? 135 : 190;
  const mw = phase === 2 ? 74 : 60;
  const my = cy + 95 + mh * 0.45 + jawDrop * 0.25;
  const mouth = g.createRadialGradient(cx, my, 5, cx, my, mh);
  mouth.addColorStop(0, '#000');
  mouth.addColorStop(0.7, '#030000');
  mouth.addColorStop(1, '#2a0a08');
  g.fillStyle = mouth;
  g.beginPath();
  g.ellipse(cx, my, mw, mh * 0.55, 0, 0, Math.PI * 2);
  g.fill();
  // зубы: неровные, разной длины, сверху и снизу
  g.fillStyle = '#b9b29a';
  const teeth = 9;
  for (let i = 0; i < teeth; i++) {
    const tx = cx - mw * 0.8 + (i / (teeth - 1)) * mw * 1.6;
    const top = my - mh * 0.5 + Math.abs(tx - cx) * 0.25;
    const len = r.range(10, 24) * (1 - Math.abs(tx - cx) / mw * 0.5);
    g.beginPath();
    g.moveTo(tx - 6, top);
    g.lineTo(tx + 6, top);
    g.lineTo(tx + r.range(-2, 2), top + len);
    g.fill();
    const bot = my + mh * 0.5 - Math.abs(tx - cx) * 0.25;
    g.beginPath();
    g.moveTo(tx - 5, bot);
    g.lineTo(tx + 5, bot);
    g.lineTo(tx + r.range(-2, 2), bot - len * 0.8);
    g.fill();
  }

  // мокрые пряди поверх лица
  // мокрые пряди поверх лица: слипшиеся, волнистые, разной толщины
  for (let i = 0; i < 34; i++) {
    const side = i % 2 ? -1 : 1;
    const x0 = cx + side * r.range(20, 150);
    const len = r.range(380, 560);
    const wav = r.range(4, 14);
    const fr = r.range(0.02, 0.05);
    const drift = r.range(0, 40);
    g.strokeStyle = `rgba(4,5,5,${r.range(0.7, 1)})`;
    g.lineWidth = r.range(1.5, 7);
    g.beginPath();
    for (let k = 0; k <= 24; k++) {
      const y = cy - 236 + (k / 24) * len;
      const x = x0 + side * (k / 24) * drift + Math.sin(y * fr + i) * wav;
      if (k === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }

  // смягчение: уменьшаем и растягиваем обратно — края расплываются, как на плохом снимке
  const tmp = document.createElement('canvas');
  tmp.width = Math.round(W * 0.34);
  tmp.height = Math.round(H * 0.34);
  const tg = tmp.getContext('2d');
  if (tg) {
    tg.imageSmoothingEnabled = true;
    tg.drawImage(cv, 0, 0, tmp.width, tmp.height);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(tmp, 0, 0, W, H);
  }

  // плёночное зерно и виньетка — «фотография», а не рисунок
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r.next() - 0.5) * 46;
    d[i] = clamp8(d[i]! + n);
    d[i + 1] = clamp8(d[i + 1]! + n);
    d[i + 2] = clamp8(d[i + 2]! + n);
  }
  g.putImageData(img, 0, 0);
  const vig = g.createRadialGradient(cx, cy, 120, cx, cy, 420);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.95)');
  g.fillStyle = vig;
  g.fillRect(0, 0, W, H);
  return cv;
}

function clamp8(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
