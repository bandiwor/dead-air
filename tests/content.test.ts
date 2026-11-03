import { describe, expect, it } from 'vitest';
import { NIGHTS } from '../src/content/nights';
import { INTERIORS } from '../src/content/interiors';
import { WEAPONS } from '../src/content/weapons';
import { SOUNDS, TEXTURES } from '../src/content/assets';
import { RECIPES } from '../src/audio/recipes';
import { BESTIARY } from '../src/content/bestiary';
import { ENEMIES, KIND_BY_ID } from '../src/content/enemies';
import { ru } from '../src/i18n/ru';
import { isStrKey } from '../src/i18n';
import { buildLayout, doorOf } from '../src/proc/layout';
import { Statics } from '../src/sim/collision';
import { toLocal, toWorld, WALL, houseAt } from '../src/sim/houses';
import { PLAYER_R } from '../src/sim/player';
import type { Effect } from '../src/content/script';

const layout = buildLayout();
const statics = new Statics(layout);
for (let i = 0; i < statics.doorOpen.length; i++) statics.doorOpen[i] = true;

/** Все строковые ключи, на которые ссылается контент. */
function effectKeys(list: readonly Effect[]): string[] {
  const out: string[] = [];
  for (const e of list) {
    if ('line' in e) out.push(e.line);
    if ('note' in e) out.push(e.note);
    if ('objective' in e && e.objective) out.push(e.objective);
  }
  return out;
}

describe('контент ночей', () => {
  for (const night of NIGHTS) {
    describe(night.id, () => {
      it('волны идут по порядку и успевают до рассвета', () => {
        let prev = -1;
        for (const w of night.waves) {
          expect(w.at).toBeGreaterThan(prev);
          expect(w.at).toBeLessThan(night.duration - 30);
          expect(w.spawns.length).toBeGreaterThan(0);
          for (const s of w.spawns) expect(KIND_BY_ID[s.kind]).toBeDefined();
          if (w.reward?.weapon) expect(WEAPONS.some((x) => x.id === w.reward!.weapon)).toBe(true);
          prev = w.at;
        }
      });

      it('id битов, домов и особых действий уникальны; ссылки на действия существуют', () => {
        const beatIds = night.beats.map((b) => b.id);
        expect(new Set(beatIds).size).toBe(beatIds.length);
        const extraIds = night.extras.map((x) => x.id);
        expect(new Set(extraIds).size).toBe(extraIds.length);
        const houses = night.houses.map((h) => h.house);
        expect(new Set(houses).size).toBe(houses.length);
        const all: Effect[] = [...night.beats.flatMap((b) => b.do), ...night.extras.flatMap((x) => x.effects), ...night.houses.flatMap((h) => [...h.knock, ...h.notes.flatMap((n) => n.after ?? [])])];
        for (const e of all) {
          if ('enable' in e) expect(extraIds).toContain(e.enable);
          if ('disable' in e) expect(extraIds).toContain(e.disable);
          if ('wait' in e) expect(e.wait).toBeGreaterThan(0);
          if ('openDoor' in e) expect(layout.houses[e.openDoor]).toBeDefined();
          if ('drop' in e && e.weapon) expect(WEAPONS.some((x) => x.id === e.weapon)).toBe(true);
        }
      });

      it('все тексты существуют в локали', () => {
        const keys = [
          night.titleKey, night.knockPrompt, night.dawnTruth, night.dawnTitle, night.dawnSub, ...night.rules, ...night.fragments,
          ...night.intro.flatMap((s) => (s.line ? [s.line] : [])), ...night.dawn.flatMap((s) => (s.line ? [s.line] : [])),
          ...night.waves.flatMap((w) => [w.startLine, w.endLine].filter((x): x is NonNullable<typeof x> => !!x)),
          ...night.beats.flatMap((b) => effectKeys(b.do)), ...night.extras.flatMap((x) => [x.prompt, ...effectKeys(x.effects)]),
          ...night.houses.flatMap((h) => [...h.notes.map((n) => n.key), ...effectKeys(h.knock), ...h.notes.flatMap((n) => effectKeys(n.after ?? []))]),
        ];
        for (const k of keys) expect(isStrKey(k), k).toBe(true);
      });

      it('ровно 10 обрывков, все разные', () => {
        expect(night.fragments.length).toBe(10);
        expect(new Set(night.fragments).size).toBe(10);
      });

      it('записки в домах досягаемы: рядом есть свободная точка внутри дома', () => {
        for (const hs of night.houses) {
          const h = layout.houses[hs.house]!;
          for (const n of hs.notes) {
            const [nx, nz] = toWorld(h, n.x, n.z);
            let ok = false;
            for (let a = 0; a < 32 && !ok; a++) {
              for (const r of [0.5, 0.8, 1.05]) {
                const px = nx + Math.cos((a / 32) * Math.PI * 2) * r;
                const pz = nz + Math.sin((a / 32) * Math.PI * 2) * r;
                if (houseAt(layout.houses, px, pz) !== hs.house) continue;
                const pos = { x: px, z: pz };
                const hit = statics.resolve(pos, PLAYER_R);
                if (!hit) ok = true;
              }
            }
            expect(ok, `${night.id}: записка ${n.id}`).toBe(true);
          }
        }
      });

      it('особые действия в домах стоят внутри своего дома', () => {
        for (const x of night.extras) {
          if (typeof x.at !== 'object') continue;
          const h = layout.houses[x.at.house]!;
          const [wx, wz] = toWorld(h, x.at.x, x.at.z);
          expect(houseAt(layout.houses, wx, wz)).toBe(x.at.house);
        }
      });
    });
  }
});

describe('интерьеры и дома', () => {
  it('мебель целиком внутри стен', () => {
    for (const it of INTERIORS) {
      const h = layout.houses[it.house]!;
      for (const f of it.furniture) {
        expect(Math.abs(f.x) + (f.r ?? 0), `${it.house}:${f.type}`).toBeLessThan(h.w / 2 - WALL + 0.05);
        expect(Math.abs(f.z) + (f.r ?? 0), `${it.house}:${f.type}`).toBeLessThan(h.d / 2 - WALL + 0.05);
      }
    }
  });

  it('у каждого дома свободен подход к двери и проём', () => {
    for (const h of layout.houses) {
      for (const out of [1.2, 0.3, -0.6, -1.2]) {
        const d = doorOf(h, out);
        const pos = { x: d.x, z: d.z };
        statics.resolve(pos, PLAYER_R);
        expect(Math.hypot(pos.x - d.x, pos.z - d.z), `дом ${h.id}, точка ${out}`).toBeLessThan(0.05);
      }
    }
  });

  it('деревья не растут в домах, на пристани и в пруду у берега', () => {
    for (const t of layout.trees) {
      for (const h of [...layout.houses, layout.hut]) {
        const [lx, lz] = toLocal(h, t.x, t.z);
        expect(Math.abs(lx) < h.w / 2 + 1 && Math.abs(lz) < h.d / 2 + 2).toBe(false);
      }
    }
  });

  it('координаты дома: туда и обратно', () => {
    const h = layout.houses[3]!;
    const [x, z] = toWorld(h, 1.3, -0.7);
    const [lx, lz] = toLocal(h, x, z);
    expect(lx).toBeCloseTo(1.3, 6);
    expect(lz).toBeCloseTo(-0.7, 6);
  });
});

describe('ассеты, локаль, бестиарий', () => {
  it('у каждого процедурного звука есть рецепт, у каждой текстуры — генератор или файл', () => {
    for (const [id, src] of Object.entries(SOUNDS)) if ('proc' in src) expect(RECIPES[src.proc], id).toBeDefined();
    for (const [id, src] of Object.entries(TEXTURES)) expect('proc' in src || 'file' in src, id).toBe(true);
  });

  it('в строках нет пустых значений и незакрытых плейсхолдеров', () => {
    for (const [k, v] of Object.entries(ru)) {
      expect(v.trim().length, k).toBeGreaterThan(0);
      expect((v.match(/\{/g) ?? []).length, k).toBe((v.match(/\}/g) ?? []).length);
    }
  });

  it('реплики громкоговорителя Режиссёра существуют', () => {
    for (const n of [1, 2, 3]) expect(isStrKey(`n1.speaker.${n}`)).toBe(true);
  });

  it('карточки бестиария есть у всех боевых существ, тексты на месте', () => {
    for (const kind of Object.values(KIND_BY_ID)) {
      const card = BESTIARY[kind];
      expect(card, `kind ${kind}`).toBeDefined();
      for (const k of [card!.name, card!.desc, card!.tip]) expect(isStrKey(k)).toBe(true);
      expect(ENEMIES[kind].hp).toBeGreaterThan(0);
    }
  });

  it('оружие: разумные параметры', () => {
    for (const w of WEAPONS) {
      expect(w.mag).toBeGreaterThan(0);
      expect(w.rate).toBeGreaterThan(0);
      expect(w.reload).toBeGreaterThan(0);
      expect(w.range).toBeGreaterThan(5);
      expect(isStrKey(w.nameKey)).toBe(true);
    }
  });
});
