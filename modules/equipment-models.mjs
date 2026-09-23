// Procedural equipment models. All dimensions are metres; +Z is vehicle forward.
// These are visual replacements. Existing game collision and equipment control remain authoritative.
export const EQUIPMENT_SPECS = Object.freeze({
  lift: Object.freeze({ width: 1.49, length: 2.60, deckWidth: 1.32, deckLength: 2.35, stowedDeck: 1, maxDeck: 7.5, stages: 3, armLength: 2.48, wheelRadius: .205 }),
  utv: Object.freeze({ width: 1.87, length: 3.2, roofHeight: 2.02, wheelRadius: .38, wheelTrack: 1.56, wheelbase: 1.90 }),
});

const SHARED_RESOURCES = new WeakMap();
function resourcesFor(T) {
  if (!SHARED_RESOURCES.has(T)) SHARED_RESOURCES.set(T, { geometries: new Map(), materials: new Map() });
  return SHARED_RESOURCES.get(T);
}
/** Call only after every equipment model using this THREE runtime has been removed. */
export function disposeSharedEquipmentResources(THREE) {
  const cache = SHARED_RESOURCES.get(THREE);
  if (!cache) return;
  cache.geometries.forEach(g => g.dispose()); cache.materials.forEach(m => m.dispose());
  SHARED_RESOURCES.delete(THREE);
}

function toolsFor(T, color, detail = "near") {
  const low = detail === "far";
  const shared = resourcesFor(T);
  const geometries = new Set(), materials = new Set();
  function material(color, roughness, metalness = 0, extra = {}) {
    const key = JSON.stringify([new T.Color(color).getHex(), roughness, metalness, extra]);
    if (!shared.materials.has(key)) shared.materials.set(key, new T.MeshStandardMaterial({ color, roughness, metalness, ...extra }));
    const m = shared.materials.get(key); materials.add(m); return m;
  }
  function internGeometry(geometry) {
    let hash = 2166136261;
    const arrays = ['position', 'normal', 'uv'].map(name => geometry.attributes[name]?.array).filter(Boolean);
    if (geometry.index) arrays.push(geometry.index.array);
    for (const array of arrays) {
      const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      for (let i = 0; i < bytes.length; i++) hash = Math.imul(hash ^ bytes[i], 16777619) >>> 0;
    }
    const key = `${hash}:${arrays.map(a => a.length).join(':')}`;
    if (shared.geometries.has(key)) { geometry.dispose(); return shared.geometries.get(key); }
    shared.geometries.set(key, geometry); return geometry;
  }
  const m = {
    paint: material(color, .59, .22),
    paintDark: material(new T.Color(color).multiplyScalar(.57), .71, .24),
    steel: material(0x9ba7ae, .31, .88),
    black: material(0x283138, .66, .63),
    rubber: material(0x1c2021, .91),
    seat: material(0x343a3d, .98),
    pale: material(0xd9d9c8, .78),
    red: material(0x9a281d, .36, .06, { emissive: 0x66120a, emissiveIntensity: .25 }),
    lamp: material(0xdce6e5, .23, .15, { emissive: 0xd7e8ef, emissiveIntensity: .32 }),
  };
  const pos = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
  const part = (list, geometry, mat, position = pos(), rotation = {}, scale = pos(1, 1, 1)) => list.push({ geometry, mat, position, rotation, scale });
  function roundedShape(w, h, r) {
    r = Math.min(r, w / 2 - .001, h / 2 - .001);
    const x = -w / 2, y = -h / 2, s = new T.Shape();
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); s.closePath(); return s;
  }
  function bevelBox(w, h, d, r = .035) {
    if (low || Math.min(w,h,d) < .016) return new T.BoxGeometry(w,h,d);
    const b = Math.min(.009, Math.min(w, h, d) / 5, r / 3);
    const g = new T.ExtrudeGeometry(roundedShape(w - b * 2, h - b * 2, Math.max(.003, r - b)), {
      depth: d - b * 2, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelThickness: b, bevelSize: b, curveSegments: 1,
    });
    g.translate(0, 0, -d / 2 + b); return g;
  }
  function box(list, w, h, d, mat, x = 0, y = 0, z = 0, rotation = {}, bevel = 0) {
    part(list, bevel ? bevelBox(w, h, d, bevel) : new T.BoxGeometry(w, h, d), mat, pos(x, y, z), rotation);
  }
  function cylinder(list, r, length, mat, x = 0, y = 0, z = 0, rotation = {}, segments = 24) {
    part(list, new T.CylinderGeometry(r, r, length, low ? Math.min(segments,8) : Math.min(segments,16)), mat, pos(x, y, z), rotation);
  }
  function ball(list, radius, mat, x, y, z, scale = pos(1, 1, 1)) {
    part(list, new T.SphereGeometry(radius, low ? 6 : 10, low ? 4 : 6), mat, pos(x, y, z), {}, scale);
  }
  function tube(list, points, radius, mat, cornerRadius = .06, radialSegments = 6) {
    const p = points.map(v => Array.isArray(v) ? pos(...v) : v);
    const path = new T.CurvePath(); let current = p[0];
    for (let i = 1; i < p.length - 1; i++) {
      const corner = p[i], previous = p[i - 1], next = p[i + 1];
      const radius = Math.min(cornerRadius, corner.distanceTo(previous) * .3, corner.distanceTo(next) * .3);
      const before = corner.clone().add(previous.clone().sub(corner).normalize().multiplyScalar(radius));
      const after = corner.clone().add(next.clone().sub(corner).normalize().multiplyScalar(radius));
      path.add(new T.LineCurve3(current, before)); path.add(new T.QuadraticBezierCurve3(before, corner, after)); current = after;
    }
    path.add(new T.LineCurve3(current, p.at(-1)));
    part(list, new T.TubeGeometry(path, Math.max(2, Math.ceil(path.getLength() / (low ? .65 : .22))), radius, low ? 4 : Math.min(radialSegments,6), false), mat);
  }
  function beam(list, a, b, radius, mat) { tube(list, [a, b], radius, mat, 0, 6); }
  function loft(list, sections, mat) {
    // Chamfered octagonal shell stations produce a designed hood instead of a rectangular block.
    const vertices = [], indices = [];
    for (const { z, width, top, bottom } of sections) {
      const half = width / 2, bevel = .085;
      for (const [x, y] of [[-half + bevel, bottom], [half - bevel, bottom], [half, bottom + .055], [half, top - .055], [half - bevel, top], [-half + bevel, top], [-half, top - .055], [-half, bottom + .055]]) vertices.push(x, y, z);
    }
    for (let ring = 0; ring < sections.length - 1; ring++) for (let j = 0; j < 8; j++) {
      const a = ring * 8 + j, b = ring * 8 + (j + 1) % 8, c = a + 8, d = b + 8;
      indices.push(a, c, b, b, c, d);
    }
    for (let i = 1; i < 7; i++) indices.push(0, i, i + 1);
    const end = (sections.length - 1) * 8;
    for (let i = 1; i < 7; i++) indices.push(end, end + i + 1, end + i);
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(vertices, 3)); g.setIndex(indices); g.computeVertexNormals();
    part(list, g, mat);
  }
  function batch(parent, parts) {
    const buckets = new Map();
    for (const p of parts) {
      p.geometry.applyMatrix4(new T.Matrix4().compose(p.position, new T.Quaternion().setFromEuler(new T.Euler(p.rotation.x || 0, p.rotation.y || 0, p.rotation.z || 0)), p.scale));
      const g = p.geometry.index ? p.geometry.toNonIndexed() : p.geometry;
      if (g !== p.geometry) p.geometry.dispose();
      if (!buckets.has(p.mat)) buckets.set(p.mat, []); buckets.get(p.mat).push(g);
    }
    for (const [mat, parts] of buckets) {
      const count = parts.reduce((sum, g) => sum + g.attributes.position.count, 0), merged = new T.BufferGeometry();
      for (const [name, width] of [['position', 3], ['normal', 3], ['uv', 2]]) {
        const values = new Float32Array(count * width); let offset = 0;
        for (const g of parts) { if (g.attributes[name]) values.set(g.attributes[name].array, offset); offset += g.attributes.position.count * width; }
        merged.setAttribute(name, new T.BufferAttribute(values, width));
      }
      parts.forEach(g => g.dispose()); merged.computeBoundingBox(); merged.computeBoundingSphere();
      const sharedGeometry = internGeometry(merged); geometries.add(sharedGeometry);
      const mesh = new T.Mesh(sharedGeometry, mat); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
    }
  }
  function instance(parent, geometry, mat, count) {
    geometry = internGeometry(geometry); geometries.add(geometry); const mesh = new T.InstancedMesh(geometry, mat, count);
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; parent.add(mesh); return mesh;
  }
  function finalize(root, kind) {
    root.userData.equipmentKind = kind;
    root.traverse(node => { node.userData.noBake = true; node.userData.equipmentKind = kind; });
    root.userData.dispose = () => { root.traverse(node => { if (node.isInstancedMesh) node.dispose(); }); };
    root.userData.inspect = () => {
      let drawCalls = 0, triangles = 0;
      root.traverse(o => { if (o.isMesh) { drawCalls++; triangles += (o.geometry.index?.count || o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); } });
      return { kind, drawCalls, triangles };
    };
    return root;
  }
  function makeWheel(radius, width, offRoad) {
    const root = new T.Group(), parts = [], segments = low ? 8 : 24;
    const profile = [[.43, -.48], [.73, -.52], [.91, -.39], [.985, -.22], [1, 0], [.985, .22], [.91, .39], [.73, .52], [.43, .48], [.43, -.48]].map(([r, y]) => new T.Vector2(r * radius, y * width));
    part(parts, new T.LatheGeometry(profile, segments), m.rubber, pos(), { z: Math.PI / 2 });
    const count = low ? 0 : 16;
    for (let tread = 0; tread < count; tread++) {
      const a = tread / count * Math.PI * 2;
      for (const side of [-1, 1]) {
        box(parts, width * .43, radius * .14, .024, m.rubber, side * width * .22,
          Math.cos(a) * radius * .929, Math.sin(a) * radius * .929, { x: a, y: side * .28 }, 0);
      }
    }
    for (const side of [-1, 1]) {
      cylinder(parts, radius * .48, width * .06, m.steel, side * width * .47, 0, 0, { z: Math.PI / 2 }, low ? 8 : 16);
      cylinder(parts, radius * .19, width * .11, m.steel, side * width * .51, 0, 0, { z: Math.PI / 2 }, low ? 8 : 12);
      for (let lug = 0; lug < (low ? 0 : 5); lug++) {
        const a = lug * Math.PI * 2 / 5;
        cylinder(parts, radius * .038, .012, m.steel, side * width * .56, Math.sin(a) * radius * .29, Math.cos(a) * radius * .29, { z: Math.PI / 2 }, 6);
        // Dark slots in the dished hub show through between five solid spokes.
        box(parts, .008, radius * .11, radius * .23, m.rubber, side * width * .505,
          Math.sin(a + .32) * radius * .36, Math.cos(a + .32) * radius * .36, { x: -a - .32 }, 0);
      }
    }
    batch(root, parts); return root;
  }
  function addWheels(root, coordinates, radius, width, offRoad) {
    const template = makeWheel(radius, width, offRoad);
    const wheels = coordinates.map(([x, z]) => { const wheel = new T.Group(); wheel.position.set(x, radius, z); root.add(wheel); return wheel; });
    const batches = template.children.map(mesh => {
      const batch = new T.InstancedMesh(mesh.geometry, mesh.material, wheels.length);
      batch.castShadow = true; batch.receiveShadow = true; batch.frustumCulled = false;
      batch.instanceMatrix.setUsage(T.DynamicDrawUsage); root.add(batch); return batch;
    });
    function sync() {
      root.userData.beforeWheelSync?.();
      wheels.forEach((wheel, i) => { wheel.updateMatrix(); for (const batch of batches) batch.setMatrixAt(i, wheel.matrix); });
      for (const batch of batches) batch.instanceMatrix.needsUpdate = true;
    }
    batches[0].onBeforeRender = sync;
    sync(); return { wheels, sync };
  }
  return { T, m, low, geometries, materials, pos, part, roundedShape, bevelBox, box, cylinder, ball, tube, beam, loft, batch, instance, finalize, makeWheel, addWheels };
}

export function createScissorLiftModel({ THREE, color = 0x287ab0, deckHeight = 1, kit = null, detail = "near" } = {}) {
  if (!THREE) throw new Error('Pass the game THREE namespace.');
  const U = toolsFor(THREE, color, detail), { T, m, low, pos, box, cylinder, ball, tube, beam, batch, instance, bevelBox } = U;
  const root = new T.Group(); root.name = 'Articulated electric scissor lift';
  const baseParts = [];
  box(baseParts, 1.29, .30, 2.42, m.paint, 0, .29, 0, {}, .08);
  box(baseParts, 1.24, .10, 2.22, m.black, 0, .13, 0, {}, .045);
  box(baseParts, 1.26, .075, 2.26, m.paintDark, 0, .48, 0, {}, .02);
  for (const side of [-1, 1]) {
    box(baseParts, .045, .245, 1.20, m.paint, side * .657, .29, -.15, {}, .025);
    for (const z of [-.73, .44]) box(baseParts, .007, .19, .01, m.black, side * .683, .30, z);
    for (let vent = 0; vent < 9; vent++) box(baseParts, .007, .115, .023, m.black, side * .684, .30, -.39 + vent * .058, { x: .18 });
    cylinder(baseParts, .021, .008, m.steel, side * .686, .35, .47, { z: Math.PI / 2 }, 12);
    box(baseParts, .008, .093, .23, m.pale, side * .686, .29, .75, {}, .008);
    for (let stripe = 0; stripe < 3; stripe++) box(baseParts, .009, .069, .014, m.black, side * .692, .29, .69 + stripe * .054, { x: .45 });
    beam(baseParts, [side * .52, .10, -.95], [side * .52, .10, .95], .035, m.black);
  }
  for (const z of [-1.235, 1.235]) {
    box(baseParts, 1.02, .09, .045, m.black, 0, .22, z, {}, .024);
    for (const x of [-.39, .39]) cylinder(baseParts, .024, .012, m.steel, x, .31, z, { x: Math.PI / 2 }, 6);
  }
  // Rear access steps and grab rails.
  for (let step = 0; step < 2; step++) box(baseParts, .42, .034, .13, m.steel, 0, .19 + step * .17, -1.28, {}, .008);
  for (const side of [-1, 1]) tube(baseParts, [[side * .25, .17, -1.285], [side * .25, .59, -1.285], [side * .25, .68, -1.13]], .018, m.black);
  batch(root, baseParts);
  const wheelSet = U.addWheels(root, [[-.66, -.97], [.66, -.97], [-.66, .97], [.66, .97]], .205, .17, false);
  const wheels = wheelSet.wheels;

  const sc = new T.Group(); sc.name = 'Three stage pinned scissor mechanism'; root.add(sc);
  const stages = 3, length = 2.48, baseY = .54;
  const armGeometry = bevelBox(.070, length, .10, .021);
  const arms = instance(sc, armGeometry, m.paintDark, stages * 4);
  const pinGeometry = new T.CylinderGeometry(.054, .054, .112, low ? 6 : 10); pinGeometry.rotateZ(Math.PI / 2);
  const pins = instance(sc, pinGeometry, m.steel, 22);
  const capGeometry = new T.CylinderGeometry(.026, .026, .118, low ? 4 : 6); capGeometry.rotateZ(Math.PI / 2);
  const caps = instance(sc, capGeometry, m.black, 22);
  const cylinderBarrel = instance(sc, new T.CylinderGeometry(.034, .034, 1, low ? 6 : 10), m.black, 2);
  const cylinderRod = instance(sc, new T.CylinderGeometry(.016, .016, 1, low ? 6 : 10), m.steel, 2);
  const matrix = new T.Matrix4(), q = new T.Quaternion(), up = pos(0, 1, 0), ones = pos(1, 1, 1);
  function place(instance, i, centre, direction = up, scale = ones) {
    q.setFromUnitVectors(up, direction.clone().normalize()); matrix.compose(centre, q, scale); instance.setMatrixAt(i, matrix);
  }
  const plat = new T.Group(); plat.name = 'Lift work platform'; root.add(plat);
  const platformParts = [];
  box(platformParts, 1.32, .10, 2.35, m.paint, 0, 0, 0, {}, .035);
  box(platformParts, 1.22, .020, 2.24, m.black, 0, .058, 0, {}, .012);
  for (let x = -.45; !low && x <= .46; x += .18) for (let z = -.9; z <= .91; z += .23) {
    box(platformParts, .047, .006, .008, m.steel, x, .071, z, { y: .7 });
    box(platformParts, .047, .006, .008, m.steel, x + .034, .071, z + .042, { y: -.7 });
  }
  for (const side of [-1, 1]) {
    box(platformParts, .032, .14, 2.20, m.paint, side * .624, .14, .015, {}, .008);
    for (const z of [-1.07, 0, 1.07]) beam(platformParts, [side * .605, .20, z], [side * .605, 1.02, z], .023, m.black);
    tube(platformParts, [[side * .605, 1.00, -1.07], [side * .605, 1.045, -1.04], [side * .605, 1.045, 1.02], [side * .52, 1.045, 1.10]], .023, m.black, .05);
    beam(platformParts, [side * .605, .57, -1.06], [side * .605, .57, 1.07], .019, m.black);
  }
  tube(platformParts, [[-.58, 1.045, 1.075], [0, 1.045, 1.105], [.58, 1.045, 1.075]], .023, m.black, .04);
  beam(platformParts, [-.59, .57, 1.075], [.59, .57, 1.075], .019, m.black);
  box(platformParts, 1.22, .14, .032, m.paint, 0, .14, 1.105, {}, .008);
  // Guardrail control console, joystick and emergency stop.
  box(platformParts, .16, .14, .255, m.black, .52, .91, .70, { z: -.11 }, .028);
  cylinder(platformParts, .012, .076, m.steel, .52, 1.018, .70, {}, 12);
  ball(platformParts, .027, m.rubber, .52, 1.063, .70);
  cylinder(platformParts, .020, .022, m.red, .52, .991, .79, {}, 16);
  cylinder(platformParts, .011, .009, m.lamp, .52, .987, .63, {}, 12);
  const stripe = kit === 'ferguson' ? 0xe47721 : kit === 'oconnell' ? 0x347caf : 0x709445;
  // A black fleet stripe reads at phone scale and shares the existing rail material.
  box(platformParts, 1.24, .034, .01, m.black, 0, .14, 1.125);
  batch(plat, platformParts);
  const gate = new T.Group(); gate.name = 'Hinged platform entry gate'; gate.position.set(-.595, 0, -1.07); plat.add(gate);
  const gateParts = [];
  tube(gateParts, [[0, .22, 0], [0, .95, 0], [.05, 1.04, 0], [1.12, 1.04, 0], [1.18, .98, 0], [1.18, .22, 0]], .021, m.black, .055);
  beam(gateParts, [0, .57, 0], [1.17, .57, 0], .019, m.black);
  box(gateParts, 1.14, .135, .027, m.paint, .59, .145, 0, {}, .008);
  for (const y of [.32, .87]) cylinder(gateParts, .028, .07, m.steel, 0, y, 0);
  box(gateParts, .08, .06, .07, m.steel, 1.155, .84, 0, {}, .012);
  batch(gate, gateParts);

  const span = Math.max(.5, deckHeight - .55);
  function setHeight(requested) {
    const H = Math.min(7.5, Math.max(.92, Number.isFinite(requested) ? requested : 1));
    const rise = (H - baseY) / stages, run = Math.sqrt(length * length - rise * rise);
    plat.position.y = H; sc.scale.set(1, 1, 1);
    let arm = 0, pin = 0;
    for (const side of [-.425, .425]) {
      for (let stage = 0; stage < stages; stage++) {
        for (const sign of [-1, 1]) place(arms, arm++, pos(side + sign * .039, baseY + (stage + .5) * rise, 0), pos(0, rise, sign * run));
        matrix.makeTranslation(side, baseY + (stage + .5) * rise, 0); pins.setMatrixAt(pin, matrix); caps.setMatrixAt(pin++, matrix);
      }
      for (let level = 0; level <= stages; level++) for (const sign of [-1, 1]) {
        matrix.makeTranslation(side, baseY + level * rise, sign * run / 2); pins.setMatrixAt(pin, matrix); caps.setMatrixAt(pin++, matrix);
      }
    }
    for (let side = 0; side < 2; side++) {
      const a = pos(side ? .30 : -.30, .52, -run * .43);
      const b = pos(side ? .30 : -.30, baseY + rise * 1.30, run * .29);
      const delta = b.clone().sub(a), barrel = delta.length() * .59;
      const n = delta.clone().normalize();
      place(cylinderBarrel, side, a.clone().addScaledVector(n, barrel / 2), n, pos(1, barrel, 1));
      const rod = delta.length() - barrel + .04;
      place(cylinderRod, side, a.clone().addScaledVector(n, barrel - .04 + rod / 2), n, pos(1, rod, 1));
    }
    for (const instance of [arms, pins, caps, cylinderBarrel, cylinderRod]) instance.instanceMatrix.needsUpdate = true;
    root.userData.liftBits.height = H;
    root.userData.liftBits.armRun = run;
    return H;
  }
  root.userData.liftBits = { sc, plat, span, gate, wheels, arms, pins, height: deckHeight, setHeight, setGate(open) { gate.rotation.y = open ? Math.PI * .52 : 0; } };
  root.userData.wheels = wheels;
  root.userData.syncVisuals = wheelSet.sync;
  root.userData.seatOffset = null;
  setHeight(deckHeight);
  return U.finalize(root, 'scissor-lift');
}

export function createUtvModel({ THREE, color = 0xc36528, detail = "near" } = {}) {
  if (!THREE) throw new Error('Pass the game THREE namespace.');
  const U = toolsFor(THREE, color, detail), { T, m, low, pos, box, cylinder, ball, tube, beam, loft, batch } = U;
  const root = new T.Group(); root.name = 'Utility side-by-side vehicle';
  const parts = [];
  // Frame rails, sill guards and shaped front hood with chamfered panel edges.
  for (const side of [-1, 1]) {
    beam(parts, [side * .52, .38, -1.30], [side * .52, .38, 1.22], .048, m.black);
    tube(parts, [[side * .73, .43, -.72], [side * .77, .43, -.59], [side * .77, .43, .64], [side * .69, .52, .77]], .033, m.black);
  }
  box(parts, 1.30, .09, 1.60, m.black, 0, .46, -.10, {}, .08);
  loft(parts, [{ z: .57, width: 1.38, top: 1.135, bottom: .69 }, { z: 1.08, width: 1.41, top: 1.06, bottom: .60 }, { z: 1.47, width: 1.12, top: .885, bottom: .59 }], m.paint);
  loft(parts, [{ z: .58, width: .78, top: 1.16, bottom: 1.133 }, { z: 1.05, width: .67, top: 1.09, bottom: 1.054 }, { z: 1.29, width: .50, top: .983, bottom: .952 }], m.paintDark);
  // Nose grille, bumper, skid plate and paired headlamp housings.
  box(parts, .67, .21, .045, m.black, 0, .75, 1.473, { x: -.10 }, .035);
  for (let slat = 0; slat < 7; slat++) box(parts, .028, .16, .016, m.steel, -.25 + slat * .082, .75, 1.507, { x: -.10 });
  tube(parts, [[-.67, .62, 1.46], [-.62, .57, 1.56], [-.40, .55, 1.60], [.40, .55, 1.60], [.62, .57, 1.56], [.67, .62, 1.46]], .037, m.black, .08);
  box(parts, .61, .21, .027, m.steel, 0, .45, 1.48, { x: -.28 }, .045);
  for (const side of [-1, 1]) {
    box(parts, .27, .15, .075, m.black, side * .48, .86, 1.385, { y: side * .18, z: side * .05 }, .043);
    box(parts, .222, .094, .016, m.lamp, side * .48, .861, 1.43, { y: side * .18, z: side * .05 }, .033);
    for (let line = 0; line < 3; line++) box(parts, .004, .076, .003, m.steel, side * .48 + (line - 1) * .05, .861, 1.444, { y: side * .18 });
  }
  // Rounded arch flares follow the circular tires rather than hiding them in boxes.
  for (const side of [-1, 1]) for (const z of [-.95, .95]) {
    const shape = new T.Shape();
    for (let i = 0; i <= (low ? 6 : 12); i++) { const a = -.12 + (Math.PI + .24) * i / (low ? 6 : 12); const yy = Math.sin(a) * .455, zz = Math.cos(a) * .455; if (!i) shape.moveTo(zz, yy); else shape.lineTo(zz, yy); }
    for (let i = (low ? 6 : 12); i >= 0; i--) { const a = -.12 + (Math.PI + .24) * i / (low ? 6 : 12); shape.lineTo(Math.cos(a) * .416, Math.sin(a) * .416); }
    shape.closePath();
    const arch = new T.ExtrudeGeometry(shape, { depth: .285, bevelEnabled: false, bevelSegments: 1, bevelSize: .009, bevelThickness: .009, steps: 1, curveSegments: 1 });
    arch.translate(0, 0, -.1425); arch.rotateY(Math.PI / 2);
    U.part(parts, arch, m.paintDark, pos(side * .73, .38, z));
  }
  // Double wishbones, exposed coil springs and dampers at all four wheels.
  for (const side of [-1, 1]) for (const z of [-.95, .95]) {
    beam(parts, [side * .30, .51, z - .23], [side * .75, .37, z], .020, m.black);
    beam(parts, [side * .30, .51, z + .23], [side * .75, .37, z], .020, m.black);
    const a = pos(side * .39, .79, z), b = pos(side * .72, .33, z);
    beam(parts, a, b, .018, m.steel);
    const axis = b.clone().sub(a).normalize(), basis = pos(0, 0, 1), other = new T.Vector3().crossVectors(axis, basis).normalize();
    const coil = [];
    for (let i = 0; i <= 80; i++) { const t = i / 80, phase = t * Math.PI * 2 * 7; coil.push(a.clone().lerp(b, t).addScaledVector(basis, Math.cos(phase) * .050).addScaledVector(other, Math.sin(phase) * .050)); }
    const curve = new T.CatmullRomCurve3(coil); U.part(parts, new T.TubeGeometry(curve, low ? 7 : 42, .008, low ? 3 : 4, false), m.paint);
  }
  // Cargo box has an open bed, ribs, rollover lip and recessed tailgate.
  box(parts, 1.39, .12, .68, m.black, 0, .79, -1.035, {}, .045);
  for (const side of [-1, 1]) box(parts, .09, .25, .68, m.paint, side * .655, .95, -1.035, {}, .035);
  box(parts, 1.38, .25, .085, m.paint, 0, .95, -1.35, {}, .035);
  box(parts, 1.24, .12, .08, m.black, 0, .93, -.71, {}, .02);
  for (let rib = 0; rib < 7; rib++) box(parts, .014, .023, .54, m.paintDark, -.48 + rib * .16, .87, -1.02);
  box(parts, .20, .05, .016, m.black, 0, 1.013, -1.399, {}, .015);
  for (const side of [-1, 1]) box(parts, .18, .085, .028, m.red, side * .49, .93, -1.397, {}, .018);
  tube(parts, [[-.61, .55, -1.34], [-.57, .53, -1.49], [.57, .53, -1.49], [.61, .55, -1.34]], .033, m.black, .055);
  // Full curved tube roll cage, open entry sides, roof and front light bar.
  for (const side of [-1, 1]) {
    tube(parts, [[side * .65, .54, -.62], [side * .65, 1.69, -.64], [side * .65, 1.96, -.43], [side * .65, 1.94, .55], [side * .66, 1.83, .76], [side * .69, .91, .98]], .032, m.black, .14);
    tube(parts, [[side * .69, .61, -.55], [side * .73, .87, -.42], [side * .73, .89, .27], [side * .69, .67, .61]], .025, m.black, .10);
    box(parts, .026, .22, .63, m.paintDark, side * .71, .705, -.08, { x: -.07 }, .04);
    tube(parts, [[side * .66, 1.38, .88], [side * .80, 1.37, .85], [side * .87, 1.37, .86]], .012, m.black, .03);
    box(parts, .11, .125, .05, m.black, side * .88, 1.39, .87, { y: side * .30 }, .035);
    box(parts, .083, .095, .004, m.steel, side * .89, 1.39, .90, { y: side * .30 }, .025);
  }
  for (const [y, z] of [[1.96, -.43], [1.94, .55], [.63, -.62], [1.17, .86]]) beam(parts, [-.65, y, z], [.65, y, z], .028, m.black);
  beam(parts, [-.61, .66, -.62], [.61, 1.73, -.61], .024, m.black);
  beam(parts, [.61, .66, -.62], [-.61, 1.73, -.61], .024, m.black);
  box(parts, 1.47, .057, 1.36, m.black, 0, 1.989, .08, { x: -.018 }, .085);
  box(parts, 1.01, .105, .085, m.black, 0, 2.005, .79, { x: -.055 }, .027);
  for (let lamp = 0; lamp < 12; lamp++) box(parts, .058, .047, .012, m.lamp, -.44 + lamp * .08, 2.007, .836, {}, .012);
  // Two bucket seats have separate bolsters, headrests and visible three-point belts.
  for (const side of [-1, 1]) {
    box(parts, .46, .135, .53, m.seat, side * .32, .83, -.10, { x: -.07 }, .07);
    box(parts, .41, .56, .15, m.seat, side * .32, 1.145, -.345, { x: -.15 }, .08);
    box(parts, .255, .18, .155, m.seat, side * .32, 1.485, -.38, { x: -.10 }, .065);
    for (const bolster of [-1, 1]) box(parts, .067, .45, .17, m.rubber, side * .32 + bolster * .185, 1.11, -.31, { x: -.15, z: bolster * .03 }, .032);
    beam(parts, [side * .32 - .18, 1.40, -.28], [side * .32 + .17, .86, -.02], .019, m.black);
    box(parts, .043, .06, .025, m.red, side * .32 + .19, .895, -.02, { z: -.4 }, .01);
  }
  // Sloping dashboard, instrument binnacle, centre radio mounting pad and footwell controls.
  box(parts, 1.19, .15, .29, m.black, 0, 1.125, .58, { x: .17 }, .035);
  box(parts, .24, .125, .022, m.rubber, -.32, 1.174, .405, { x: -.12 }, .02);
  box(parts, .166, .066, .007, m.lamp, -.32, 1.177, .388, { x: -.12 }, .012);
  for (const x of [.28, .38, .48]) cylinder(parts, .013, .022, m.steel, x, 1.136, .418, { x: Math.PI / 2 }, 12);
  cylinder(parts, .02, .27, m.black, -.32, 1.13, .39, { x: -Math.PI / 2 + .40 }, 16);
  const steering = new T.Group(); steering.name = 'Steering wheel'; steering.position.set(-.32, 1.18, .28); steering.rotation.x = -.27;
  const steeringParts = [];
  U.part(steeringParts, new T.TorusGeometry(.14, .014, low ? 4 : 6, low ? 12 : 20), m.rubber);
  cylinder(steeringParts, .047, .035, m.black, 0, 0, 0, { x: Math.PI / 2 }, 18);
  for (let spoke = 0; spoke < 3; spoke++) { const a = spoke * Math.PI * 2 / 3 - Math.PI / 2; beam(steeringParts, [0, 0, 0], [Math.cos(a) * .127, Math.sin(a) * .127, 0], .012, m.black); }
  batch(steering, steeringParts); root.add(steering);
  for (const x of [-.40, -.27]) box(parts, .055, .015, .13, m.steel, x, .52, .35, { x: -.3 }, .01);
  cylinder(parts, .009, .17, m.black, .075, .88, .10, { x: -.08 }, 12);
  ball(parts, .026, m.rubber, .075, .966, .095);
  batch(root, parts);
  const wheelSet = U.addWheels(root, [[-.78, .95], [.78, .95], [-.78, -.95], [.78, -.95]], .38, .28, true);
  const wheels = wheelSet.wheels;
  const radioMount = new T.Group(); radioMount.name = 'Dashboard radio anchor'; radioMount.position.set(0, 1.19, .63); radioMount.rotation.y = Math.PI; root.add(radioMount);
  root.userData.wheels = wheels;
  root.userData.syncVisuals = wheelSet.sync;
  root.userData.radioMount = radioMount;
  root.userData.steeringWheel = steering;
  root.userData.seatAnchors = [{ x: -.32, y: .87, z: -.10 }, { x: .32, y: .87, z: -.10 }];
  root.userData.setSteering = input => { steering.rotation.z = Math.max(-1, Math.min(1, input)) * -.65; };
  return U.finalize(root, 'utv');
}

function lodModel(options, factory, kind) {
  const T = options.THREE, root = new T.Group(), lod = new T.LOD();
  const near = factory({ ...options, detail: 'near' }), far = factory({ ...options, detail: 'far' });
  root.name = near.name; lod.addLevel(near, 0); lod.addLevel(far, options.lodDistance || 18, .10); root.add(lod);
  far.userData.beforeWheelSync = () => {
    far.userData.wheels.forEach((wheel, i) => wheel.rotation.copy(near.userData.wheels[i].rotation));
    if (far.userData.steeringWheel) far.userData.steeringWheel.rotation.copy(near.userData.steeringWheel.rotation);
  };
  root.userData.wheels = near.userData.wheels;
  root.userData.equipmentKind = kind;
  root.userData.visualLOD = lod;
  root.userData.lodLevels = { near, far };
  root.userData.syncVisuals = () => { near.userData.syncVisuals(); far.userData.syncVisuals(); };
  root.userData.inspect = () => ({ kind, near: near.userData.inspect(), far: far.userData.inspect(), lodDistance: options.lodDistance || 18 });
  root.userData.dispose = () => { near.userData.dispose(); far.userData.dispose(); };
  if (kind === 'scissor-lift') {
    // Crew attaches to this common moving deck anchor and survives an LOD switch.
    const plat = new T.Group(); plat.name = 'Shared crew platform anchor'; root.add(plat);
    const a = near.userData.liftBits, b = far.userData.liftBits;
    root.userData.liftBits = { ...a, plat,
      setHeight(height) {
        const h = a.setHeight(height); b.setHeight(h); plat.position.y = h;
        root.userData.liftBits.height = h; root.userData.liftBits.armRun = a.armRun; return h;
      },
      setGate(open) { a.setGate(open); b.setGate(open); },
    };
    root.userData.liftBits.setHeight(options.deckHeight || 1);
  } else {
    const anchor = new T.Group(); anchor.name = 'Shared dashboard radio anchor';
    anchor.position.copy(near.userData.radioMount.position); anchor.rotation.copy(near.userData.radioMount.rotation); root.add(anchor);
    root.userData.radioMount = anchor;
    root.userData.steeringWheel = near.userData.steeringWheel;
    root.userData.setSteering = input => { near.userData.setSteering(input); far.userData.setSteering(input); };
    root.userData.seatAnchors = near.userData.seatAnchors;
  }
  root.traverse(node => { node.userData.noBake = true; node.userData.equipmentKind = kind; });
  return root;
}

/** Recommended mobile-first factories: automatic 18m geometry LOD with shared GPU resources. */
export function createScissorLiftLod(options) { return lodModel(options, createScissorLiftModel, 'scissor-lift'); }
export function createUtvLod(options) { return lodModel(options, createUtvModel, 'utv'); }


