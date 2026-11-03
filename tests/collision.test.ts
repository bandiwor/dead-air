import { describe, expect, it } from 'vitest';
import { pushBox, pushCircle, rayBox, rayCircle, Statics, type Box } from '../src/sim/collision';
import { buildLayout, doorOf } from '../src/proc/layout';
import { WORLD, groundAt, heightAt, isWater, onPier, padHeight, surfaceAt } from '../src/proc/terrain';
import { HOUSE_SITES } from '../src/proc/sites';
import { toWorld } from '../src/sim/houses';

const box: Box = { cx: 0, cz: 0, hw: 1, hd: 0.5, c: 1, s: 0 };

describe('примитивы коллизий', () => {
  it('круг выталкивается из круга на сумму радиусов', () => {
    const p = { x: 0.5, z: 0 };
    expect(pushCircle(p, 0.4, 0, 0, 0.4)).toBe(true);
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(0.8, 5);
    expect(pushCircle({ x: 2, z: 0 }, 0.4, 0, 0, 0.4)).toBe(false);
  });

  it('круг выталкивается из OBB — снаружи и из центра', () => {
    const a = { x: 1.2, z: 0 };
    expect(pushBox(a, 0.4, box)).toBe(true);
    expect(a.x).toBeCloseTo(1.4, 5);
    const b = { x: 0.1, z: 0.05 };
    pushBox(b, 0.3, box);
    expect(Math.abs(b.z)).toBeGreaterThanOrEqual(0.8 - 1e-6);
  });

  it('повёрнутый OBB работает в локальных осях', () => {
    const r: Box = { cx: 0, cz: 0, hw: 2, hd: 0.2, c: Math.cos(Math.PI / 2), s: Math.sin(Math.PI / 2) };
    // повёрнут на 90°: длинная сторона вдоль z
    expect(pushBox({ x: 0, z: 1.5 }, 0.1, r)).toBe(true);
    expect(pushBox({ x: 1.5, z: 0 }, 0.1, r)).toBe(false);
  });

  it('лучи: попадание, промах, старт внутри', () => {
    expect(rayCircle(-5, 0, 1, 0, 0, 0, 1)).toBeCloseTo(4, 5);
    expect(rayCircle(-5, 3, 1, 0, 0, 0, 1)).toBe(-1);
    expect(rayCircle(0, 0, 1, 0, 0, 0, 1)).toBe(0);
    expect(rayBox(-5, 0, 1, 0, box)).toBeCloseTo(4, 5);
    expect(rayBox(-5, 2, 1, 0, box)).toBe(-1);
    expect(rayBox(5, 0, 1, 0, box)).toBe(-1);
  });
});

describe('статика мира', () => {
  const layout = buildLayout();
  const st = new Statics(layout);

  it('закрытая дверь — стена, открытая — проём', () => {
    const h = layout.houses[0]!;
    const out = doorOf(h, 1.5);
    const inn = doorOf(h, -1);
    const dx = inn.x - out.x;
    const dz = inn.z - out.z;
    const len = Math.hypot(dx, dz);
    st.doorOpen[0] = false;
    expect(st.raycast(out.x, out.z, dx / len, dz / len, len, false)).toBeLessThan(len - 0.1);
    st.doorOpen[0] = true;
    expect(st.raycast(out.x, out.z, dx / len, dz / len, len, false)).toBeCloseTo(len, 3);
  });

  it('сквозь стены дома не пройти и не прострелить', () => {
    const h = layout.houses[2]!;
    const [ax, az] = toWorld(h, 0, -h.d / 2 - 1.5);
    const [bx, bz] = toWorld(h, 0, 0);
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    expect(st.raycast(ax, az, dx / len, dz / len, len)).toBeLessThan(len);
    const p = { x: toWorld(h, 0, -h.d / 2 + 0.05)[0], z: toWorld(h, 0, -h.d / 2 + 0.05)[1] };
    st.resolve(p, 0.38);
    const [, lz] = [0, Math.hypot(p.x - h.x, p.z - h.z)];
    expect(lz).toBeGreaterThan(0);
  });

  it('граница мира удерживает внутри', () => {
    const p = { x: 500, z: 0 };
    st.resolve(p, 0.4);
    expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(WORLD.bounds + 1e-6);
  });
});

describe('рельеф', () => {
  it('детерминирован и конечен везде', () => {
    for (let i = 0; i < 400; i++) {
      const x = -80 + (i % 20) * 8;
      const z = -80 + Math.floor(i / 20) * 8;
      const h = heightAt(x, z);
      expect(Number.isFinite(h)).toBe(true);
      expect(heightAt(x, z)).toBe(h);
    }
  });

  it('пруд — вода, пристань — сухо и деревянный звук шагов', () => {
    expect(isWater(WORLD.pond.x, WORLD.pond.z)).toBe(true);
    const px = (WORLD.pier.x0 + WORLD.pier.x1) / 2;
    const pz = (WORLD.pier.z0 + WORLD.pier.z1) / 2;
    expect(onPier(px, pz)).toBe(true);
    expect(isWater(px, pz)).toBe(false);
    expect(groundAt(px, pz)).toBe(WORLD.pier.y);
    expect(surfaceAt(px, pz)).toBe(1);
  });

  it('площадь и дома — суша; пол дома ровный (площадка выровнена)', () => {
    expect(isWater(0, 0)).toBe(false);
    for (const h of HOUSE_SITES) {
      const y0 = padHeight(h.x, h.z);
      for (const [lx, lz] of [[-h.w / 2, -h.d / 2], [h.w / 2, h.d / 2], [h.w / 2, -h.d / 2], [-h.w / 2, h.d / 2], [0, 0]] as const) {
        const c = Math.cos(h.rot);
        const s = Math.sin(h.rot);
        const x = h.x + lx * c + lz * s;
        const z = h.z - lx * s + lz * c;
        expect(Math.abs(heightAt(x, z) - y0), `дом ${h.id}`).toBeLessThan(0.02);
      }
    }
  });

  it('Щель ниже склонов холма', () => {
    const c = WORLD.crevice;
    const mx = (c.ax + c.bx) / 2;
    const mz = (c.az + c.bz) / 2;
    expect(heightAt(mx, mz)).toBeLessThan(heightAt(mx + 8, mz) - 2);
  });
});
