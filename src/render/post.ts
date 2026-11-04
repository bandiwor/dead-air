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
uniform sampler2D tShow;
uniform float uShow;
uniform float uInvert;
uniform vec3 uShadowTint;
uniform vec3 uHiTint;
uniform float uGrade;
uniform float uBloom;
uniform float uReflect;
varying vec2 vUv;

// «дешёвое свечение»: 8 выборок вокруг пикселя, берём только то, что ярче порога
vec3 bloom(vec2 uv) {
  vec2 px = 1.0 / uRes;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    vec2 o = vec2(cos(a), sin(a));
    acc += max(texture2D(tScene, uv + o * px * 2.5).rgb - 0.75, 0.0);
    acc += max(texture2D(tScene, uv + o * px * 6.0).rgb - 0.75, 0.0) * 0.6;
  }
  return acc / 12.8;
}

float bayer2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }

void main() {
  vec2 uv = vUv;
  // отражение: взгляд «проваливается» в воду — картинка переворачивается и идёт рябью
  float rf = uReflect;
  if (rf > 0.5) uv.y = 1.0 - uv.y;
  uv.x += (sin(uv.y * 38.0 + uTime * 2.2) * 0.006 + sin(uv.y * 91.0 - uTime * 3.1) * 0.002) * rf;
  uv.y += sin(uv.x * 25.0 + uTime * 1.7) * 0.004 * rf;
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

  // стоп-кадр: замерший кадр гаснет и выцветает, поверх проявляется витрина существа
  if (uShow > 0.0) {
    float lf = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(col, vec3(lf * 0.22, lf * 0.25, lf * 0.3), uShow);
    vec4 sh = texture2D(tShow, vUv);
    col = mix(col, sh.rgb * 1.25, sh.a * smoothstep(0.35, 1.0, uShow));
  }
  if (uBloom > 0.0) col += bloom(uv) * uBloom;
  // мягкая тональная компрессия
  col = col / (1.0 + col * 0.55) * 1.3;
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  // раздельное тонирование: тени — в сине-чёрный, света — в натриевый янтарь
  col *= mix(uShadowTint, uHiTint, smoothstep(0.015, 0.45, l));
  col = mix(col, vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), uGrade);
  col = mix(col, vec3(l), uSanity * 0.45 + uDeadAir * 0.12);
  col = mix(col, vec3(l * 1.3, l * 0.12, l * 0.1), uHurt * 0.55);
  col += uFlash * vec3(1.0, 0.93, 0.82);

  // под водой: холодно-зелёное, тусклое; в момент перехода — почти темнота
  col = mix(col, col * vec3(0.5, 0.82, 0.88) + vec3(0.0, 0.015, 0.025), rf);
  col *= 1.0 - 0.85 * (1.0 - abs(rf * 2.0 - 1.0));
  vec2 q = vUv - 0.5;
  float vig = 1.0 - dot(q, q) * (1.15 + uSanity * 1.0 + uHurt * 1.2 + rf * 1.6);
  col *= clamp(vig, 0.0, 1.0);

  col = toSRGB(clamp(col, 0.0, 1.0));
  col += (hash(vUv * uRes + fract(uTime) * 91.7) - 0.5) * (0.045 + uSanity * 0.045);
  // квантование с упорядоченным дизерингом
  float d = bayer4(gl_FragCoord.xy) - 0.5;
  col = floor(col * uLevels + 0.5 + d) / uLevels;
  // строки развёртки
  col *= 0.95 + 0.05 * step(0.5, fract(gl_FragCoord.y * 0.5));
  col *= 1.0 - uFade;
  // негатив на долю секунды — удар скримера
  col = mix(col, 1.0 - col, uInvert);
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
    tShow: { value: null as THREE.Texture | null },
    uShow: { value: 0 },
    uInvert: { value: 0 },
    uShadowTint: { value: new THREE.Vector3(0.62, 0.78, 1.0) },
    uHiTint: { value: new THREE.Vector3(1.07, 0.98, 0.84) },
    uGrade: { value: 0 },
    uBloom: { value: 0.9 },
    uReflect: { value: 0 },
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
