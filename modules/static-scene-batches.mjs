// Static-only batching and conservative wall occlusion. No collision or gameplay state changes.
// In particular, emissive meshes reuse the exact material that nightRig controls.
export function createStaticSceneBatches({ THREE, BufferGeometryUtils, scene, CB,
  podBand, cellSize = 32, roomBatches = true, occlusion = true,
  castShadows = false, protectedObjects = [] } = {}) {
  const protectedSet = new Set(protectedObjects.filter(Boolean));
  const groups = new Map(), walls = [], batches = [];
  const originalVisibility = new Map();
  const stats = { collected: 0, removed: 0, drawGroups: 0, failures: 0,
    sourceTriangles: 0, batchTriangles: 0, emissiveSources: 0, emissiveGroups: 0,
    basicSources: 0, basicGroups: 0, wallCount: 0, culledGroups: 0,
    culledTriangles: 0, roomBatches, occlusion, cellSize };
  const center = new THREE.Vector3(), size = new THREE.Vector3();
  const noMaps = m => !Object.keys(m).some(key => /map$/i.test(key) && m[key]);
  const flatKey = m => {
    // Retain material type and every serialized render flag/property except tint.
    // Basic signs remain unlit; PBR roughness and metalness are not discarded.
    const json = m.toJSON();
    for (const key of ['uuid', 'name', 'color', 'userData', 'metadata']) delete json[key];
    return JSON.stringify(json);
  };
  const attributeKey = geometry => Object.keys(geometry.attributes).sort().map(key => {
    const a = geometry.attributes[key];
    return `${key}:${a.itemSize}:${a.normalized}:${a.array?.constructor.name}`;
  }).join(',');
  function spatialKey(bounds) {
    if (roomBatches && CB && podBand) {
      const xs = [CB.west, CB.hallW0, CB.elecW0, CB.fanW0, CB.data0,
        CB.data1, CB.fanE1, CB.elecE1, CB.east];
      const epsilon = 0.015;
      for (let x = 0; x < xs.length - 1; x++) {
        if (bounds.min.x < xs[x] + epsilon || bounds.max.x > xs[x + 1] - epsilon) continue;
        for (let z = 0; z < CB.pods; z++) {
          const band = podBand(z);
          if (bounds.min.z >= band.z0 + epsilon && bounds.max.z <= band.z1 - epsilon)
            return `room:${x}:${z}`;
        }
      }
    }
    bounds.getCenter(center);
    return `cell:${Math.floor(center.x / cellSize)}:${Math.floor(center.z / cellSize)}`;
  }
  function collectWall(obj, bounds) {
    if (!obj.userData.staticOccluder) return;
    bounds.getSize(size);
    // Only explicit, thin axis-aligned wall segments are occluders. Builders tag
    // each solid segment after subtracting door openings from the source wall.
    const axis = size.x < size.z ? 'x' : 'z';
    const along = axis === 'x' ? 'z' : 'x';
    if (size[axis] > 0.65 || size[along] < 0.4 || size.y < 1) return;
    walls.push({ bounds: bounds.clone(), axis, along,
      plane: (bounds.min[axis] + bounds.max[axis]) / 2 });
  }
  function visit(obj, blocked = false) {
    const skip = blocked || obj.userData.noBake === true || protectedSet.has(obj) || !obj.visible;
    if (!skip && obj.isMesh && !obj.children.length && !obj.isInstancedMesh && !obj.isSkinnedMesh && !obj.isBatchedMesh) {
      const m = obj.material, g = obj.geometry;
      const supported = m && !Array.isArray(m) &&
        (m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshBasicMaterial);
      const custom = Object.hasOwn(obj, 'onBeforeRender') || Object.hasOwn(obj, 'onAfterRender') ||
        (m && Object.hasOwn(m, 'onBeforeCompile')) || obj.customDepthMaterial || obj.customDistanceMaterial;
      const ordinary = g && g.index && g.attributes.position && g.attributes.normal && g.attributes.uv &&
        !Object.keys(g.morphAttributes).length && !Object.values(g.attributes).some(a => a.isInterleavedBufferAttribute) &&
        g.drawRange.start === 0 && (g.drawRange.count === Infinity || g.drawRange.count >= g.index.count);
      if (supported && m.visible && !m.transparent && m.opacity === 1 && !custom && ordinary) {
        obj.updateWorldMatrix(true, false);
        g.computeBoundingBox();
        const bounds = g.boundingBox.clone().applyMatrix4(obj.matrixWorld);
        collectWall(obj, bounds);
        // Negative scale needs winding repair; leaving it intact is safer.
        if (obj.matrixWorld.determinant() > 0) {
          const emissive = !!m.emissive && m.emissive.getHex() !== 0;
          const flat = noMaps(m) && !m.vertexColors && !emissive && !m.isMeshPhysicalMaterial;
          const geo = g.clone().applyMatrix4(obj.matrixWorld);
          if (flat) {
            const values = new Float32Array(geo.attributes.position.count * 3);
            for (let n = 0; n < values.length; n += 3) {
              values[n] = m.color.r; values[n + 1] = m.color.g; values[n + 2] = m.color.b;
            }
            geo.setAttribute('color', new THREE.BufferAttribute(values, 3));
          }
          const space = spatialKey(bounds);
          const key = `${space}|${flat ? flatKey(m) : m.uuid}|${attributeKey(geo)}|${obj.renderOrder}|${obj.layers.mask}`;
          let group = groups.get(key);
          if (!group) {
            const material = flat ? m.clone() : m;
            if (flat) { material.color.set(0xffffff); material.vertexColors = true; }
            group = { material, clonedMaterial: flat, emissive, basic: !!m.isMeshBasicMaterial,
              space, geos: [], originals: [], renderOrder: obj.renderOrder, layers: obj.layers.mask };
            groups.set(key, group);
          }
          group.geos.push(geo); group.originals.push(obj);
          stats.collected++;
          stats.sourceTriangles += g.index.count / 3;
          if (emissive) stats.emissiveSources++;
          if (m.isMeshBasicMaterial) stats.basicSources++;
        }
      }
    }
    for (const child of obj.children) visit(child, skip);
  }
  visit(scene);
  for (const group of groups.values()) {
    let geometry;
    try { geometry = BufferGeometryUtils.mergeGeometries(group.geos, false); }
    catch (error) { console.warn('[LW] static batch retained originals:', error); }
    for (const temp of group.geos) temp.dispose();
    if (!geometry) {
      stats.failures++;
      if (group.clonedMaterial) group.material.dispose();
      continue;
    }
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, group.material);
    mesh.name = `static:${group.space}`;
    mesh.userData.staticBatch = true;
    mesh.userData.noBake = true;
    mesh.matrixAutoUpdate = false;
    mesh.receiveShadow = !group.basic;
    mesh.castShadow = !!castShadows && !group.basic && !group.emissive;
    mesh.renderOrder = group.renderOrder;
    mesh.layers.mask = group.layers;
    // Only successful groups lose their source meshes. A failed merge never
    // turns a real wall, walkway or prop invisible.
    for (const original of group.originals) original.parent?.remove(original);
    scene.add(mesh);
    const triangles = geometry.index.count / 3;
    batches.push({ mesh, bounds: geometry.boundingBox.clone(), triangles });
    originalVisibility.set(mesh, true);
    stats.removed += group.originals.length;
    stats.drawGroups++; stats.batchTriangles += triangles;
    if (group.emissive) stats.emissiveGroups++;
    if (group.basic) stats.basicGroups++;
  }
  groups.clear();
  stats.wallCount = walls.length;
  let enabled = !!occlusion, lastPosition = null;
  function update(position, force = false) {
    if (!position || (!force && lastPosition?.distanceToSquared(position) < 0.0004)) return;
    if (!lastPosition) lastPosition = new THREE.Vector3();
    lastPosition.copy(position);
    let hidden = 0, triangles = 0;
    for (const batch of batches) {
      const blocked = enabled && walls.some(wall => fullyBehindWall(position, batch.bounds, wall));
      batch.mesh.visible = !blocked && originalVisibility.get(batch.mesh);
      if (blocked) { hidden++; triangles += batch.triangles; }
    }
    stats.culledGroups = hidden; stats.culledTriangles = triangles;
  }
  // Scene hook runs before Three builds its render list. It also covers QA direct
  // renders and leaves the mobile lifecycle, camera and post-processing untouched.
  const previousBeforeRender = scene.onBeforeRender;
  const cameraWorldPosition = new THREE.Vector3();
  scene.onBeforeRender = function(renderer, renderedScene, camera, target) {
    previousBeforeRender.call(this, renderer, renderedScene, camera, target);
    camera.getWorldPosition(cameraWorldPosition);
    update(cameraWorldPosition);
  };
  return {
    update,
    setOcclusion(value) { enabled = !!value; stats.occlusion = enabled; update(lastPosition, true); },
    stats: () => ({ ...stats }),
    // Read-only geometry metadata is useful to the authored QA page.
    batches, walls,
  };
}

// A sufficient condition, not a visibility guess: all eight box corners must
// project inside ONE solid wall rectangle from the actual camera position.
// Separate wall pieces cannot jointly hide a target through their shared door.
export function fullyBehindWall(eye, target, wall, inset = 0.12) {
  const { bounds, axis, along, plane } = wall;
  if (eye[axis] < bounds.min[axis] - inset) {
    if (target.min[axis] <= bounds.max[axis] + inset) return false;
  } else if (eye[axis] > bounds.max[axis] + inset) {
    if (target.max[axis] >= bounds.min[axis] - inset) return false;
  } else return false;
  const amin = bounds.min[along] + inset, amax = bounds.max[along] - inset;
  const ymin = bounds.min.y + inset, ymax = bounds.max.y - inset;
  for (const x of [target.min.x, target.max.x])
    for (const y of [target.min.y, target.max.y])
      for (const z of [target.min.z, target.max.z]) {
        const coordinate = axis === 'x' ? x : z;
        const other = along === 'x' ? x : z;
        const t = (plane - eye[axis]) / (coordinate - eye[axis]);
        const a = eye[along] + t * (other - eye[along]);
        const py = eye.y + t * (y - eye.y);
        if (t <= 0 || t >= 1 || a < amin || a > amax || py < ymin || py > ymax) return false;
      }
  return true;
}
