// Reuses the licensed Viking hair cards already embedded in Lugo's loaded GLB.
// Only beard/moustache geometry is copied; Red Beard retains the crew's own face,
// skeleton, helmet, glasses, clothing and gameplay role.
const geometryCache = new WeakMap();
const beardNames = ['Lugo_salt_pepper_beard_CC0', 'Lugo_moustache_CC0'];

/** Run once on a complete fresh character clone, before its first render. */
export function internCharacterSkeletons(model) {
  const canonical = [], original = new Set();
  model.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    const skeleton = mesh.skeleton; original.add(skeleton);
    const match = canonical.find(candidate => candidate.bones.length === skeleton.bones.length &&
      candidate.bones.every((bone, i) => bone === skeleton.bones[i] &&
        candidate.boneInverses[i].elements.every((v, j) => v === skeleton.boneInverses[i].elements[j])));
    if (match) mesh.skeleton = match;
    else canonical.push(skeleton);
  });
  // SkeletonUtils clones contain independent skeleton objects with the same bone
  // objects. Intern only inside this model; another character's bones never match.
  return { before:original.size, after:canonical.length, eliminated:original.size-canonical.length };
}

function prepare(THREE, sourceScene, reference, style) {
  let cache = geometryCache.get(sourceScene);
  if (!cache) { cache = { variants:new WeakMap(), all:[] }; geometryCache.set(sourceScene,cache); }
  if (!cache.variants.has(reference.geometry)) cache.variants.set(reference.geometry,new Map());
  const variants=cache.variants.get(reference.geometry);
  if (variants.has(style)) return variants.get(style);
  const donorMeshes = [];
  sourceScene.traverse(mesh => {
    if (mesh.isSkinnedMesh && beardNames.includes(mesh.material?.name)) donorMeshes.push(mesh);
  });
  if (donorMeshes.length !== 2) throw new Error('Red Beard needs the two licensed Viking beard/moustache meshes from the Lugo asset.');
  const point = new THREE.Vector3();
  const records = donorMeshes.map(donor => {
    const index = donor.skeleton.bones.findIndex(bone => bone.name === 'head');
    if (index < 0) throw new Error('The donor head bone is missing.');
    const joints = donor.geometry.attributes.skinIndex, weights = donor.geometry.attributes.skinWeight;
    if (!joints || !weights) throw new Error('The donor beard has no skin weights.');
    const targetHead = reference.skeleton.bones.findIndex(bone => bone.name === 'head');
    const remap = donor.skeleton.bones.map(bone => reference.skeleton.bones.findIndex(other => other.name === bone.name));
    if (targetHead < 0 || remap.some(i => i < 0)) throw new Error('The crew skeleton cannot receive the donor head/neck weights.');
    const isBeard = donor.material.name === beardNames[0], geometry = donor.geometry.clone();
    const positions = geometry.attributes.position, chin = 1.56;
    // Sculpt in the donor's +Y-up bind space, keeping cheeks and moustache fitted.
    // Its beard had been shortened for Lugo. The lower section now reaches the
    // upper chest and broadens gently, making Red Beard unmistakably different.
    for (let v = 0; v < positions.count; v++) {
      point.fromBufferAttribute(positions, v);
      const lower = Math.max(0, Math.min(1, (chin - point.y) / .05));
      point.x *= isBeard ? (style==='brown'?1.05:1.12) : 1.10;
      if (isBeard && point.y < chin) point.y = chin + (point.y - chin) * (style==='brown'?2.1:3.2);
      point.z += .005 + (isBeard ? .018 * lower : 0);
      if (isBeard) point.z += .012 * Math.max(0,1-(Math.abs(point.x)/.08)**2);
      positions.setXYZ(v, point.x, point.y, point.z);
    }
    // Fit the donor head bind pose to the recipient head bind pose. Keep all
    // original head/neck blends and remap joint indices by name; no rigidification.
    const fit = reference.bindMatrix.clone().invert()
      .multiply(reference.skeleton.boneInverses[targetHead].clone().invert())
      .multiply(donor.skeleton.boneInverses[index]).multiply(donor.bindMatrix);
    geometry.applyMatrix4(fit);
    const skinIndex = geometry.attributes.skinIndex;
    for(let v=0;v<skinIndex.count;v++) skinIndex.setXYZW(v,remap[joints.getX(v)],remap[joints.getY(v)],remap[joints.getZ(v)],remap[joints.getW(v)]);
    geometry.deleteAttribute('tangent'); geometry.computeVertexNormals();
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return { geometry, material: donor.material, isBeard, source: donor.name };
  });
  variants.set(style, records); cache.all.push(...records);
  return records;
}

/** Adds two lightweight skins sharing the existing crew skeleton. No fetch or new rig. */
export function attachRedBeard({ THREE, donorScene, crewModel, style='ginger' }) {
  const head = crewModel.getObjectByName('head');
  if (!head?.isBone) throw new Error('Red Beard requires the existing crew head bone.');
  let reference = null;
  crewModel.traverse(mesh => { if (!reference && mesh.isSkinnedMesh) reference = mesh; });
  if (!reference) throw new Error('Red Beard needs an existing crew skin binding.');
  const group = new THREE.Group(); group.name = style==='brown'?'Drew — full brown beard':'Red Beard — large ginger facial hair';
  const materials = [];
  for (const record of prepare(THREE, donorScene, reference, style)) {
    const material = record.material.clone();
    material.name = record.isBeard ? 'RedBeard_ginger_beard_CC0' : 'RedBeard_ginger_moustache_CC0';
    material.color.setRGB(1.65, .48, .14); // Warm copper/ginger, retaining the source strand texture.
    if(style==='brown'){material.color.setRGB(.42,.21,.11);material.name=record.isBeard?'Drew_brown_beard_CC0':'Drew_brown_moustache_CC0';}
    material.roughness = .94; material.metalness = 0; material.envMapIntensity = .55;
    material.transparent = false; material.opacity = 1; material.alphaTest = .19;
    material.depthWrite = true; material.side = THREE.DoubleSide;
    const mesh = new THREE.SkinnedMesh(record.geometry, material);
    mesh.bind(reference.skeleton, reference.bindMatrix);
    mesh.name = record.isBeard ? 'Large ginger beard' : 'Ginger moustache';
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    group.add(mesh); materials.push(material);
  }
  group.traverse(node => { node.userData.noBake = true; node.userData.redBeardAccessory = true; });
  reference.parent.add(group);
  let disposed = false;
  const api = {
    group,
    inspect() { let triangles = 0; group.traverse(o => { if (o.isMesh) triangles += (o.geometry.index?.count || o.geometry.attributes.position.count) / 3; }); return { meshes:group.children.length, triangles, attachment:'existing crew head/neck skin weights', sharedTextures:true, separateSkeleton:false }; },
    dispose() { if (disposed) return; disposed = true; group.removeFromParent(); for (const m of materials) m.dispose(); },
  };
  group.userData.inspect = api.inspect;
  return api;
}

// Call only when all Red Beard instances and the donor character asset are unloaded.
export function disposeRedBeardGeometry(donorScene) {
  const cache = geometryCache.get(donorScene);
  if (cache) for (const record of cache.all) record.geometry.dispose();
  geometryCache.delete(donorScene);
}
