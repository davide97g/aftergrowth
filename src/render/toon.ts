import {
  Color,
  DataTexture,
  DoubleSide,
  LinearFilter,
  Material,
  Mesh,
  MeshToonMaterial,
  NormalBlending,
  Object3D,
  RedFormat,
  ShaderMaterial,
  SkinnedMesh,
  Vector3,
} from "three";
import { PALETTE, Token, color, isToken } from "../core/palette";
import type { Mood } from "../world/daycycle";

/** Uniforms shared by every animated material. */
export const shared = {
  uTime: { value: 0 },
  uWind: { value: 1 },
  uPlayer: { value: new Vector3(999, 0, 999) },
};

// tokens that sway in the wind (and bend around the player)
const WIND: ReadonlySet<Token> = new Set<Token>([
  "foliage", "foliage-teal", "grass-dark", "moss", "bark", "bark-dark",
  "flower-pink", "flower-yellow", "flower-blue", "flower-white",
]);
// tokens that light up at night, with their peak emissive strength
const GLOW: Partial<Record<Token, number>> = {
  window: 2.8,
  "flower-blue": 1.4,
  "flower-pink": 1.0,
  "flower-white": 0.6,
  crystal: 1.1,
  "crystal-deep": 0.9,
  flame: 2.4,
};
/** glow that stays on in daylight too (fire) */
const ALWAYS: Partial<Record<Token, number>> = { flame: 1.2 };

let ramp: DataTexture | null = null;

/** Soft 4-band toon ramp: linear filtering keeps the band edges gentle. */
export function toonRamp(): DataTexture {
  if (ramp) return ramp;
  const data = new Uint8Array([96, 150, 205, 255]);
  ramp = new DataTexture(data, data.length, 1, RedFormat);
  ramp.minFilter = LinearFilter;
  ramp.magFilter = LinearFilter;
  ramp.generateMipmaps = false;
  ramp.needsUpdate = true;
  return ramp;
}

const WIND_VERTEX = /* glsl */ `
  vec4 windPos = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    windPos = instanceMatrix * windPos;
  #endif
  windPos = modelMatrix * windPos;
  float windH = max( transformed.y, 0.0 );
  float gust = sin( uTime * 1.3 + windPos.x * 0.35 + windPos.z * 0.25 ) * 0.6
             + sin( uTime * 2.7 + windPos.x * 0.9 ) * 0.25 + 0.15;
  windPos.x += gust * windH * windH * 0.035 * uWind;
  windPos.z += gust * windH * windH * 0.02 * uWind;
  vec2 away = windPos.xz - uPlayer.xz;
  float push = ( 1.0 - smoothstep( 0.2, 0.9, length( away ) ) ) * min( windH, 0.6 );
  windPos.xz += normalize( away + 1e-4 ) * push * 0.5;
  vec4 mvPosition = viewMatrix * windPos;
  gl_Position = projectionMatrix * mvPosition;
`;

function windify(mat: MeshToonMaterial) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uWind = shared.uWind;
    shader.uniforms.uPlayer = shared.uPlayer;
    shader.vertexShader = shader.vertexShader
      .replace("void main() {", "uniform float uTime;\nuniform float uWind;\nuniform vec3 uPlayer;\nvoid main() {")
      .replace("#include <project_vertex>", WIND_VERTEX);
  };
  mat.customProgramCacheKey = () => "wind";
}

const cache = new Map<string, Material>();

export function toon(token: Token): Material {
  const hit = cache.get(token);
  if (hit) return hit;
  let mat: Material;
  if (token === "water") mat = pondMaterial();
  else if (token === "water-light") mat = waterfallMaterial();
  else {
    const m = new MeshToonMaterial({ color: color(token), gradientMap: toonRamp() });
    if (token === "glass") {
      m.transparent = true;
      m.opacity = 0.35;
      m.depthWrite = false;
      m.side = DoubleSide;
    }
    if (GLOW[token] !== undefined) m.emissive = color(token);
    if (WIND.has(token)) windify(m);
    mat = m;
  }
  mat.name = `pal:${token}`;
  cache.set(token, mat);
  return mat;
}

/** Swap glTF materials named `pal:<token>` for the shared toon set and enable shadows. */
export function applyPalette(root: Object3D, opts: { cast?: boolean; receive?: boolean } = {}) {
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = opts.cast ?? true;
    mesh.receiveShadow = opts.receive ?? true;
    const swap = (m: Material) => {
      const token = m.name.replace(/^pal:/, "").replace(/\.\d+$/, "");
      return isToken(token) ? toon(token) : m;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
    const name = Array.isArray(mesh.material) ? "" : mesh.material.name;
    if (name === "pal:water" || name === "pal:water-light" || name === "pal:glass") mesh.castShadow = false;
  });
}

/** Character materials keep their texture but get the toon ramp. */
export function applyToonTexture(root: Object3D) {
  root.traverse((o) => {
    const mesh = o as SkinnedMesh;
    if (!mesh.isMesh) return;
    const src = mesh.material as MeshToonMaterial;
    mesh.material = new MeshToonMaterial({ map: src.map, gradientMap: toonRamp(), color: 0xffffff });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
}

function pondMaterial() {
  return new ShaderMaterial({
    uniforms: { uTime: shared.uTime, uColor: { value: new Color(PALETTE.water) }, uGlow: { value: 0 }, uRain: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4( position, 1.0 );
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uGlow;
      uniform float uRain;
      varying vec3 vWorld;
      void main() {
        vec2 p = vWorld.xz;
        // raindrop rings
        vec2 cell = floor( p * 1.6 );
        vec2 f = fract( p * 1.6 ) - 0.5;
        float h = fract( sin( dot( cell, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
        float rt = fract( uTime * 0.9 + h );
        float ring = smoothstep( 0.04, 0.0, abs( length( f - ( h - 0.5 ) * 0.4 ) - rt * 0.45 ) ) * ( 1.0 - rt );
        float n = sin( p.x * 1.7 + uTime * 0.8 ) * sin( p.y * 1.3 - uTime * 0.6 )
                + 0.5 * sin( ( p.x + p.y ) * 2.3 + uTime * 1.1 );
        float hl = smoothstep( 0.9, 1.15, n );
        vec3 c = mix( uColor, uColor * 1.25 + vec3( 0.12, 0.16, 0.2 ), hl );
        float sparkle = step( 0.995, fract( sin( dot( floor( p * 6.0 ), vec2( 12.9898, 78.233 ) ) ) * 43758.5453 + uTime * 0.2 ) );
        c += sparkle * uGlow * vec3( 0.6, 0.9, 1.2 );
        c += ring * uRain * 0.35;
        gl_FragColor = vec4( c, 1.0 );
        #include <colorspace_fragment>
      }`,
  });
}

function waterfallMaterial() {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: NormalBlending,
    uniforms: { uTime: shared.uTime, uColor: { value: new Color(PALETTE["water-light"]) }, uGlow: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4( position, 1.0 );
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uGlow;
      varying vec3 vWorld;
      varying vec2 vUv;
      void main() {
        float s = fract( vWorld.y * 0.55 + uTime * 1.4 + sin( vUv.x * 9.0 ) * 0.18 );
        float streak = smoothstep( 0.0, 0.08, s ) * ( 1.0 - smoothstep( 0.18, 0.3, s ) );
        float edge = smoothstep( 0.0, 0.12, vUv.x ) * smoothstep( 1.0, 0.88, vUv.x );
        vec3 c = mix( uColor, vec3( 1.0 ), streak * 0.55 );
        c += uGlow * vec3( 0.1, 0.35, 0.5 );
        float a = ( 0.65 + 0.35 * edge ) * smoothstep( -10.5, -4.0, vWorld.y );
        gl_FragColor = vec4( c, a );
        #include <colorspace_fragment>
      }`,
  });
}

const tmp = new Color();

/** Per-frame: night glow on windows/flowers, water tint. */
export function updateMaterials(mood: Mood, rain = 0, overcast = 0) {
  for (const [token, peak] of Object.entries(GLOW) as [Token, number][]) {
    const m = cache.get(token) as MeshToonMaterial | undefined;
    if (m) m.emissiveIntensity = (ALWAYS[token] ?? 0) + mood.glow * peak;
  }
  const pond = cache.get("water") as ShaderMaterial | undefined;
  if (pond) {
    pond.uniforms.uColor.value.copy(mood.water);
    pond.uniforms.uGlow.value = mood.glow;
    pond.uniforms.uRain.value = rain;
  }
  const cloud = cache.get("cloud") as MeshToonMaterial | undefined;
  if (cloud) cloud.color.set(PALETTE.cloud).lerp(tmp.set("#8d97ab"), overcast * 0.6);
  const fall = cache.get("water-light") as ShaderMaterial | undefined;
  if (fall) {
    fall.uniforms.uColor.value.copy(tmp.set(PALETTE["water-light"]).lerp(mood.water, mood.glow * 0.5));
    fall.uniforms.uGlow.value = mood.glow;
  }
}
