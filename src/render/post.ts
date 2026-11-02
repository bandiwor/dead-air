import * as THREE from 'three';

/**
 * Финальный проход. Каждый эффект диегетичен:
 * разрывы «ленты» — рядом «Они» или упал рассудок; обесцвечивание — рассудок; красный — боль;
 * квантование + упорядоченный дизеринг — единая «плёночная» палитра, склеивающая процедурный мир.
 */
const VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FS = /* glsl */ `
precision highp float;
uniform sampler2D tScene;
uniform vec2 uRes;
uniform float uTime;
uniform float uGlitch;
uniform float uSanity;
uniform float uHurt;
uniform float uFlash;
uniform float uFade;
uniform float uLevels;
uniform float uDeadAir;
varying vec2 vUv;

float bayer2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }

void main() {
  vec2 uv = vUv;
  float tf = floor(uTime * 14.0);
  // разрывы ленты: горизонтальные полосы со сдвигом
  float row = floor(uv.y * uRes.y / 3.0);
  float band = step(1.0 - uGlitch * 0.09, hash(vec2(row, tf)));
  uv.x += band * (hash(vec2(tf, row)) - 0.5) * 0.08 * uGlitch;
  uv.x += sin(uv.y * 30.0 + uTime * 6.0) * 0.0012 * uGlitch;
  // вертикальный «срыв синхронизации» при сильном глитче
  uv.y = fract(uv.y + step(0.93, hash(vec2(tf, 3.0))) * uGlitch * uGlitch * 0.06);

  float ca = 0.0008 + uGlitch * 0.006 + uHurt * 0.004;
  vec3 col;
  col.r = texture2D(tScene, uv + vec2(ca, 0.0)).r;
  col.g = texture2D(tScene, uv).g;
  col.b = texture2D(tScene, uv - vec2(ca, 0.0)).b;

  // мягкая тональная компрессия
  col = col / (1.0 + col * 0.55) * 1.3;
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  // раздельное тонирование: тени — в сине-чёрный, света — в натриевый янтарь
  col *= mix(vec3(0.62, 0.78, 1.0), vec3(1.07, 0.98, 0.84), smoothstep(0.015, 0.45, l));
  col = mix(col, vec3(l), uSanity * 0.6 + uDeadAir * 0.15);
  col = mix(col, vec3(l * 1.3, l * 0.12, l * 0.1), uHurt * 0.55);
  col += uFlash * vec3(1.0, 0.93, 0.82);

  vec2 q = vUv - 0.5;
  float vig = 1.0 - dot(q, q) * (1.15 + uSanity * 1.8 + uHurt * 1.2);
  col *= clamp(vig, 0.0, 1.0);

  col = toSRGB(clamp(col, 0.0, 1.0));
  col += (hash(vUv * uRes + fract(uTime) * 91.7) - 0.5) * (0.045 + uSanity * 0.07);
  // квантование с упорядоченным дизерингом
  float d = bayer4(gl_FragCoord.xy) - 0.5;
  col = floor(col * uLevels + 0.5 + d) / uLevels;
  // строки развёртки
  col *= 0.95 + 0.05 * step(0.5, fract(gl_FragCoord.y * 0.5));
  col *= 1.0 - uFade;
  gl_FragColor = vec4(col, 1.0);
}`;

export class PostPass {
  readonly material: THREE.ShaderMaterial;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly u = {
    tScene: { value: null as THREE.Texture | null },
    uRes: { value: new THREE.Vector2(640, 360) },
    uTime: { value: 0 },
    uGlitch: { value: 0 },
    uSanity: { value: 0 },
    uHurt: { value: 0 },
    uFlash: { value: 0 },
    uFade: { value: 0 },
    uLevels: { value: 28 },
    uDeadAir: { value: 0 },
  };

  constructor() {
    this.material = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: this.u, depthTest: false, depthWrite: false });
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    const mesh = new THREE.Mesh(tri, this.material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }
}
