/** Loads footprint models (OBJ + optional MTL) and builds footprint objects for the 3D view. */
import * as THREE from 'three';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import type { FootprintDef, ModelSource } from '../core';

const cache = new Map<string, Promise<THREE.Group>>();

function modelKey(source: ModelSource): string {
  switch (source.kind) {
    case 'asset':
      return `asset:${source.path}`;
    case 'embedded':
      // embedded models are identified by content; a cheap hash keeps the key short
      return `embedded:${hash(source.obj)}:${source.mtl ? hash(source.mtl) : ''}`;
    case 'none':
      return 'none';
  }
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return `${s.length}-${(h >>> 0).toString(36)}`;
}

export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

/** Parses OBJ text with optional MTL text into a group. Exposed for the footprint editor. */
export function parseModel(obj: string, mtl: string | null): THREE.Group {
  const loader = new OBJLoader();
  if (mtl) {
    const materials = new MTLLoader().parse(mtl, '');
    materials.preload();
    loader.setMaterials(materials);
  }
  const group = loader.parse(obj);
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m instanceof THREE.MeshPhongMaterial) m.shininess = Math.min(m.shininess, 60);
        m.side = THREE.DoubleSide;
      }
    }
  });
  return group;
}

function placeholder(): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshPhongMaterial({ color: 0x8888aa })));
  return g;
}

export function loadModel(source: ModelSource): Promise<THREE.Group> {
  const key = modelKey(source);
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      if (source.kind === 'none') return placeholder();
      if (source.kind === 'embedded') return parseModel(source.obj, source.mtl);
      const [obj, mtl] = await Promise.all([fetchText(assetUrl(`${source.path}.obj`)), fetchText(assetUrl(`${source.path}.mtl`))]);
      if (!obj) {
        console.warn(`[models] could not load ${source.path}.obj`);
        return placeholder();
      }
      return parseModel(obj, mtl);
    })();
    cache.set(key, p);
  }
  return p;
}

/** Deep clone with own materials so highlighting one instance does not affect others. */
export function cloneWithMaterials(template: THREE.Object3D): THREE.Object3D {
  const clone = template.clone(true);
  clone.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
    }
  });
  return clone;
}

/** Applies the footprint's model transform to a model clone. */
export function applyModelTransform(model: THREE.Object3D, fp: FootprintDef): void {
  model.quaternion.set(...fp.modelRotation);
  model.position.set(...fp.modelOffset);
  model.scale.setScalar(fp.modelScale);
}

export function setHighlight(object: THREE.Object3D, color: number | null): void {
  object.traverse((o) => {
    if (o instanceof THREE.Mesh && o.userData.pickable !== false) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if ('emissive' in m && m.emissive instanceof THREE.Color) m.emissive.setHex(color ?? 0x000000);
      }
    }
  });
}
