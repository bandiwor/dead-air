import * as THREE from 'three';
import { TEXTURES, type TextureId, type TextureSource } from '../content/assets';
import { generateTexture, seedFor } from '../proc/textures';

export type TextureSet = Record<TextureId, THREE.Texture>;

const LINEAR_IDS = new Set<TextureId>(['waterNormal']);
const yieldFrame = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/**
 * Загружает текстуры по манифесту: процедурные генерируются, файловые — загружаются.
 * Подмена ассета = правка одной строки в content/assets.ts.
 */
export async function loadTextures(seed: number, onProgress: (done: number, total: number) => void): Promise<TextureSet> {
  const entries = Object.entries(TEXTURES) as [TextureId, TextureSource][];
  const out = {} as TextureSet;
  const loader = new THREE.TextureLoader();
  let done = 0;
  for (const [id, src] of entries) {
    let tex: THREE.Texture;
    if ('file' in src) {
      tex = await loader.loadAsync(src.file);
    } else {
      const size = src.size ?? 128;
      const d = generateTexture(src.proc, size, seedFor(id, seed));
      tex = new THREE.DataTexture(d.data, d.size, d.size, THREE.RGBAFormat);
      tex.generateMipmaps = true;
    }
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.colorSpace = LINEAR_IDS.has(id) ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    tex.anisotropy = 1;
    tex.needsUpdate = true;
    out[id] = tex;
    onProgress(++done, entries.length);
    await yieldFrame();
  }
  return out;
}
