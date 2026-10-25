import { Group, InstancedMesh, Matrix4, Mesh, Object3D } from "three";
import { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { applyPalette } from "../render/toon";

const loader = new GLTFLoader();
const cache = new Map<string, Promise<GLTF>>();

export function loadGltf(url: string): Promise<GLTF> {
  let p = cache.get(url);
  if (!p) {
    p = loader.loadAsync(url);
    cache.set(url, p);
  }
  return p;
}

/** A fresh copy of a prop from public/assets/props, already wearing the palette. */
export async function prop(name: string): Promise<Object3D> {
  const gltf = await loadGltf(`/assets/props/${name}.glb`);
  const obj = gltf.scene.clone(true);
  applyPalette(obj);
  return obj;
}

/**
 * Many copies of one prop drawn with one InstancedMesh per material.
 * Use it for grass, flowers, rocks: anything static and numerous.
 */
export async function scatter(name: string, matrices: Matrix4[], shadows = true): Promise<Group> {
  const template = await prop(name);
  template.updateMatrixWorld(true);
  const group = new Group();
  group.name = `scatter:${name}`;
  if (!matrices.length) return group;
  template.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    const inst = new InstancedMesh(geo, mesh.material, matrices.length);
    matrices.forEach((m, i) => inst.setMatrixAt(i, m));
    inst.castShadow = shadows;
    inst.receiveShadow = true;
    inst.computeBoundingSphere();
    group.add(inst);
  });
  return group;
}
