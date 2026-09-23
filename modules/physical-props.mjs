/** Detailed procedural Three.js assets with matching Rapier collision dimensions. */
export const PHYSICAL_PROP_SPECS = Object.freeze({
  reel: Object.freeze({ radius: 0.52, drumRadius: 0.338, halfWidth: 0.36, flangeThickness: 0.11, mass: 28, friction: 0.64 }),
  case: Object.freeze({ width: 0.92, height: 0.52, depth: 0.64, mass: 16, friction: 0.64 }),
  stand: Object.freeze({ width: 1.30, depth: 0.88, axleHeight: 1.12, mass: 28 }),
});

/**
 * positions contains feet/base positions, in metres. Set a slot to false to omit.
 * {reel:{x,y,z}, cases:[{x,y,z},...], stand:{x,y,z}}; optional yaw is radians.
 * Call update once AFTER physics.update. It never advances the physics world.
 */
export function createPhysicalProps({ THREE, scene, physics, positions = {}, woodTexture = null, idPrefix = 'yard' }) {
  if (!THREE || !scene || !physics) throw new Error('THREE, scene and physics are required.');
  const T = THREE;
  const specs = PHYSICAL_PROP_SPECS;
  const records = [];
  const meshes = [];
  const standColliders = [];
  const anchors = [];
  const joints = [];
  const geometries = new Set();
  const materials = new Set();
  const vector = (v = {}) => ({ x: v.x || 0, y: v.y || 0, z: v.z || 0 });
  const defaultPositions = {
    reel: { x: -31.6, y: 0.02, z: 43.0 },
    cases: [{ x: -30.1, y: 0.015, z: 46.2 }, { x: -30.1, y: 0.55, z: 46.2 }],
    stand: { x: -39.4, y: 0, z: 44.1 },
  };
  const locations = { ...defaultPositions, ...positions };
  let disposed = false;

  const material = (color, roughness = 0.8, metalness = 0) => {
    const m = new T.MeshStandardMaterial({ color, roughness, metalness });
    materials.add(m);
    return m;
  };
  const wood = [material(0x987046), material(0xb68a54), material(0xa97b49), material(0xc49760)];
  if (woodTexture) for (const m of wood) m.map = woodTexture;
  const grain = material(0x59442e, 0.92);
  const cable = material(0x191c1c, 0.8);
  const cableEdge = material(0x303535, 0.72);
  const steel = material(0x8a9498, 0.38, 0.88);
  const darkSteel = material(0x353f43, 0.63, 0.78);
  const paint = material(0xd59a26, 0.75, 0.2);
  const rust = material(0x75503a, 0.95, 0.2);
  const orange = material(0xbb571e, 0.86);
  const rubber = material(0x292e2d, 0.95);
  const label = material(0xc5bf9e, 0.94);

  // Only merges geometry inside an individual movable prop, preserving all dynamic roots.
  function finish(group, parts) {
    const batches = new Map();
    for (const { geometry, mat, position, rotation, scale } of parts) {
      const matrix = new T.Matrix4().compose(
        new T.Vector3(position.x, position.y, position.z),
        new T.Quaternion().setFromEuler(new T.Euler(rotation.x, rotation.y, rotation.z)),
        new T.Vector3(scale.x, scale.y, scale.z),
      );
      geometry.applyMatrix4(matrix);
      const flat = geometry.index ? geometry.toNonIndexed() : geometry;
      if (flat !== geometry) geometry.dispose();
      if (!batches.has(mat)) batches.set(mat, []);
      batches.get(mat).push(flat);
    }
    for (const [mat, batch] of batches) {
      const total = batch.reduce((sum, g) => sum + g.getAttribute('position').count, 0);
      const merged = new T.BufferGeometry();
      for (const [name, itemSize] of [['position', 3], ['normal', 3], ['uv', 2]]) {
        const data = new Float32Array(total * itemSize);
        let offset = 0;
        for (const geometry of batch) {
          const attr = geometry.getAttribute(name);
          if (attr) data.set(attr.array, offset);
          offset += geometry.getAttribute('position').count * itemSize;
        }
        merged.setAttribute(name, new T.BufferAttribute(data, itemSize));
      }
      batch.forEach(g => g.dispose());
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      geometries.add(merged);
      const mesh = new T.Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    group.traverse(object => { object.userData.noBake = true; object.userData.physicalProp = true; });
    return group;
  }

  function builder() {
    const parts = [];
    const add = (geometry, mat, position = {}, rotation = {}, scale = { x: 1, y: 1, z: 1 }) => parts.push({
      geometry, mat, position: vector(position), rotation: vector(rotation), scale,
    });
    const box = (w, h, d, mat, x = 0, y = 0, z = 0, rotation = {}) => add(new T.BoxGeometry(w, h, d), mat, { x, y, z }, rotation);
    const cylinder = (r, length, mat, x = 0, y = 0, z = 0, rotation = {}, segments = 32) => add(new T.CylinderGeometry(r, r, length, segments), mat, { x, y, z }, rotation);
    const torus = (r, tube, mat, x = 0, y = 0, z = 0, rotation = {}) => add(new T.TorusGeometry(r, tube, 5, 56), mat, { x, y, z }, rotation);
    return { parts, add, box, cylinder, torus };
  }

  function makeReel() {
    const group = new T.Group();
    group.name = 'Wooden cable reel';
    const { parts, add, box, cylinder, torus } = builder();
    const r = specs.reel.radius, h = specs.reel.halfWidth;
    const axleRotation = { z: Math.PI / 2 };
    cylinder(specs.reel.drumRadius, h * 2, cable, 0, 0, 0, axleRotation, 56);
    for (const side of [-1, 1]) {
      cylinder(r, specs.reel.flangeThickness, wood[0], side * h, 0, 0, axleRotation, 64);
      const faceX = side * (h + specs.reel.flangeThickness / 2 + 0.001);
      // Separate board faces clipped to the circular flange; dark gaps expose substrate.
      for (let plank = 0; plank < 9; plank++) {
        const y0 = Math.max(-r + 0.003, -r + plank * (r * 2 / 9) + 0.002);
        const y1 = Math.min(r - 0.003, -r + (plank + 1) * (r * 2 / 9) - 0.002);
        const shape = new T.Shape();
        for (let i = 0; i <= 5; i++) {
          const y = y0 + (y1 - y0) * i / 5;
          const z = Math.sqrt(Math.max(0, (r - 0.002) ** 2 - y ** 2));
          if (i === 0) shape.moveTo(-z, y); else shape.lineTo(-z, y);
        }
        for (let i = 5; i >= 0; i--) {
          const y = y0 + (y1 - y0) * i / 5;
          shape.lineTo(Math.sqrt(Math.max(0, (r - 0.002) ** 2 - y ** 2)), y);
        }
        shape.closePath();
        add(new T.ShapeGeometry(shape), wood[1 + plank % 3], { x: faceX }, { y: side * Math.PI / 2 });
        for (let line = 0; line < 2; line++) {
          const y = y0 + (y1 - y0) * (line + 1) / 3;
          const span = Math.sqrt(Math.max(0, (r - 0.05) ** 2 - y ** 2));
          if (span > 0.04) box(0.0012, 0.0009, span * (1.1 + 0.1 * (plank % 3)), grain,
            faceX + side * 0.001, y, 0.035 * Math.sin(plank * 2));
        }
      }
      // Hub sockets, flange tie-bolts and washers remain within the flange radius.
      cylinder(0.066, 0.004, darkSteel, faceX + side * 0.003, 0, 0, axleRotation, 24);
      cylinder(0.030, 0.005, cable, faceX + side * 0.006, 0, 0, axleRotation, 20);
      for (let bolt = 0; bolt < 6; bolt++) {
        const angle = bolt * Math.PI / 3 + 0.2;
        const y = Math.sin(angle) * 0.395, z = Math.cos(angle) * 0.395;
        cylinder(0.027, 0.003, darkSteel, faceX + side * 0.003, y, z, axleRotation, 16);
        cylinder(0.017, 0.008, steel, faceX + side * 0.008, y, z, axleRotation, 6);
      }
    }
    // Individual cable turns have real geometry and catch raking light.
    for (let turn = 0; turn < 23; turn++) {
      torus(specs.reel.drumRadius - 0.010, 0.009, turn % 3 === 0 ? cableEdge : cable,
        -0.319 + turn * 0.029, 0, 0, { y: Math.PI / 2 });
    }
    // Cable tail is tucked between the flanges so it does not exceed the proxy.
    cylinder(0.01, 0.25, cableEdge, 0.19, 0.235, 0.205, { x: Math.PI / 2, z: 0.3 }, 8);
    finish(group, parts);
    group.userData.kind = 'reel';
    group.userData.dimensions = { x: 0.856, y: 1.04, z: 1.04 };
    return group;
  }

  function makeCase() {
    const group = new T.Group();
    group.name = 'Stackable electrician tool case';
    const { parts, box, cylinder } = builder();
    const s = specs.case;
    box(s.width - 0.04, s.height - 0.055, s.depth - 0.04, orange, 0, -0.0175, 0);
    box(s.width - 0.012, 0.048, s.depth - 0.012, orange, 0, s.height / 2 - 0.024, 0);
    // Continuous rubber edges and reinforced corners inside the collision box.
    for (const x of [-1, 1]) for (const z of [-1, 1]) {
      box(0.058, s.height - 0.008, 0.058, rubber, x * (s.width / 2 - 0.029), 0, z * (s.depth / 2 - 0.029));
    }
    for (const y of [-1, 1]) {
      for (const z of [-1, 1]) box(s.width - 0.012, 0.024, 0.025, rubber, 0, y * (s.height / 2 - 0.012), z * (s.depth / 2 - 0.0125));
      for (const x of [-1, 1]) box(0.025, 0.024, s.depth - 0.012, rubber, x * (s.width / 2 - 0.0125), y * (s.height / 2 - 0.012), 0);
    }
    // Moulded ribs and panel seams show useful scale in both close and distant views.
    for (const z of [-1, 1]) for (let rib = 0; rib < 5; rib++) box(0.036, 0.29, 0.014, orange, (rib - 2) * 0.15, -0.024, z * (s.depth / 2 - 0.011));
    for (const x of [-1, 1]) for (let rib = 0; rib < 3; rib++) box(0.014, 0.29, 0.032, orange, x * (s.width / 2 - 0.011), -0.024, (rib - 1) * 0.15);
    for (const z of [-1, 1]) box(s.width - 0.10, 0.007, 0.008, rubber, 0, 0.177, z * (s.depth / 2 - 0.01));
    for (const x of [-0.28, 0.28]) {
      box(0.048, 0.092, 0.019, steel, x, 0.159, -s.depth / 2 + 0.0095);
      box(0.036, 0.046, 0.008, darkSteel, x, 0.149, -s.depth / 2 - 0.002);
      cylinder(0.009, 0.05, steel, x, 0.18, -s.depth / 2 - 0.004, { z: Math.PI / 2 }, 12);
      // Lid hinges on the back face.
      cylinder(0.013, 0.085, steel, x, 0.184, s.depth / 2 - 0.01, { z: Math.PI / 2 }, 12);
    }
    // Recessed front handle uses its own volume but stays inside the overall body.
    box(0.26, 0.12, 0.006, rubber, 0, 0.045, -s.depth / 2 - 0.003);
    cylinder(0.021, 0.19, rubber, 0, 0.043, -s.depth / 2 - 0.006, { z: Math.PI / 2 }, 16);
    box(0.022, 0.075, 0.033, rubber, -0.103, 0.05, -s.depth / 2 + 0.006);
    box(0.022, 0.075, 0.033, rubber, 0.103, 0.05, -s.depth / 2 + 0.006);
    // Plain paper inventory patch; deliberately no fake unreadable brand text.
    box(0.13, 0.070, 0.002, label, 0.20, -0.08, -s.depth / 2 - 0.001);
    for (let row = 0; row < 3; row++) box(0.071 - row * 0.011, 0.003, 0.001, darkSteel, 0.20, -0.066 - row * 0.015, -s.depth / 2 - 0.0025);
    finish(group, parts);
    group.userData.kind = 'case';
    group.userData.dimensions = { x: s.width, y: s.height, z: s.depth + 0.04 };
    return group;
  }

  function makeStand() {
    const group = new T.Group();
    group.name = 'Steel cable reel stand';
    const { parts, box, cylinder } = builder();
    for (const side of [-1, 1]) {
      const x = side * 0.58;
      box(0.11, 0.075, 0.88, darkSteel, x, 0.0375, 0);
      box(0.085, 1.09, 0.085, paint, x, 0.62, 0);
      box(0.14, 0.13, 0.15, darkSteel, x, 1.12, 0);
      cylinder(0.059, 0.146, steel, x, 1.12, 0, { z: Math.PI / 2 }, 24);
      cylinder(0.025, 0.04, darkSteel, x + side * 0.076, 1.12, 0, { z: Math.PI / 2 }, 20);
      // Braces are placed inside each fixed side collider's envelope.
      for (const direction of [-1, 1]) box(0.058, 0.54, 0.045, paint, x, 0.29, direction * 0.16, { x: direction * 0.60 });
      for (const z of [-0.34, 0.34]) {
        cylinder(0.023, 0.008, steel, x, 0.079, z, {}, 6);
        box(0.03, 0.004, 0.09, rust, x + 0.032, 0.077, z + 0.025);
      }
    }
    box(1.13, 0.075, 0.075, paint, 0, 0.11, 0);
    cylinder(0.024, 1.32, steel, 0, 1.12, 0, { z: Math.PI / 2 }, 20);
    finish(group, parts);
    group.userData.kind = 'stand';
    return group;
  }

  function addMoving(group, { id, kind, label: name, position, yaw = 0, mass, ...settings }) {
    const q = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw);
    group.userData.physicsId = id;
    group.userData.interactionLabel = name;
    group.traverse(object => { object.userData.physicsId = id; });
    scene.add(group);
    meshes.push(group);
    const prop = physics.addDynamicProp({ id, mesh: group, position, rotation: q, mass, ...settings });
    const record = { id, kind, label: name, mass, mesh: group, body: prop.body, prop, initialPosition: { ...position }, yaw };
    records.push(record);
    return record;
  }

  if (locations.reel !== false) {
    const p = vector(locations.reel);
    addMoving(makeReel(), { id: `${idPrefix}-loose-reel`, kind: 'reel', label: 'Cable reel · 28 kg',
      shape: 'reel', position: { ...p, y: p.y + specs.reel.radius }, yaw: locations.reel.yaw || 0,
      radius: specs.reel.radius, halfHeight: specs.reel.halfWidth, mass: specs.reel.mass,
      friction: specs.reel.friction, linearDamping: 0.12, angularDamping: 0.12, restitution: 0.06 });
  }
  if (locations.cases !== false) (locations.cases || []).forEach((location, index) => {
    const p = vector(location), s = specs.case;
    addMoving(makeCase(), { id: `${idPrefix}-case-${index + 1}`, kind: 'case', label: 'Tool case · 16 kg',
      shape: 'box', position: { ...p, y: p.y + s.height / 2 }, yaw: location.yaw || 0,
      size: { x: s.width, y: s.height, z: s.depth }, mass: s.mass, friction: s.friction,
      linearDamping: 0.22, angularDamping: 0.6, restitution: 0.035 });
  });
  if (locations.stand !== false) {
    const p = vector(locations.stand), yaw = locations.stand.yaw || 0;
    const q = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw);
    const group = makeStand();
    group.position.set(p.x, p.y, p.z);
    group.rotation.y = yaw;
    scene.add(group);
    meshes.push(group);
    const at = (x, y, z) => ({ x: p.x + x * Math.cos(yaw) + z * Math.sin(yaw), y: p.y + y, z: p.z - x * Math.sin(yaw) + z * Math.cos(yaw) });
    // Thin frame proxies avoid filling the gap beneath or inside the rotating reel.
    for (const side of [-1, 1]) {
      standColliders.push(physics.addStaticBox({ id: `${idPrefix}-stand-foot-${side}`,
        position: at(side * 0.58, 0.0375, 0), size: { x: 0.11, y: 0.075, z: 0.88 }, rotation: q }));
      standColliders.push(physics.addStaticBox({ id: `${idPrefix}-stand-post-${side}`,
        position: at(side * 0.58, 0.64, 0), size: { x: 0.15, y: 1.14, z: 0.15 }, rotation: q }));
      for (const direction of [-1, 1]) {
        const braceRotation = new T.Quaternion().setFromEuler(new T.Euler(direction * 0.60, yaw, 0, 'YXZ'));
        standColliders.push(physics.addStaticBox({ id: `${idPrefix}-stand-brace-${side}-${direction}`,
          position: at(side * 0.58, 0.29, direction * 0.16), size: { x: 0.058, y: 0.54, z: 0.045 }, rotation: braceRotation }));
      }
    }
    standColliders.push(physics.addStaticBox({ id: `${idPrefix}-stand-crossbar`,
      position: at(0, 0.11, 0), size: { x: 1.13, y: 0.075, z: 0.075 }, rotation: q }));
    const centre = at(0, specs.stand.axleHeight, 0);
    const reel = addMoving(makeReel(), { id: `${idPrefix}-mounted-reel`, kind: 'mounted-reel', label: 'Mounted cable reel · spins on axle',
      shape: 'reel', position: centre, yaw, radius: specs.reel.radius, halfHeight: specs.reel.halfWidth,
      mass: specs.reel.mass, friction: specs.reel.friction, linearDamping: 0.1, angularDamping: 0.16 });
    const anchor = physics.createAnchor(centre);
    anchor.setRotation(q, true);
    anchors.push(anchor);
    joints.push(physics.createHinge({ a: anchor, b: reel.body, axis: { x: 1, y: 0, z: 0 } }));
  }

  function inspect() {
    let drawCalls = 0, triangles = 0;
    for (const root of meshes) root.traverse(mesh => {
      if (!mesh.isMesh) return;
      drawCalls++;
      triangles += (mesh.geometry.index?.count || mesh.geometry.attributes.position.count) / 3;
    });
    return { drawCalls, triangles, dynamicBodies: records.length, fixedSupportColliders: standColliders.length,
      records: records.map(r => ({ id: r.id, kind: r.kind, label: r.label, mass: r.mass, position: vector(r.body.translation()) })) };
  }

  /** A useful target for an interact prompt without creating a second render loop. */
  function nearest(position, maxDistance = 2.7) {
    if (disposed) return null;
    let found = null, distance = maxDistance;
    for (const record of records) {
      const p = record.body.translation();
      const d = Math.hypot(p.x - position.x, p.z - position.z);
      if (d < distance && Math.abs(p.y - (position.y || 0)) < 2.2) {
        found = record; distance = d;
      }
    }
    return found ? { ...found, distance } : null;
  }

  /** Off-centre force makes the mounted spool spin; free props move physically. */
  function push(id, direction, strength = 1) {
    if (disposed) return false;
    const record = records.find(r => r.id === id);
    if (!record) return false;
    const length = Math.hypot(direction.x || 0, direction.z || 0) || 1;
    const amount = Math.max(0, Math.min(2.5, Number.isFinite(strength) ? strength : 1)) * 15;
    const impulse = { x: (direction.x || 0) / length * amount, y: 0, z: (direction.z || 0) / length * amount };
    const p = record.body.translation();
    const contact = { x: p.x, y: p.y + (record.kind.includes('reel') ? 0.32 : 0.08), z: p.z };
    return physics.applyImpulse(id, impulse, contact);
  }

  function reset() {
    if (disposed) return;
    for (const record of records) physics.resetProp(record.id);
  }

  function update() {
    if (disposed) return;
    // Physics owns transforms. This is the place for later contact-driven audio/VFX.
    for (const record of records) record.mesh.userData.sleeping = record.body.isSleeping();
  }

  function dispose() {
    if (disposed) return;
    if (!physics.disposed) {
      joints.forEach(joint => physics.world.removeImpulseJoint(joint, true));
      records.forEach(record => physics.removeProp(record.id));
      anchors.forEach(anchor => physics.world.removeRigidBody(anchor));
      standColliders.forEach(collider => physics.removeStaticCollider(collider));
    }
    meshes.forEach(root => scene.remove(root));
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(mat => mat.dispose());
    disposed = true;
  }

  return { meshes, records, specs, inspect, nearest, push, reset, update, dispose };
}
