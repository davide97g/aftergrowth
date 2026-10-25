import {
  BoxGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  ShaderMaterial,
  Vector2,
} from "three";
import { shared, toon } from "../render/toon";

/** Meshes for the island's working objects, drawn in code rather than loaded. */

export function cauldronMesh() {
  const g = new Group();
  const profile = [0, 0.05, 0.2, 0.35, 0.45, 0.5, 0.5, 0.46].map((y, i) => new Vector2([0.05, 0.3, 0.45, 0.52, 0.53, 0.5, 0.44, 0.47][i], y + 0.22));
  const pot = new Mesh(new LatheGeometry(profile, 12), toon("ink"));
  pot.castShadow = true;
  g.add(pot);
  const rim = new Mesh(new CylinderGeometry(0.5, 0.5, 0.06, 12, 1, true), toon("brass"));
  rim.position.y = 0.7;
  g.add(rim);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = new Mesh(new CylinderGeometry(0.05, 0.04, 0.3, 5), toon("ink"));
    leg.position.set(Math.cos(a) * 0.32, 0.12, Math.sin(a) * 0.32);
    g.add(leg);
  }
  const embers = new Mesh(new ConeGeometry(0.2, 0.18, 6), new MeshBasicMaterial({ color: new Color("#ff8a3a").multiplyScalar(2) }));
  embers.position.y = 0.09;
  g.add(embers);
  const surface = new ShaderMaterial({
    transparent: false,
    uniforms: { uTime: shared.uTime },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv - 0.5;
        float r = length( p );
        float a = atan( p.y, p.x );
        float swirl = sin( a * 3.0 - r * 18.0 + uTime * 1.5 ) * 0.5 + 0.5;
        vec3 c = mix( vec3( 0.08, 0.06, 0.2 ), vec3( 0.3, 0.2, 0.6 ), swirl * 0.6 );
        float bubble = step( 0.93, fract( sin( dot( floor( vUv * 9.0 ), vec2( 12.9, 78.2 ) ) ) * 437.5 + uTime * 0.4 ) );
        c += bubble * vec3( 1.0, 0.8, 0.35 ) * 1.6;
        gl_FragColor = vec4( c, 1.0 );
        #include <colorspace_fragment>
      }`,
  });
  const ink = new Mesh(new CircleGeometry(0.45, 20), surface);
  ink.rotation.x = -Math.PI / 2;
  ink.position.y = 0.66;
  g.add(ink);
  return g;
}

export function crateMesh() {
  const g = new Group();
  const box = new Mesh(new BoxGeometry(1.0, 0.6, 0.7), toon("wood"));
  box.position.y = 0.3;
  box.castShadow = box.receiveShadow = true;
  g.add(box);
  for (const y of [0.12, 0.48]) {
    const band = new Mesh(new BoxGeometry(1.04, 0.07, 0.74), toon("wood-dark"));
    band.position.y = y;
    g.add(band);
  }
  const produce = [["pumpkin", 0.22, -0.2], ["flower-yellow", 0.1, 0.15], ["grass-dark", 0.13, 0.32], ["pumpkin", 0.16, 0.05]] as const;
  produce.forEach(([tok, r, x], i) => {
    const m = new Mesh(new IcosahedronGeometry(r, 1), toon(tok));
    m.position.set(x, 0.62 + r * 0.5, (i % 2 ? 0.12 : -0.1));
    m.castShadow = true;
    g.add(m);
  });
  const post = new Mesh(new BoxGeometry(0.08, 1.2, 0.08), toon("wood-dark"));
  post.position.set(-0.55, 0.6, 0.3);
  const sign = new Mesh(new BoxGeometry(0.6, 0.3, 0.05), toon("cream"));
  sign.position.set(-0.55, 1.1, 0.34);
  g.add(post, sign);
  return g;
}

export function mailboxMesh() {
  const g = new Group();
  const post = new Mesh(new CylinderGeometry(0.05, 0.06, 1.0, 6), toon("wood-dark"));
  post.position.y = 0.5;
  const box = new Mesh(new BoxGeometry(0.42, 0.3, 0.32), toon("cream"));
  box.position.y = 1.08;
  const roof = new Mesh(new CylinderGeometry(0.01, 0.34, 0.2, 4), toon("foliage-teal"));
  roof.position.y = 1.32;
  roof.rotation.y = Math.PI / 4;
  const hole = new Mesh(new CylinderGeometry(0.07, 0.07, 0.04, 10), toon("ink"));
  hole.rotation.x = Math.PI / 2;
  hole.position.set(0, 1.1, 0.165);
  const flag = new Mesh(new BoxGeometry(0.03, 0.16, 0.1), toon("flower-pink"));
  flag.position.set(0.23, 1.15, 0);
  flag.name = "flag";
  for (const m of [post, box, roof, flag]) m.castShadow = true;
  g.add(post, box, roof, hole, flag);
  return g;
}

/** A flat round slab that a glyph can be carved into. */
export function stoneMesh() {
  const g = new Group();
  const top = new Mesh(new CylinderGeometry(0.8, 0.86, 0.16, 9), toon("rock"));
  top.position.y = 0.08;
  top.receiveShadow = true;
  const base = new Mesh(new CylinderGeometry(0.92, 0.96, 0.08, 9), toon("rock-dark"));
  base.position.y = 0.04;
  g.add(base, top);
  return g;
}
