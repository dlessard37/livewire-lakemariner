/**
 * Authored industrial equipment for LIVE WIRE; no external model dependencies.
 * All equipment stands on Y=0. Cabinet / switchgear fronts point along local +X.
 * Pump shafts run along Z. Cabinet envelope: X depth, Y height, Z width.
 * Results contain indexed, per-material batches compatible with mergeStaticWorld.
 * Shared resources: do not dispose an individual returned clone's resources.
 * Call factory.dispose() only after every returned clone has left the scene.
 */
export function createIndustrialAssetFactory({ THREE, materials = {}, quality = 'balanced' }) {
  if (!THREE?.ExtrudeGeometry) throw new TypeError('A Three.js module is required');
  const detailed = quality !== 'balanced';
  const radial = detailed ? 24 : 16;
  const cache = new Map(), models = new Map(), owned = new Set(), baked = new Set();
  const m = {};
  function material(key, color, roughness, metalness) {
    const supplied = materials[key];
    if (supplied?.isMaterial) return supplied;
    const result = new THREE.MeshStandardMaterial({ color, roughness, metalness,
      envMapIntensity: 0.65, ...(supplied || {}) });
    owned.add(result);
    return result;
  }
  m.paint = material('industrialPaint', 0xc7cecd, 0.62, 0.22);
  m.steel = material('steel', 0xa5afb3, 0.34, 0.88);
  m.dark = material('rubber', 0x172025, 0.86, 0.04);
  m.blue = material('blueCover', 0x9daec9, 0.92, 0.01);
  m.yellow = material('safetyYellow', 0xd7b240, 0.63, 0.22);
  m.red = material('valveRed', 0xb62f25, 0.52, 0.24);
  m.motor = material('pumpPaint', 0x4b6d76, 0.62, 0.28);
  m.concrete = material('equipmentConcrete', 0x90968e, 0.94, 0);
  m.glass = material('meterGlass', 0x183a40, 0.2, 0.3);
  m.ivory = material('meterFace', 0xe7e7d7, 0.74, 0.05);
  // Paint and yellow markings share one PBR draw without losing their colors.
  m.paintPalette = m.paint.clone();
  m.paintPalette.color.setHex(0xffffff);
  m.paintPalette.vertexColors = true;
  owned.add(m.paintPalette);

  function indexed(geometry) {
    if (!geometry.index) {
      const n = geometry.attributes.position.count;
      geometry.setIndex(Array.from({ length: n }, (_, i) => i));
    }
    if (!geometry.attributes.uv) {
      geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
    }
    return geometry;
  }
  function geometry(key, build) {
    if (!cache.has(key)) cache.set(key, indexed(build()));
    return cache.get(key);
  }
  function bevelBox(x, y, z, radius = 0.01) {
    const r = Math.min(radius, x * 0.24, y * 0.24, z * 0.24);
    return geometry(`bevel:${x}:${y}:${z}:${r}`, () => {
      if (r < 0.001) return new THREE.BoxGeometry(x, y, z);
      const shape = new THREE.Shape();
      const hx = x / 2 - r, hy = y / 2 - r;
      shape.moveTo(-hx, -hy); shape.lineTo(hx, -hy); shape.lineTo(hx, hy);
      shape.lineTo(-hx, hy); shape.closePath();
      const result = new THREE.ExtrudeGeometry(shape, { depth: z - 2 * r,
        bevelEnabled: true, bevelThickness: r, bevelSize: r,
        bevelSegments: detailed ? 3 : 1, steps: 1, curveSegments: 1 });
      result.translate(0, 0, -(z - 2 * r) / 2);
      return result;
    });
  }
  function cylinder(radius, length, sides = radial) {
    return geometry(`cylinder:${radius}:${length}:${sides}`, () =>
      new THREE.CylinderGeometry(radius, radius, length, sides, 1));
  }
  const rotationFor = (axis, original = 'y') => original === 'y'
    ? axis === 'x' ? [0, 0, -Math.PI / 2] : axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0]
    : axis === 'x' ? [0, Math.PI / 2, 0] : axis === 'y' ? [Math.PI / 2, 0, 0] : [0, 0, 0];

  function batch(name) {
    const entries = new Map();
    function add(geo, mat, at = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
      const tint = (mat === m.paint || mat === m.yellow) ? mat.color : null;
      if (tint) mat = m.paintPalette;
      const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...at),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale));
      if (!entries.has(mat)) entries.set(mat, []);
      entries.get(mat).push({ geo, matrix, tint });
    }
    const builder = {
      add,
      box(x, y, z, at, mat = m.paint, radius = 0.01, rotation) {
        add(bevelBox(x, y, z, radius), mat, at, rotation);
      },
      cylinder(r, length, at, mat = m.steel, axis = 'y', sides = radial) {
        add(cylinder(r, length, sides), mat, at, rotationFor(axis));
      },
      torus(r, tube, at, mat = m.steel, axis = 'z') {
        add(geometry(`torus:${r}:${tube}`, () => new THREE.TorusGeometry(r, tube, detailed ? 8 : 5, radial)),
          mat, at, rotationFor(axis, 'z'));
      },
      tube(points, radius, at, mat = m.steel) {
        const key = `tube:${radius}:${JSON.stringify(points)}`;
        add(geometry(key, () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(
          points.map((p) => new THREE.Vector3(...p))), detailed ? Math.max(8, points.length * 4) : Math.max(6, points.length * 2), radius, detailed ? 8 : 4, false)), mat, at);
      },
      lathe(profile, at, mat, axis = 'y') {
        const key = `lathe:${JSON.stringify(profile)}`;
        add(geometry(key, () => new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(r, h)), radial)),
          mat, at, rotationFor(axis));
      },
      finish() {
        const group = new THREE.Group();
        group.name = name;
        group.userData.industrialAsset = true;
        for (const [mat, parts] of entries) {
          const vertexCount = parts.reduce((n, part) => n + part.geo.attributes.position.count, 0);
          const indexCount = parts.reduce((n, part) => n + part.geo.index.count, 0);
          const position = new Float32Array(vertexCount * 3), normal = new Float32Array(vertexCount * 3);
          const uv = new Float32Array(vertexCount * 2), indices = new Uint32Array(indexCount);
          const colors = mat.vertexColors ? new Float32Array(vertexCount * 3) : null;
          const p = new THREE.Vector3(), n = new THREE.Vector3(), normalMatrix = new THREE.Matrix3();
          let vertexOffset = 0, indexOffset = 0;
          for (const { geo, matrix, tint } of parts) {
            normalMatrix.getNormalMatrix(matrix);
            const a = geo.attributes;
            for (let i = 0; i < a.position.count; i++) {
              p.fromBufferAttribute(a.position, i).applyMatrix4(matrix);
              n.fromBufferAttribute(a.normal, i).applyMatrix3(normalMatrix).normalize();
              p.toArray(position, (vertexOffset + i) * 3);
              n.toArray(normal, (vertexOffset + i) * 3);
              uv[(vertexOffset + i) * 2] = a.uv.getX(i);
              uv[(vertexOffset + i) * 2 + 1] = a.uv.getY(i);
              if (colors) (tint || mat.color).toArray(colors, (vertexOffset + i) * 3);
            }
            for (let i = 0; i < geo.index.count; i++) indices[indexOffset + i] = geo.index.getX(i) + vertexOffset;
            vertexOffset += a.position.count; indexOffset += geo.index.count;
          }
          const result = new THREE.BufferGeometry();
          result.setAttribute('position', new THREE.BufferAttribute(position, 3));
          result.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
          result.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
          if (colors) result.setAttribute('color', new THREE.BufferAttribute(colors, 3));
          result.setIndex(new THREE.BufferAttribute(indices, 1));
          result.computeBoundingBox(); result.computeBoundingSphere(); baked.add(result);
          const mesh = new THREE.Mesh(result, mat);
          mesh.name = `${name} / ${Object.keys(m).find((key) => m[key] === mat) || 'material'}`;
          mesh.castShadow = true; mesh.receiveShadow = true;
          group.add(mesh);
        }
        return group;
      },
    };
    return builder;
  }
  function memo(key, build) {
    if (!models.has(key)) models.set(key, build());
    return models.get(key).clone(true);
  }
  function bolt(b, at, axis = 'x', radius = 0.009) {
    if (detailed) b.cylinder(radius * 1.35, radius * 0.3, at, m.steel, axis, 12);
    b.cylinder(radius, radius * 0.8, at, m.steel, axis, 6);
  }
  function hinges(b, x, y, z, height) {
    for (const dy of [-height * 0.34, height * 0.34]) {
      if (detailed) b.box(0.013, 0.1, 0.045, [x - 0.006, y + dy, z], m.steel, 0.003);
      b.cylinder(0.012, 0.13, [x, y + dy, z], m.steel, 'y', detailed ? radial : 6);
    }
  }
  function handle(b, x, y, z, length = 0.16) {
    b.box(0.012, length + 0.065, 0.053, [x - 0.017, y, z], m.dark, detailed ? 0.006 : 0);
    b.tube([[0, -length / 2, 0], [0.022, -length * 0.32, 0],
      [0.022, length * 0.32, 0], [0, length / 2, 0]], 0.011, [x - 0.018, y, z], m.dark);
  }
  function louvers(b, x, y, z, width, height, count = 7) {
    b.box(0.01, height, width, [x - 0.013, y, z], m.dark, 0.003);
    for (let i = 0; i < count; i++) {
      b.box(0.026, height / count * 0.58, width - 0.028,
        [x, y - height / 2 + (i + 0.5) * height / count, z], m.paint, 0.003, [0, 0, -0.38]);
    }
  }
  function paddedCover(b, x, y, z, height = 0.88, width = 0.82) {
    const geo = geometry(`cover:${height}:${width}`, () => {
      const result = bevelBox(0.045, height, width, 0.018).clone();
      const positions = result.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        if (positions.getX(i) > 0) {
          const bulge = 0.006 * Math.max(0, 1 - (positions.getY(i) / (height / 2)) ** 2)
            * Math.max(0, 1 - (positions.getZ(i) / (width / 2)) ** 2);
          positions.setX(i, positions.getX(i) + bulge);
        }
      }
      result.computeVertexNormals();
      return result;
    });
    b.add(geo, m.blue, [x, y, z]);
    // Rolled fabric edge, with shallow attachment buttons; no image on a box.
    if (detailed) b.tube([[0, -height / 2 + 0.025, -width / 2 + 0.025],
      [0, height / 2 - 0.025, -width / 2 + 0.025],
      [0, height / 2 - 0.025, width / 2 - 0.025]], 0.005, [x + 0.018, y, z], m.blue);
    for (const dz of [-width * 0.44, width * 0.44]) {
      bolt(b, [x + 0.024, y + height * 0.43, z + dz], 'x', 0.006);
    }
  }
  function caution(b, x, y, z, size = 0.065) {
    const triangle = geometry(`warning:${size}`, () => {
      const shape = new THREE.Shape();
      shape.moveTo(0, size * 0.5); shape.lineTo(-size * 0.45, -size * 0.35);
      shape.lineTo(size * 0.45, -size * 0.35); shape.closePath();
      return new THREE.ShapeGeometry(shape);
    });
    b.add(triangle, m.yellow, [x, y, z], [0, Math.PI / 2, 0]);
    b.box(0.001, size * 0.25, size * 0.05, [x + 0.001, y, z], m.dark, 0);
    b.box(0.001, size * 0.06, size * 0.06, [x + 0.001, y - size * 0.21, z], m.dark, 0);
  }

  function coolingCabinet({ kind = 0, width = 2.22, height = 6.15, depth = 1.05, lod = 'near' } = {}) {
    if (!(width > 0 && height > 0 && depth > 0)) throw new RangeError('Cabinet dimensions must be positive');
    if (!['near', 'far'].includes(lod)) throw new RangeError('Cabinet LOD must be near or far');
    const key = `cabinet:${kind}:${width}:${height}:${depth}:${lod}`;
    return memo(key, () => {
      const b = batch(`Cooling cabinet ${kind}`), f = depth / 2;
      const sy = height / 6.15, sz = width / 2.22;
      if (lod === 'far') {
        b.box(depth - 0.06, height - 0.05, width - 0.03, [-0.02, height / 2 + 0.025, 0], m.steel, 0);
        b.box(0.025, height - 0.16, width - 0.1, [f - 0.035, height / 2, 0], m.paint, 0);
        for (const z of [-width / 2 + 0.035, width / 2 - 0.035]) {
          b.box(0.06, height, 0.06, [f - 0.034, height / 2, z], m.steel, 0);
          b.box(depth * 0.9, 0.03, 0.1, [0, 0.015, z - Math.sign(z) * 0.025], m.steel, 0);
        }
        const rows = kind === 3 ? [] : kind === 1 ? [4.55, 5.55] : [1.2, 2.45, 3.7];
        const cols = kind === 1 ? [0.42] : [-0.48, 0.48];
        for (const y of rows) for (const z of cols) {
          b.box(0.035, 0.88 * sy, 0.79 * sz, [f - 0.025, y * sy, z * sz], m.blue, 0);
          b.box(0.018, 0.16 * sy, 0.04, [f - 0.015, y * sy, z * sz + 0.43 * sz], m.dark, 0);
        }
        for (const y of [0.58, 1.825, 3.075, 4.325, 6.02]) {
          b.box(0.015, 0.016, width - 0.13, [f - 0.017, y * sy, 0], m.steel, 0);
        }
        if (kind === 1) b.box(0.018, 2.15 * sy, 0.78 * sz, [f - 0.01, 1.45 * sy, -0.32 * sz], m.paint, 0);
        for (const z of kind === 3 ? [] : [-0.19, 0.16]) {
          b.cylinder(0.018, height - 0.36, [f - 0.022, height / 2, z * sz], m.yellow, 'y', 4);
        }
        const result = b.finish();
        result.userData.dimensions = { width, height, depth };
        result.userData.kind = kind; result.userData.lod = lod;
        return result;
      }
      // Return folded steel shell, not a single featureless cuboid.
      b.box(depth - 0.11, height - 0.12, width - 0.07, [-0.035, height / 2 + 0.01, 0], m.steel, 0.025);
      b.box(0.017, height - 0.24, width - 0.13, [f - 0.078, height / 2, 0], m.dark, 0.005);
      for (const z of [-width / 2 + 0.032, width / 2 - 0.032]) {
        b.box(0.065, height - 0.05, 0.065, [f - 0.041, height / 2 + 0.025, z], m.steel, 0.006);
        b.box(depth * 0.9, 0.035, 0.13, [0, 0.0175, z - Math.sign(z) * 0.038], m.steel, 0.008);
        for (const x of [-depth * 0.33, depth * 0.33]) bolt(b, [x, 0.041, z - Math.sign(z) * 0.038], 'y', 0.011);
      }
      for (const y of [0.12, height - 0.08]) b.box(0.055, 0.065, width - 0.09, [f - 0.04, y, 0], m.steel, 0.006);
      function door(y, h, z, w, withHandle = true) {
        b.box(0.035, h, w, [f - 0.053, y, z], m.paint, 0.011);
        hinges(b, f - 0.022, y, z - w / 2 + 0.02, h);
        if (withHandle) handle(b, f - 0.025, y, z + w / 2 - 0.07);
      }
      if (kind === 3) {
        door(height * 0.27, height * 0.48, 0, width - 0.15);
        door(height * 0.755, height * 0.46, 0, width - 0.15);
      } else if (kind === 1) {
        door(1.45 * sy, 2.15 * sy, -0.32 * sz, 0.78 * sz);
        door(1.35 * sy, 0.92 * sy, 0.58 * sz, 0.46 * sz);
        for (const y of [4.55, 5.55]) {
          door(y * sy, 0.95 * sy, 0.42 * sz, 0.91 * sz, false);
          paddedCover(b, f - 0.036, y * sy, 0.42 * sz, 0.88 * sy, 0.82 * sz);
        }
        door(4.3 * sy, 3.4 * sy, -0.54 * sz, 0.85 * sz);
      } else {
        for (const y of [1.2, 2.45, 3.7]) {
          for (const z of [-0.48, 0.48]) {
            door(y * sy, 1.2 * sy, z * sz, 0.93 * sz);
            paddedCover(b, f - 0.036, y * sy, z * sz, 0.88 * sy, 0.79 * sz);
          }
        }
        for (const z of [-0.48, 0.48]) door(5.19 * sy, 1.7 * sy, z * sz, 0.93 * sz);
      }
      louvers(b, f - 0.025, 0.36 * sy, 0, width * 0.75, 0.18 * sy, 5);
      for (const z of kind === 3 ? [] : [-0.19, 0.16]) {
        b.cylinder(0.018, height - 0.36, [f - 0.022, height / 2, z * sz], m.yellow, 'y', detailed ? 12 : 8);
        for (const y of [1.35, 3.05, 4.75]) {
          b.box(0.039, 0.025, 0.075, [f - 0.026, y * sy, z * sz], m.steel, 0.004);
        }
      }
      caution(b, f - 0.032, 0.65 * sy, width * 0.36, 0.065);
      const group = b.finish();
      group.userData.dimensions = { width, height, depth };
      group.userData.kind = kind;
      group.userData.lod = lod;
      return group;
    });
  }

  function switchgear({ width = 1.2, height = 2.2, depth = 0.65, bays = 1,
    sections = Math.max(1, Math.ceil(height / 2.6)), wallMounted = false } = {}) {
    if (!(width > 0 && height > 0 && depth > 0 && Number.isInteger(bays) && bays >= 1
      && Number.isInteger(sections) && sections >= 1)) throw new RangeError('Invalid switchgear dimensions');
    const key = `switchgear:${width}:${height}:${depth}:${bays}:${sections}:${wallMounted}`;
    return memo(key, () => {
      const b = batch('Electrical switchgear'), f = depth / 2, base = wallMounted ? 0 : height * 0.065;
      b.box(depth * 0.94, height - base, width, [-depth * 0.02, base + (height - base) / 2, 0], m.steel, Math.min(0.02, depth * 0.04));
      if (!wallMounted) {
        b.box(depth, base * 0.64, width, [0, base * 0.32, 0], m.concrete, 0.018);
        for (const z of [-width * 0.4, width * 0.4]) b.box(depth * 0.85, base * 0.36, 0.075, [0, base * 0.82, z], m.dark, 0.005);
      }
      const bayW = width / bays;
      for (let k = 0; k < bays; k++) for (let row = 0; row < sections; row++) {
        const z = (k - (bays - 1) / 2) * bayW;
        const rowH = (height - base) / sections, rowBase = base + rowH * row;
        const h = rowH * 0.96, y = rowBase + rowH / 2;
        b.box(0.02, h + 0.018, bayW - 0.025, [f - 0.045, y, z], m.dark, 0.006);
        b.box(0.035, h, bayW - 0.044, [f - 0.024, y, z], m.paint, 0.012);
        hinges(b, f + 0.003, y, z - bayW / 2 + 0.04, h);
        handle(b, f + 0.013, y - h * 0.05, z + bayW * 0.34, Math.min(0.26, h * 0.2));
        const meterY = rowBase + h * 0.82, meterW = Math.min(0.19, bayW * 0.3);
        b.box(0.018, h * 0.09, meterW, [f + 0.005, meterY, z - bayW * 0.14], m.dark, 0.007);
        b.box(0.004, h * 0.065, meterW * 0.82, [f + 0.016, meterY, z - bayW * 0.14], m.glass, 0.002);
        for (const dz of [-0.04, 0.04]) {
          b.cylinder(Math.min(0.019, bayW * 0.04), 0.018, [f + 0.012, meterY - h * 0.1, z + dz], dz < 0 ? m.red : m.dark, 'x', 12);
        }
        const rotaryY = rowBase + h * 0.56;
        b.cylinder(Math.min(0.068, bayW * 0.12), 0.02, [f + 0.01, rotaryY, z], m.dark, 'x');
        b.box(0.035, 0.09, 0.025, [f + 0.029, rotaryY + 0.02, z], m.red, 0.006, [0.15, 0, 0]);
        louvers(b, f + 0.002, rowBase + h * 0.16, z, bayW * 0.7, h * 0.13, detailed ? 8 : 6);
        caution(b, f + 0.016, rowBase + h * 0.38, z, Math.min(0.1, bayW * 0.16));
        for (const dy of [-h * 0.46, h * 0.46]) {
          for (const dz of [-bayW * 0.42, bayW * 0.42]) bolt(b, [f + 0.004, y + dy, z + dz], 'x', 0.006);
        }
      }
      const group = b.finish(); group.userData.dimensions = { width, height, depth, bays, sections };
      return group;
    });
  }

  function pumpAssembly({ scale = 1, withValve = true } = {}) {
    if (!(scale > 0)) throw new RangeError('Pump scale must be positive');
    const group = memo(`pump:${withValve}`, () => {
      const b = batch('Pump, motor and valve assembly');
      b.box(0.94, 0.1, 2.18, [0, 0.05, 0], m.concrete, 0.025);
      for (const x of [-0.29, 0.29]) {
        // Formed channel rails: bottom flange, web and upper flange.
        b.box(0.15, 0.018, 1.95, [x, 0.119, 0], m.steel, 0.003);
        b.box(0.022, 0.09, 1.95, [x - 0.04, 0.165, 0], m.steel, 0.003);
        b.box(0.15, 0.018, 1.95, [x, 0.211, 0], m.steel, 0.003);
        for (const z of [-0.88, 0.88]) bolt(b, [x + 0.035, 0.135, z], 'y', 0.015);
      }
      for (const z of [-0.5, 0.36, 0.77]) {
        b.box(0.65, 0.065, 0.16, [0, 0.252, z], m.motor, 0.012);
        for (const x of [-0.25, 0.25]) bolt(b, [x, 0.295, z], 'y', 0.014);
      }
      const axisY = 0.62;
      // A curved cast volute with bolted flanges, rather than a box pump body.
      b.lathe([[0.06, -0.17], [0.2, -0.17], [0.29, -0.11], [0.32, -0.015],
        [0.29, 0.11], [0.16, 0.17], [0.07, 0.17]], [0, axisY, -0.49], m.motor, 'z');
      b.cylinder(0.295, 0.035, [0, axisY, -0.64], m.steel, 'z');
      b.cylinder(0.26, 0.027, [0, axisY, -0.666], m.motor, 'z');
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * Math.PI * 2;
        bolt(b, [Math.sin(a) * 0.278, axisY + Math.cos(a) * 0.278, -0.665], 'z', 0.013);
      }
      b.cylinder(0.074, 0.31, [0, axisY, -0.92], m.motor, 'z');
      flange(b, [0, axisY, -1.055], 'z', 0.13, 0.054);
      b.cylinder(0.061, 0.34, [0, axisY, -0.165], m.steel, 'z');
      b.cylinder(0.095, 0.14, [0, axisY, -0.09], m.dark, 'z');
      // Rounded motor endbells and real radial cooling fins along the shaft.
      b.lathe([[0, -0.43], [0.115, -0.43], [0.18, -0.37], [0.188, -0.24],
        [0.188, 0.31], [0.17, 0.4], [0.08, 0.43], [0, 0.43]], [0, axisY, 0.49], m.motor, 'z');
      const fins = detailed ? 20 : 14;
      for (let i = 0; i < fins; i++) {
        const a = i / fins * Math.PI * 2;
        b.box(0.013, 0.075, 0.59, [Math.sin(a) * 0.206, axisY + Math.cos(a) * 0.206, 0.46],
          m.motor, 0.003, [0, 0, -a]);
      }
      b.cylinder(0.204, 0.06, [0, axisY, 0.87], m.dark, 'z');
      b.torus(0.184, 0.018, [0, axisY, 0.906], m.motor);
      for (const dx of [-0.12, -0.08, -0.04, 0, 0.04, 0.08, 0.12]) {
        const length = 2 * Math.sqrt(0.166 ** 2 - dx ** 2);
        b.box(0.009, length, 0.018, [dx, axisY, 0.912], m.motor, 0.003);
      }
      b.box(0.26, 0.16, 0.26, [0, axisY + 0.25, 0.38], m.motor, 0.02);
      b.box(0.28, 0.021, 0.28, [0, axisY + 0.34, 0.38], m.steel, 0.008);
      b.tube([[0, 0, 0], [0.14, -0.01, 0], [0.19, -0.12, 0.12], [0.2, -0.27, 0.2]],
        0.021, [0.12, axisY + 0.25, 0.38], m.dark);
      b.tube([[0, 0, 0], [0.12, 0.12, 0], [0.12, 0.36, 0]], 0.06, [0.12, axisY + 0.16, -0.49], m.motor);
      flange(b, [0.24, 1.09, -0.49], 'y', 0.112, 0.045);
      if (withValve) {
        b.lathe([[0.055, -0.13], [0.055, -0.085], [0.096, -0.04], [0.11, 0.035],
          [0.075, 0.085], [0.054, 0.13]], [0.24, 1.235, -0.49], m.red);
        flange(b, [0.24, 1.365, -0.49], 'y', 0.112, 0.045);
        b.cylinder(0.025, 0.21, [0.24, 1.455, -0.49], m.steel);
        b.torus(0.135, 0.016, [0.24, 1.56, -0.49], m.red, 'y');
        b.cylinder(0.032, 0.027, [0.24, 1.56, -0.49], m.steel, 'y', 6);
        for (let i = 0; i < 3; i++) {
          const a = i / 3 * Math.PI * 2;
          b.box(0.016, 0.015, 0.125, [0.24 + Math.sin(a) * 0.063, 1.56, -0.49 + Math.cos(a) * 0.063],
            m.red, 0.004, [0, a, 0]);
        }
      }
      const result = b.finish(); result.userData.withValve = withValve; return result;
    });
    group.scale.setScalar(scale);
    return group;
  }
  function flange(b, at, axis, radius, thickness) {
    b.cylinder(radius, thickness, at, m.steel, axis);
    b.cylinder(radius * 0.83, thickness + 0.012, at, m.dark, axis);
    b.cylinder(radius * 0.8, thickness + 0.018, at, m.motor, axis);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2, point = [...at];
      if (axis === 'y') { point[0] += Math.sin(a) * radius * 0.86; point[2] += Math.cos(a) * radius * 0.86; point[1] += thickness * 0.58; }
      else { point[0] += Math.sin(a) * radius * 0.86; point[1] += Math.cos(a) * radius * 0.86; point[2] -= thickness * 0.58; }
      bolt(b, point, axis, 0.012);
    }
  }
  // Pack repeated equipment by variant/LOD, avoiding 4 draws for every cabinet.
  // Update all transforms/counts, then call commit() once to refresh culling bounds.
  function createInstances({ type = 'coolingCabinet', options = {}, transforms = [], capacity = transforms.length } = {}) {
    const builders = { coolingCabinet, switchgear, pumpAssembly };
    if (!builders[type]) throw new RangeError('Unknown industrial asset type');
    if (!Number.isInteger(capacity) || capacity < transforms.length || capacity < 0) throw new RangeError('Invalid instance capacity');
    const template = builders[type](options);
    template.updateMatrix();
    const group = new THREE.Group();
    group.name = `${template.name} instances`;
    group.userData.noBake = true;
    group.userData.industrialAsset = true;
    const meshes = template.children.map((source) => {
      const mesh = new THREE.InstancedMesh(source.geometry, source.material, Math.max(1, capacity));
      mesh.name = source.name;
      mesh.count = transforms.length;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = detailed;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    });
    const combined = new THREE.Matrix4();
    function setTransform(index, value) {
      if (!Number.isInteger(index) || index < 0 || index >= capacity) throw new RangeError('Instance index outside capacity');
      const matrix = value?.isMatrix4 ? value : new THREE.Matrix4().compose(
        new THREE.Vector3(...(value?.position || [0, 0, 0])),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...(value?.rotation || [0, 0, 0]))),
        Array.isArray(value?.scale) ? new THREE.Vector3(...value.scale) : new THREE.Vector3().setScalar(value?.scale ?? 1));
      combined.multiplyMatrices(matrix, template.matrix);
      for (const mesh of meshes) mesh.setMatrixAt(index, combined);
    }
    function commit() {
      for (const mesh of meshes) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingBox(); mesh.computeBoundingSphere();
      }
    }
    transforms.forEach(setTransformValue);
    function setTransformValue(value, index) { setTransform(index, value); }
    commit();
    return { group, capacity, setTransform, commit,
      setCount(count) {
        if (!Number.isInteger(count) || count < 0 || count > capacity) throw new RangeError('Instance count outside capacity');
        for (const mesh of meshes) mesh.count = count;
      },
    };
  }
  return {
    coolingCabinet, switchgear, pumpAssembly, createInstances, materials: m,
    stats: () => ({ cachedGeometry: cache.size, modelVariants: models.size, batchGeometry: baked.size, quality }),
    dispose() {
      for (const g of cache.values()) g.dispose();
      for (const g of baked) g.dispose();
      for (const mat of owned) mat.dispose();
      cache.clear(); baked.clear(); models.clear(); owned.clear();
    },
  };
}
