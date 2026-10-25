import { Camera, Scene, Vector2, WebGLRenderTarget, WebGLRenderer } from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { HorizontalTiltShiftShader } from "three/examples/jsm/shaders/HorizontalTiltShiftShader.js";
import { VerticalTiltShiftShader } from "three/examples/jsm/shaders/VerticalTiltShiftShader.js";

/** Bloom for night glow, tilt-shift for the diorama feel. */
export class Post {
  readonly composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private tiltH: ShaderPass;
  private tiltV: ShaderPass;
  private pass: RenderPass;

  /** `target` should be multisampled: the composer bypasses the canvas antialiasing. */
  constructor(renderer: WebGLRenderer, scene: Scene, camera: Camera, target: WebGLRenderTarget) {
    const size = renderer.getSize(new Vector2());
    this.composer = new EffectComposer(renderer, target);
    this.pass = new RenderPass(scene, camera);
    this.composer.addPass(this.pass);
    this.bloom = new UnrealBloomPass(size, 0.55, 0.65, 1.0);
    this.composer.addPass(this.bloom);
    this.tiltH = new ShaderPass(HorizontalTiltShiftShader);
    this.tiltV = new ShaderPass(VerticalTiltShiftShader);
    this.tiltH.uniforms.r.value = 0.5;
    this.tiltV.uniforms.r.value = 0.5;
    this.composer.addPass(this.tiltH);
    this.composer.addPass(this.tiltV);
    this.composer.addPass(new OutputPass());
    this.setSize(size.x, size.y);
  }

  setSize(w: number, h: number) {
    this.composer.setSize(w, h);
    // blur amount in texels, scaled so the effect looks the same at any resolution
    this.tiltH.uniforms.h.value = 1.6 / w;
    this.tiltV.uniforms.v.value = 1.6 / h;
  }

  /** Render a different scene, e.g. inside the cottage. */
  setScene(scene: Scene) {
    this.pass.scene = scene;
  }

  /** Night makes the glow bloom a bit more. */
  setGlow(glow: number) {
    this.bloom.strength = 0.25 + glow * 0.6;
  }

  render() {
    this.composer.render();
  }
}
