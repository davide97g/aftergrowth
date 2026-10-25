import { AdditiveBlending, CanvasTexture, Mesh, NormalBlending, PlaneGeometry, ShaderMaterial, Vector3 } from "three";
import type { Seal } from "./glyph";

const RES = 512;

/** The finished glyph laid on the ground: gold while it burns, then sepia ink that fades away. */
export class GlyphDecal {
  readonly mesh: Mesh;
  private mat: ShaderMaterial;
  private age = 0;

  /** `life` in seconds; Infinity keeps it (carved glyphs) */
  constructor(seal: Seal, at: Vector3, worldRadius: number, fizzle: boolean, private life = 9) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = RES;
    const c = canvas.getContext("2d")!;
    c.fillStyle = "#000";
    c.fillRect(0, 0, RES, RES);
    const k = (RES * 0.45) / seal.radius;
    const map = (x: number, y: number) => [RES / 2 + (x - seal.center.x) * k, RES / 2 + (y - seal.center.y) * k] as const;
    const paint = (style: string, width: number, blur: number) => {
      c.strokeStyle = style;
      c.fillStyle = style;
      c.lineWidth = width;
      c.lineCap = "round";
      c.lineJoin = "round";
      c.shadowColor = style;
      c.shadowBlur = blur;
      for (const s of seal.strokes) {
        c.beginPath();
        if (s.length === 1) {
          const [x, y] = map(s[0].x, s[0].y);
          c.arc(x, y, width, 0, Math.PI * 2);
          c.fill();
          continue;
        }
        s.forEach((p, i) => {
          const [x, y] = map(p.x, p.y);
          if (i) c.lineTo(x, y);
          else c.moveTo(x, y);
        });
        c.stroke();
      }
    };
    // green channel: soft glow halo, red channel: the crisp ink line
    c.globalCompositeOperation = "lighter";
    paint("#00ff00", 16, 24);
    paint("#ff0000", 5, 0);
    const tex = new CanvasTexture(canvas);

    this.mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: fizzle ? NormalBlending : AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      uniforms: { uTex: { value: tex }, uAge: { value: 0 }, uLife: { value: Number.isFinite(life) ? life : 1e9 }, uFizzle: { value: fizzle ? 1 : 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex;
        uniform float uAge;
        uniform float uLife;
        uniform float uFizzle;
        varying vec2 vUv;
        void main() {
          vec4 t = texture2D( uTex, vUv );
          float burn = exp( -uAge * 1.6 );                 // bright flash right after casting
          float fade = 1.0 - smoothstep( uLife * 0.5, uLife, uAge );
          vec3 gold = vec3( 1.0, 0.78, 0.3 );
          vec3 ink = vec3( 0.35, 0.24, 0.16 );
          vec3 c;
          float a;
          if ( uFizzle > 0.5 ) {
            c = vec3( 0.25, 0.22, 0.28 );
            a = ( t.r * 0.8 + t.g * 0.25 ) * fade;
            gl_FragColor = vec4( c, a );
          } else {
            c = gold * ( t.r * ( 0.7 + burn * 3.0 ) + t.g * ( 0.25 + burn * 1.2 ) );
            c = mix( c, ink * t.r, smoothstep( 1.5, 5.0, uAge ) * 0.6 );
            gl_FragColor = vec4( c * fade, 1.0 );
          }
          #include <colorspace_fragment>
        }`,
    });
    const geo = new PlaneGeometry(worldRadius * 2.2, worldRadius * 2.2);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new Mesh(geo, this.mat);
    this.mesh.position.copy(at).setY(at.y + 0.05);
    // texture "up" follows the camera's up on the ground, so the glyph lies the way it was drawn
    this.mesh.rotation.y = Math.PI / 4;
    this.mesh.renderOrder = 5;
  }

  /** Burn bright again, as when a carved glyph fires. */
  flash() {
    this.age = 0;
  }

  /** Returns false once it has faded out. */
  update(dt: number): boolean {
    this.age += dt;
    this.mat.uniforms.uAge.value = this.age;
    return this.age < this.life;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mat.uniforms.uTex.value as CanvasTexture).dispose();
    this.mat.dispose();
  }
}
