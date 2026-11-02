import * as THREE from 'three';

/** Общие юниформы для всех патченных материалов. */
export const shared = {
  uTime: { value: 0 },
  uPlayer: { value: new THREE.Vector3() },
};

const GLSL_BAYER = /* glsl */ `
float bayer2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }
`;

export interface TriplanarOpts {
  scale: number;
  /** Растворять (дизерингом) то, что заслоняет игрока от камеры: деревья, крыши. */
  occluderFade?: boolean;
  /** Покачивание на ветру (для травы/крон), сила в метрах на метр высоты. */
  sway?: number;
}

/**
 * Трипланарная проекция текстуры в мировых координатах: процедурным мешам не нужны UV,
 * плотность текселей одинакова по всему миру.
 */
export function triplanar<T extends THREE.MeshLambertMaterial | THREE.MeshStandardMaterial>(mat: T, o: TriplanarOpts): T {
  const scale = { value: o.scale };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTriScale = scale;
    sh.uniforms.uTime = shared.uTime;
    sh.uniforms.uPlayer = shared.uPlayer;
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vTriPos; varying vec3 vTriNrm; uniform float uTime;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         {
           vec4 tp = vec4(transformed, 1.0);
           vec3 tn = objectNormal;
           #ifdef USE_INSTANCING
             tp = instanceMatrix * tp;
             tn = mat3(instanceMatrix) * tn;
           #endif
           ${o.sway ? `
           float swayK = max(0.0, transformed.y) * ${o.sway.toFixed(3)};
           vec3 ip = (modelMatrix * tp).xyz;
           vec2 sw = vec2(sin(uTime * 1.3 + ip.x * 0.21 + ip.z * 0.13), cos(uTime * 1.1 + ip.z * 0.19)) * swayK;
           transformed.xz += sw;
           tp.xz += sw;` : ''}
           tp = modelMatrix * tp;
           vTriPos = tp.xyz;
           vTriNrm = normalize(mat3(modelMatrix) * tn);
         }`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vTriPos; varying vec3 vTriNrm; uniform float uTriScale; uniform vec3 uPlayer;
         ${GLSL_BAYER}`,
      )
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
           vec3 bw = pow(abs(vTriNrm), vec3(4.0));
           bw /= (bw.x + bw.y + bw.z + 1e-5);
           vec4 tx = texture2D(map, vTriPos.zy * uTriScale);
           vec4 ty = texture2D(map, vTriPos.xz * uTriScale);
           vec4 tz = texture2D(map, vTriPos.xy * uTriScale);
           diffuseColor *= tx * bw.x + ty * bw.y + tz * bw.z;
         #endif
         ${o.occluderFade ? `
         {
           vec3 toCam = cameraPosition - uPlayer;
           vec3 rel = vTriPos - uPlayer;
           float tt = clamp(dot(rel, toCam) / dot(toCam, toCam), 0.0, 1.0);
           float dl = length(rel - toCam * tt);
           float h = vTriPos.y - uPlayer.y;
           float fade = smoothstep(3.2, 1.6, dl) * smoothstep(1.2, 2.4, h) * step(0.02, tt);
           if (fade > bayer4(gl_FragCoord.xy) * 0.95 + 0.04) discard;
         }` : ''}`,
      );
  };
  mat.customProgramCacheKey = () => `tri-${o.occluderFade ? 1 : 0}-${o.sway ?? 0}`;
  return mat;
}

/**
 * Анимация существ на GPU: каждая вершина знает свою «конечность» (точка опоры + фаза),
 * экземпляр — фазу шага, амплитуду, вспышку попадания и проявление (дизеринговая прозрачность).
 * Один draw call на тип существа.
 *
 * instance-атрибуты:  iAnim = (фаза, частота, амплитуда, вспышка), iFx = (проявление, глитч, кайма, наклон)
 */
export function creature<T extends THREE.Material>(mat: T, depth = false): T {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.uTime;
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         attribute vec4 aLimb; attribute float aLimbW;
         attribute vec4 iAnim; attribute vec4 iFx;
         uniform float uTime;
         varying vec4 vCreatureFx;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         {
           float ph = iAnim.x + aLimb.w;
           float sw = sin(uTime * iAnim.y + ph) * iAnim.z;
           if (aLimbW > 0.0) {
             vec3 q = transformed - aLimb.xyz;
             float a = sw * aLimbW;
             float c = cos(a); float s = sin(a);
             q = vec3(q.x, q.y * c - q.z * s, q.y * s + q.z * c);
             transformed = aLimb.xyz + q;
           } else {
             transformed.y += abs(sin(uTime * iAnim.y + iAnim.x)) * 0.05 * iAnim.z;
           }
           // наклон вперёд (рывок/ползание)
           float lean = iFx.w;
           transformed.z += transformed.y * sin(lean);
           transformed.y *= cos(lean);
           float gl = iFx.y;
           if (gl > 0.0) {
             float n = fract(sin(dot(vec2(floor(uTime * 24.0), floor(transformed.y * 9.0)), vec2(12.9898, 78.233))) * 43758.5453);
             transformed.x += (n - 0.5) * gl * 0.5;
           }
           vCreatureFx = vec4(iAnim.w, iFx.x, iFx.z, 0.0);
         }`,
      );
    if (!depth) {
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           varying vec4 vCreatureFx;
           ${GLSL_BAYER}`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           {
             // «фосфорная кайма» — только по силуэту (френель), а не заливкой
             float fres = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
             fres = fres * fres * fres;
             totalEmissiveRadiance += vCreatureFx.x * vec3(1.6, 1.3, 1.0) + vCreatureFx.z * fres * vec3(0.16, 0.6, 0.52);
           }
           if (vCreatureFx.y < 0.999 && vCreatureFx.y < bayer4(gl_FragCoord.xy) * 0.98 + 0.01) discard;`,
        );
    }
  };
  mat.customProgramCacheKey = () => (depth ? 'creature-depth' : 'creature');
  return mat;
}
