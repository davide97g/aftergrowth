import { MathUtils, MeshToonMaterial, Vector3 } from "three";
import type { Token } from "../core/palette";
import { shared, toon } from "./toon";

const PITCH = MathUtils.degToRad(35);
const S = Math.SQRT1_2;

/** `uCut` fades the cut-out (0 indoors and in the editor); `uCutDir` is the camera's view direction. */
export const cutUniforms = {
  uCut: { value: 1 },
  uCutDir: { value: new Vector3(Math.cos(PITCH) * S, Math.sin(PITCH), Math.cos(PITCH) * S).negate() },
};

const VERTEX = /* glsl */ `
  vec4 cutW = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    cutW = instanceMatrix * cutW;
  #endif
  vCutW = ( modelMatrix * cutW ).xyz;
`;

// a dithered hole around the witch in anything standing between her and the camera
const FRAGMENT = /* glsl */ `
  {
    vec3 dv = vCutW - ( uPlayer + vec3( 0.0, 0.9, 0.0 ) );
    float along = dot( dv, uCutDir );
    float r = length( dv - along * uCutDir );
    float hole = ( 1.0 - smoothstep( 1.5, 2.4, r ) ) * smoothstep( 0.4, 1.2, -along ) * uCut;
    ivec2 cell = ivec2( mod( gl_FragCoord.xy, 4.0 ) );
    float bayer[ 16 ] = float[ 16 ]( 0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0 );
    if ( hole > ( bayer[ cell.x + cell.y * 4 ] + 0.5 ) / 16.0 ) discard;
  }
`;

const cache = new Map<Token, MeshToonMaterial>();

/**
 * The toon material for a token, for buildings that may stand in front of the witch: wherever one
 * would hide her, it opens up in a soft dithered circle.
 */
export function cutToon(token: Token): MeshToonMaterial {
  const hit = cache.get(token);
  if (hit) return hit;
  const base = toon(token) as MeshToonMaterial;
  const m = new MeshToonMaterial({ color: base.color, gradientMap: base.gradientMap, emissive: base.emissive });
  m.name = base.name;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uPlayer = shared.uPlayer;
    shader.uniforms.uCut = cutUniforms.uCut;
    shader.uniforms.uCutDir = cutUniforms.uCutDir;
    shader.vertexShader = shader.vertexShader
      .replace("void main() {", "varying vec3 vCutW;\nvoid main() {")
      .replace("#include <project_vertex>", `#include <project_vertex>\n${VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", `uniform vec3 uPlayer;\nuniform float uCut;\nuniform vec3 uCutDir;\nvarying vec3 vCutW;\nvoid main() {\n${FRAGMENT}`);
  };
  m.customProgramCacheKey = () => "cut";
  cache.set(token, m);
  return m;
}

/** Cut copies glow like their originals (windows at night). Call after the stage updates its materials. */
export function syncCuts() {
  for (const [token, m] of cache) m.emissiveIntensity = (toon(token) as MeshToonMaterial).emissiveIntensity;
}
