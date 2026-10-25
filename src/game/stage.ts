import { Camera, DirectionalLight, HalfFloatType, HemisphereLight, PCFShadowMap, Scene, Vector3, WebGLRenderTarget, WebGLRenderer } from "three";
import { Post } from "../render/post";
import { updateMaterials } from "../render/toon";
import { type Mood, lightDirection } from "../world/daycycle";
import { Sky } from "../world/sky";

/** Renderer, the outdoor scene with its sky, sun and sky light, and the post-processing chain. */
export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly sky = new Sky();
  private sun = new DirectionalLight();
  private hemi = new HemisphereLight();
  private dir = new Vector3();
  private center = new Vector3();
  post!: Post;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.scene.add(this.sky.mesh);
    const sun = this.sun;
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 3;
    this.scene.add(this.hemi, sun, sun.target);
  }

  /** Point the sun's shadow box at the islands. */
  fitShadows(center: Vector3, radius: number) {
    this.center.copy(center);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -radius;
    cam.right = cam.top = radius;
    cam.near = 1;
    cam.far = 160;
    cam.updateProjectionMatrix();
    this.sun.target.position.copy(center);
  }

  /** Bloom and tilt-shift need a multisampled target: the composer bypasses canvas antialiasing. */
  usePost(camera: Camera) {
    const rt = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 });
    this.post = new Post(this.renderer, this.scene, camera, rt);
  }

  /** Light the world for this hour and mood (sun arc, sky colours, glowing materials). */
  applyMood(mood: Mood, hour: number, rain: number, overcast: number) {
    lightDirection(hour, this.dir);
    this.sun.position.copy(this.center).addScaledVector(this.dir, 70);
    this.sun.color.copy(mood.sun);
    this.sun.intensity = mood.sunIntensity;
    this.hemi.color.copy(mood.hemiSky);
    this.hemi.groundColor.copy(mood.hemiGround);
    this.hemi.intensity = mood.hemiIntensity;
    this.sky.update(mood, innerWidth / innerHeight);
    updateMaterials(mood, rain, overcast);
    this.post.setGlow(mood.glow);
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h);
  }
}
