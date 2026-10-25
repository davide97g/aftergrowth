import { Mesh, PlaneGeometry, ShaderMaterial, Vector2 } from "three";
import { shared } from "../render/toon";
import type { Mood } from "./daycycle";

/** Screen-space sky: vertical gradient, twinkling stars and a soft moon. Drawn behind everything. */
export class Sky {
  readonly mesh: Mesh;
  private mat: ShaderMaterial;

  constructor() {
    this.mat = new ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTime: shared.uTime,
        uTop: { value: null },
        uBottom: { value: null },
        uStars: { value: 0 },
        uAspect: { value: 1 },
        uMoon: { value: new Vector2(0.8, 0.82) },
        uAurora: { value: 0 },
        uMeteors: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4( position.xy, 1.0, 1.0 );
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uTop;
        uniform vec3 uBottom;
        uniform float uStars;
        uniform float uAspect;
        uniform vec2 uMoon;
        uniform float uAurora;
        uniform float uMeteors;
        varying vec2 vUv;
        float hash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
        void main() {
          vec3 c = mix( uBottom, uTop, smoothstep( 0.0, 1.0, vUv.y ) );
          vec2 p = vec2( vUv.x * uAspect, vUv.y );
          vec2 cell = floor( p * 70.0 );
          float h = hash( cell );
          vec2 f = fract( p * 70.0 ) - 0.5;
          float star = step( 0.985, h ) * smoothstep( 0.22, 0.0, length( f ) );
          star *= 0.6 + 0.4 * sin( uTime * ( 1.0 + h * 3.0 ) + h * 40.0 );
          c += star * uStars * smoothstep( 0.25, 0.7, vUv.y ) * vec3( 1.0, 0.95, 0.8 );
          vec2 m = vec2( ( vUv.x - uMoon.x ) * uAspect, vUv.y - uMoon.y );
          float d = length( m );
          float disc = smoothstep( 0.052, 0.047, d );
          float halo = smoothstep( 0.2, 0.0, d ) * 0.25;
          c = mix( c, vec3( 0.95, 0.93, 1.0 ), disc * uStars );
          c += halo * uStars * vec3( 0.6, 0.65, 1.0 );
          // the Frost Lights: soft curtains of green and violet over the top of the sky
          if ( uAurora > 0.0 ) {
            float x = p.x;
            float wave = sin( x * 3.0 + uTime * 0.25 ) * 0.06 + sin( x * 7.0 - uTime * 0.4 ) * 0.025;
            float band = smoothstep( 0.0, 0.08, vUv.y - ( 0.62 + wave ) ) * smoothstep( 0.32, 0.05, vUv.y - ( 0.62 + wave ) );
            float rays = 0.55 + 0.45 * sin( x * 40.0 + sin( x * 5.0 + uTime * 0.6 ) * 4.0 );
            vec3 tint = mix( vec3( 0.25, 1.0, 0.6 ), vec3( 0.7, 0.35, 1.0 ), smoothstep( 0.62, 0.95, vUv.y + wave ) );
            c += tint * band * rays * uAurora * 0.55;
          }
          // the Star Shower: a few shooting stars, each on its own clock
          if ( uMeteors > 0.0 ) {
            for ( int i = 0; i < 4; i++ ) {
              float fi = float( i );
              float period = 3.5 + fi * 1.7;
              float t = mod( uTime + fi * 2.3, period ) / 0.9;
              float n = floor( ( uTime + fi * 2.3 ) / period );
              vec2 start = vec2( fract( sin( n * 12.9 + fi * 7.1 ) * 437.5 ) * uAspect, 0.75 + fract( sin( n * 78.2 + fi ) * 91.3 ) * 0.22 );
              vec2 head = start + vec2( -0.45, -0.22 ) * t;
              vec2 dir = normalize( vec2( -0.45, -0.22 ) );
              vec2 rel = p - head;
              float along = dot( rel, -dir );
              float across = abs( rel.x * dir.y - rel.y * dir.x );
              float trail = smoothstep( 0.18, 0.0, along ) * step( 0.0, along ) * smoothstep( 0.004, 0.0, across );
              c += vec3( 1.0, 0.95, 0.8 ) * trail * step( t, 1.0 ) * uMeteors * ( 1.0 - t );
            }
          }
          gl_FragColor = vec4( c, 1.0 );
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new Mesh(new PlaneGeometry(2, 2), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
  }

  update(mood: Mood, aspect: number) {
    this.mat.uniforms.uTop.value = mood.skyTop;
    this.mat.uniforms.uBottom.value = mood.skyBottom;
    this.mat.uniforms.uStars.value = mood.stars;
    this.mat.uniforms.uAspect.value = aspect;
  }

  /** Festival skies: the Frost Lights and the Star Shower, 0..1. */
  festival(aurora: number, meteors: number) {
    this.mat.uniforms.uAurora.value = aurora;
    this.mat.uniforms.uMeteors.value = meteors;
  }
}
