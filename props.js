/* ==================================================================
   PROPS — the "make it feel like the photos" dressing pass.

   Called from game.js as buildExtraDressing(ctx) after the shell is
   up. Everything in here is static Lambert scenery: it all collapses
   into the merged world mesh (one draw call), so pile it on. Nothing
   here animates, nothing gets tagged noBake.

   ctx: { THREE, scene, mats, mat, boxMesh, placeBox, addCollider,
          CB, podBand, makeLabel }
   ================================================================== */

export function buildExtraDressing(ctx) {
  const { THREE, scene, mats, mat, boxMesh, placeBox, addCollider, CB, podBand, makeLabel, getTraveler } = ctx;

  /* deterministic jitter — the layout must not drift between loads,
     saves re-resolve against the same world */
  let seed = 20260820;
  const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  const jit = (a) => (rnd() - 0.5) * 2 * a;

  /* palette — flat Lambert only, all of it merges for free */
  const greenlee = mat(0x1e5c34); // Greenlee gang boxes
  const greenleeLid = mat(0x17492a);
  const dumpGreen = mat(0x2d6b3c); // O'Connell dumpsters
  const dumpDark = mat(0x224f2c);
  const barrelBlue = mat(0x2a5c8a); // water barrels
  const barrelLid = mat(0x9aa4ac);
  const louOrange = mat(0xe85d04); // Louisville fiberglass
  const tapeRed = mat(0xd42a1e); // PELIGRO / DANGER
  const cordOrange = mat(0xff8a3a); // temp-power cords / feeder orange
  const fdYellow = mat(0xd8c22a); // feeder yellow
  const fdGray = mat(0x8a8a92); // feeder gray
  const ply = mat(0xb59a68); // spool flange plywood
  const cardboard = mat(0xb8935a);
  const deckGray = mat(0x8f979e);
  const deckLight = mat(0xaab2b8);
  const portaGreen = mat(0x3d8a4a);
  const portaLight = mat(0x57a862);

  const cyl = (r1, r2, h, seg, m) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m);

  function cone(x, z) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 8), mats.orange);
    c.position.set(x, 0.35, z);
    scene.add(c);
    return c;
  }

  /* ---------------- prop builders ---------------- */

  /* wire reel on a stand — two uprights, axle, spool between */
  function reelStand(x, z, yaw) {
    const g = new THREE.Group();
    for (const lx of [-0.6, 0.6]) {
      const leg = boxMesh(0.1, 1.0, 0.55, mats.beam);
      leg.position.set(lx, 0.5, 0);
      g.add(leg);
    }
    const axle = cyl(0.035, 0.035, 1.5, 6, mats.dark);
    axle.rotation.z = Math.PI / 2;
    axle.position.y = 0.95;
    g.add(axle);
    const spool = cyl(0.4, 0.4, 0.55, 10, mats.dark);
    spool.rotation.z = Math.PI / 2;
    spool.position.y = 0.95;
    g.add(spool);
    for (const fx of [-0.3, 0.3]) {
      const fl = cyl(0.5, 0.5, 0.045, 12, ply);
      fl.rotation.z = Math.PI / 2;
      fl.position.set(fx, 0.95, 0);
      g.add(fl);
    }
    g.position.set(x, 0, z);
    g.rotation.y = yaw || 0;
    scene.add(g);
    addCollider(x, z, 1.5, 0.9, 0, 1.1);
  }

  /* full spool standing on its flange rims */
  function standingSpool(x, z, yaw) {
    const g = new THREE.Group();
    const core = cyl(0.3, 0.3, 0.6, 10, mats.dark);
    core.rotation.x = Math.PI / 2;
    core.position.y = 0.55;
    g.add(core);
    for (const fz of [-0.33, 0.33]) {
      const fl = cyl(0.55, 0.55, 0.05, 12, ply);
      fl.rotation.x = Math.PI / 2;
      fl.position.set(0, 0.55, fz);
      g.add(fl);
    }
    g.position.set(x, 0, z);
    g.rotation.y = yaw || 0;
    scene.add(g);
    addCollider(x, z, 1.1, 1.0, 0, 1.1);
  }

  function gangBox(x, z, yaw) {
    const g = new THREE.Group();
    const body = boxMesh(1.2, 0.7, 0.6, greenlee);
    body.position.y = 0.35;
    g.add(body);
    const lid = boxMesh(1.24, 0.07, 0.64, greenleeLid);
    lid.position.y = 0.73;
    g.add(lid);
    g.position.set(x, 0, z);
    g.rotation.y = yaw || 0;
    scene.add(g);
    addCollider(x, z, 1.35, 0.8, 0, 0.8);
  }

  function dumpster(x, z, yaw) {
    const g = new THREE.Group();
    const body = boxMesh(2.2, 1.2, 1.2, dumpGreen);
    body.position.y = 0.6;
    g.add(body);
    const rim = boxMesh(2.28, 0.07, 1.26, dumpDark);
    rim.position.y = 1.22;
    g.add(rim);
    const pocket = boxMesh(0.5, 0.25, 0.08, mats.dark);
    pocket.position.set(0, 0.35, 0.62);
    g.add(pocket);
    g.position.set(x, 0, z);
    g.rotation.y = yaw || 0;
    scene.add(g);
    addCollider(x, z, 2.35, 1.35, 0, 1.3);
  }

  /* pallet + whatever the material buggy dropped on it */
  function palletLoad(x, z, yaw, kind) {
    const g = new THREE.Group();
    for (const sx of [-0.52, 0, 0.52]) {
      const st = boxMesh(0.1, 0.1, 1.0, mats.wood);
      st.position.set(sx, 0.05, 0);
      g.add(st);
    }
    const deck = boxMesh(1.2, 0.06, 1.0, mats.wood);
    deck.position.y = 0.13;
    g.add(deck);
    if (kind === "coil") {
      const coil = cyl(0.42, 0.46, 0.5, 10, mats.dark);
      coil.position.y = 0.41;
      g.add(coil);
      const top = cyl(0.44, 0.44, 0.04, 10, ply);
      top.position.y = 0.68;
      g.add(top);
    } else if (kind === "kegs") {
      for (const kx of [-0.28, 0.28]) {
        const keg = cyl(0.22, 0.22, 0.5, 8, fdGray);
        keg.position.set(kx, 0.41, 0);
        g.add(keg);
      }
    } else {
      // cardboard — device boxes, strap-banded
      const b1 = boxMesh(0.9, 0.4, 0.8, cardboard);
      b1.position.y = 0.36;
      g.add(b1);
      const b2 = boxMesh(0.7, 0.35, 0.6, cardboard);
      b2.position.set(0.05, 0.74, -0.04);
      g.add(b2);
      const b3 = boxMesh(0.4, 0.3, 0.45, cardboard);
      b3.position.set(-0.15, 1.06, 0.1);
      g.add(b3);
    }
    g.position.set(x, 0, z);
    g.rotation.y = yaw || 0;
    scene.add(g);
    addCollider(x, z, 1.35, 1.15, 0, 1.0);
  }

  /* feeder-bundle drop — coil on the floor, risers sweeping up the wall
     toward the tray. leanSign tips the tops toward the wall. */
  const fdMats = [fdYellow, cordOrange, fdGray];
  function feederDrop(x, z, k, leanSign) {
    if (k % 2 === 0) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.11, 6, 12), fdMats[k % 3]);
      coil.rotation.x = -Math.PI / 2;
      coil.position.set(x, 0.12, z);
      scene.add(coil);
    } else {
      const coil = cyl(0.52, 0.55, 0.13, 12, fdMats[k % 3]);
      coil.position.set(x, 0.07, z);
      scene.add(coil);
    }
    const n = 5 + (k % 3);
    for (let i = 0; i < n; i++) {
      const h = 3 + rnd() * 2;
      const r = 0.03 + rnd() * 0.02;
      const c = cyl(r, r, h, 5, fdMats[(k + i) % 3]);
      c.position.set(x + jit(0.28), h / 2, z + jit(0.4));
      c.rotation.z = leanSign * (0.04 + rnd() * 0.05);
      c.rotation.x = jit(0.05);
      scene.add(c);
    }
  }

  /* overhead cable tray segment along z, hung on rods off the deck */
  function traySegment(x, zMid, len, y = 6.5) {
    placeBox(x, y, zMid, 0.5, 0.1, len, mats.beam, false);
    for (const dz of [-len * 0.4, len * 0.4]) {
      placeBox(x, y + 0.1, zMid + dz, 0.05, 1.45, 0.05, mats.beam, false);
    }
  }

  /* wire cart — spool rack on casters, cones riding on the deck */
  function wireCart(x, z, yaw) {
    const g = new THREE.Group();
    const plat = boxMesh(1.0, 0.1, 0.5, mats.dark);
    plat.position.y = 0.34;
    g.add(plat);
    for (const [px, pz] of [[-0.4, 0.18], [0.4, 0.18], [-0.4, -0.18], [0.4, -0.18]]) {
      const cs = cyl(0.07, 0.07, 0.05, 8, mats.dark);
      cs.rotation.z = Math.PI / 2;
      cs.position.set(px, 0.08, pz);
      g.add(cs);
    }
    for (const fx of [-0.48, 0.48]) {
      const fr = boxMesh(0.05, 0.75, 0.5, mats.beam);
      fr.position.set(fx, 0.76, 0);
      g.add(fr);
    }
    const axle = cyl(0.03, 0.03, 1.06, 6, mats.dark);
    axle.rotation.z = Math.PI / 2;
    axle.position.y = 1.0;
    g.add(axle);
    for (const sx of [-0.2, 0, 0.2]) {
      const sp = cyl(0.2, 0.2, 0.09, 10, ply);
      sp.rotation.z = Math.PI / 2;
      sp.position.set(sx, 1.0, 0);
      g.add(sp);
    }
    for (const cz of [0.12, -0.12]) {
      const cn = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.42, 8), mats.orange);
      cn.position.set(-0.32 + (cz > 0 ? 0.64 : 0), 0.6, cz);
      g.add(cn);
    }
    g.position.set(x, 0, z);
    g.rotation.y = yaw;
    scene.add(g);
    addCollider(x, z, 0.7, 1.1, 0, 1.2);
  }

  /* temp-power post — wood 4x4, gray boxes, orange cord drooping off */
  function tempPost(x, z, faceSign) {
    const post = boxMesh(0.12, 2.2, 0.12, mats.wood);
    post.position.set(x, 1.1, z);
    scene.add(post);
    for (let i = 0; i < 3; i++) {
      const b = boxMesh(0.18, 0.28, 0.14, fdGray);
      b.position.set(x + faceSign * 0.13, 1.0 + i * 0.38, z);
      scene.add(b);
    }
    for (let i = 0; i < 4; i++) {
      const seg = boxMesh(0.05, 0.05, 0.55, cordOrange);
      seg.position.set(x + faceSign * 0.1, 1.95 - i * 0.44, z + 0.3 + i * 0.42);
      seg.rotation.x = 0.6;
      scene.add(seg);
    }
    addCollider(x, z, 0.3, 0.3, 0, 2.2);
  }

  /* red DANGER tape between two posts */
  function tapeRun(x1, z1, x2, z2) {
    for (const [px, pz] of [[x1, z1], [x2, z2]]) {
      const p = boxMesh(0.06, 1.1, 0.06, mats.dark);
      p.position.set(px, 0.55, pz);
      scene.add(p);
    }
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const strip = boxMesh(len, 0.14, 0.02, tapeRed);
    strip.position.set((x1 + x2) / 2, 0.95, (z1 + z2) / 2);
    strip.rotation.y = Math.atan2(-dz, dx);
    scene.add(strip);
  }

  /* full tape square (posts + 4 strips) around a hot laydown zone */
  function tapeSquare(cx, cz, hw, hd) {
    for (const [px, pz] of [[cx - hw, cz - hd], [cx + hw, cz - hd], [cx + hw, cz + hd], [cx - hw, cz + hd]]) {
      const p = boxMesh(0.06, 1.1, 0.06, mats.dark);
      p.position.set(px, 0.55, pz);
      scene.add(p);
    }
    for (const sz of [cz - hd, cz + hd]) {
      const s = boxMesh(hw * 2, 0.14, 0.02, tapeRed);
      s.position.set(cx, 0.95, sz);
      scene.add(s);
    }
    for (const sx of [cx - hw, cx + hw]) {
      const s = boxMesh(0.02, 0.14, hd * 2, tapeRed);
      s.position.set(sx, 0.95, cz);
      scene.add(s);
    }
  }

  function barrelPair(x, z) {
    for (const [bx, bz] of [[x, z], [x + 0.72, z + 0.34]]) {
      const b = cyl(0.3, 0.3, 0.9, 10, barrelBlue);
      b.position.set(bx, 0.45, bz);
      scene.add(b);
      const lid = cyl(0.31, 0.31, 0.04, 10, barrelLid);
      lid.position.set(bx, 0.92, bz);
      scene.add(lid);
    }
    addCollider(x + 0.36, z + 0.17, 1.5, 1.0, 0, 0.95);
  }

  /* Louisville step ladder — two panels leaning into an A */
  function stepLadder(x, z, yaw) {
    const g = new THREE.Group();
    const tilt = 0.21;
    for (const s of [-1, 1]) {
      const panel = boxMesh(0.62, 1.95, 0.07, louOrange);
      panel.position.set(0, 0.95, s * 0.2);
      panel.rotation.x = s * tilt;
      g.add(panel);
    }
    const cap = boxMesh(0.62, 0.07, 0.3, louOrange);
    cap.position.y = 1.9;
    g.add(cap);
    g.position.set(x, 0, z);
    g.rotation.y = yaw || 0;
    scene.add(g);
  }

  /* conduit sticks racked in a pyramid on dunnage */
  function conduitStack(x, z) {
    for (const sx of [-0.9, 0.9]) {
      const sl = boxMesh(0.15, 0.15, 1.4, mats.wood);
      sl.position.set(x + sx, 0.08, z);
      scene.add(sl);
    }
    const rows = [[5, 0.26], [4, 0.36], [3, 0.46]];
    let n = 0;
    for (const [count, y] of rows) {
      for (let i = 0; i < count; i++) {
        const c = cyl(0.045, 0.045, 3.0, 6, n % 3 === 2 ? (getTraveler() === "tremont" ? mats.emt : mats.redFA) : mats.copper);
        c.rotation.z = Math.PI / 2;
        c.position.set(x, y, z - (count - 1) * 0.055 + i * 0.11);
        scene.add(c);
        n++;
      }
    }
    addCollider(x, z, 3.3, 1.2, 0, 0.7);
  }

  function portaJohn(x, z, yaw) {
    const body = placeBox(x, 0, z, 1.2, 2.3, 1.2, portaGreen, true);
    body.rotation.y = yaw || 0;
    const roof = boxMesh(1.26, 0.09, 1.26, portaLight);
    roof.position.set(x, 2.36, z);
    roof.rotation.y = yaw || 0;
    scene.add(roof);
    const vent = boxMesh(0.16, 1.0, 0.04, mats.dark);
    vent.position.set(x, 1.35, z + 0.61);
    vent.rotation.y = yaw || 0;
    scene.add(vent);
  }

  /* two I-beams (3 boxes each) stacked on dunnage */
  function ibeamStack(x, z, alongX, len) {
    const g = new THREE.Group();
    for (const sy of [0.05, 0.51]) {
      for (const sz of [-len / 3, len / 3]) {
        const dn = boxMesh(0.7, 0.1, 0.12, mats.wood);
        dn.position.set(0, sy, sz);
        g.add(dn);
      }
    }
    for (let layer = 0; layer < 2; layer++) {
      const y0 = 0.1 + layer * 0.46;
      const bot = boxMesh(0.36, 0.05, len, mats.beam);
      bot.position.set(0, y0 + 0.025, 0);
      g.add(bot);
      const web = boxMesh(0.06, 0.26, len, mats.beam);
      web.position.set(0, y0 + 0.18, 0);
      g.add(web);
      const top = boxMesh(0.36, 0.05, len, mats.beam);
      top.position.set(0, y0 + 0.335, 0);
      g.add(top);
    }
    g.position.set(x, 0, z);
    if (alongX) g.rotation.y = Math.PI / 2;
    scene.add(g);
    addCollider(x, z, alongX ? len + 0.3 : 1.0, alongX ? 1.0 : len + 0.3, 0, 1.1);
  }

  function deckingBundle(x, z) {
    placeBox(x, 0, z, 3.0, 0.42, 5.6, deckGray, true);
    placeBox(x, 0.42, z, 3.04, 0.05, 5.64, deckLight, false);
  }

  /* ================================================================
     1. DATA HALL — reels / gang boxes / pallets along the SIDES.
        Center aisle (dataX ± 2.5) stays CLEAR for Lugo + scissors.
     ================================================================ */
  for (let i = 0; i < CB.pods; i++) {
    const { mid } = podBand(i);

    reelStand(CB.dataX - 12, mid - 6, 0.12 + jit(0.1));
    reelStand(CB.dataX + 12, mid + 6, -0.15 + jit(0.1));
    if (i === 1) reelStand(CB.dataX - 12, mid + 5.5, 0.4);

    gangBox(CB.dataX + 13, mid - 6.2, 0.08 + jit(0.06));
    dumpster(CB.hallWX + 1.5, mid + 6.2, jit(0.05));

    palletLoad(CB.dataX + 12.5, mid + 4.2, jit(0.3), "boxes");
    palletLoad(CB.dataX - 12.5, mid - 4.2, jit(0.3), i % 2 ? "kegs" : "coil");

    standingSpool(CB.dataX + 11, mid - 5.4, rnd() * Math.PI);
    standingSpool(CB.dataX - 11, mid + 4.2, rnd() * Math.PI);
  }

  /* GANG BOX sign over pod 1's box, facing the aisle */
  const gbSign = makeLabel("GANG BOX", "#7ee08a");
  gbSign.position.set(CB.dataX + 13, 1.85, podBand(0).mid - 6.2);
  gbSign.rotation.y = -Math.PI / 2;
  scene.add(gbSign);

  /* ================================================================
     2. ELECTRICAL CORRIDORS — feeder drops against the walls + tray
        overhead. West wall clusters lean +x→wall(-x)?  west leans
        toward x=-24 (positive rotation.z tips tops toward -x).
     ================================================================ */
  let ki = 0;
  for (let i = 0; i < CB.pods; i++) {
    const { mid } = podBand(i);
    // west corridor, against the x=-24 wall — clear of panels (mid-6,
    // mid-1, mid+4), the FA box spot (mid-3) and the FACP (pod 1 mid)
    feederDrop(CB.elecWX, mid - 6, ki++, 1);
    feederDrop(CB.elecEX, mid + 6, ki++, -1);

    traySegment(CB.corX, mid, 20);
    // no raised floor on this site — the data hall's cable runs live in
    // tiers of overhead tray, like the reference photos: a run over each
    // rack row plus the open bays either side
    traySegment(CB.corX - 2.28, mid, 18, 6.9);
    traySegment(CB.corX + 2.28, mid, 18, 6.9);
    traySegment(CB.corX - 8, mid, 16, 6.7);
    traySegment(CB.corX + 8, mid, 16, 6.7);
    traySegment(CB.westHallX, mid, 22);
    traySegment(CB.eastHallX, mid, 22);
    traySegment(CB.elecWX, mid, 14);
    traySegment(CB.elecEX, mid, 14);
  }

  /* ================================================================
     3. LONG HALLWAYS — wire carts against the wall, temp-power in
        electrical, DANGER tape. Keep the hall centerline clear.
     ================================================================ */
  for (let i = 0; i < CB.pods; i++) {
    const { mid } = podBand(i);
    if (i % 2 === 0) wireCart(CB.hallWX + 1.5, mid + 5.4, Math.PI / 2 + jit(0.08));
    else wireCart(CB.hallEX - 1.5, mid - 5.4, Math.PI / 2 + jit(0.08));

    tempPost(CB.elecWX, mid - 6, 1);
    if (i % 2 === 0) tempPost(CB.elecEX, mid + 6, -1);
  }

  const tpSign = makeLabel("TEMP POWER", "#ffb03a");
  tpSign.position.set(CB.elecWX, 2.45, podBand(0).mid - 6);
  tpSign.rotation.y = Math.PI / 2;
  scene.add(tpSign);

  tapeRun(CB.dataX - 10, podBand(1).mid - 2, CB.dataX - 10, podBand(1).mid + 2);
  tapeRun(CB.east - 1.1, podBand(2).mid - 2, CB.east - 1.1, podBand(2).mid + 2);
  tapeRun(CB.mechX, podBand(3).mid - 2, CB.mechX, podBand(3).mid + 2);

  /* ================================================================
     4. YARD & LAYDOWN (z 4..48) — stays off the crib (x 3..10 /
        z 12..20), the road strip (z 18..26) and the drivable lift
        park (x 14..20 / z 18..24).
     ================================================================ */
  barrelPair(13.2, 35.6);
  barrelPair(-16.5, 33.5); // clear of Drew's patrol line
  barrelPair(30.5, 15.8);

  palletLoad(24.5, 34.5, 0.3, "boxes");
  palletLoad(2, 44.5, -0.2, "coil");
  palletLoad(-4.5, 30.5, 0.5, "kegs");

  conduitStack(-14.5, 40.5);

  stepLadder(21, 37.5, 0.6);
  stepLadder(-2.5, 35.5, -0.4);

  portaJohn(35.2, 7.5, 0.04);
  portaJohn(36.6, 7.5, -0.03);

  for (const [cx, cz] of [
    [14.2, 29.5],
    [15, 30.8],
    [26.5, 13],
    [-20.5, 42.5],
    [3, 33.5],
    [37, 29],
    [10.5, 43.5],
    [-24, 29],
  ]) {
    cone(cx, cz);
  }

  /* ================================================================
     5. CB-5 LAYDOWN — Ferguson's iron, east of CB-4's mechanical wing.
     ================================================================ */
  ibeamStack(CB.c5x0 + 12, 33, true, 8);
  ibeamStack(CB.c5x0 + 12, 44, true, 8);
  ibeamStack(CB.c5x0 + 26, 38.5, false, 7);

  deckingBundle(CB.c5x0 + 19.5, 30.5);
  deckingBundle(CB.c5x0 + 20.5, 46);
  deckingBundle(CB.c5x0 + 35, 41);

  tapeSquare(CB.c5x0 + 16, 38.5, 3.4, 2.6);
  palletLoad(CB.c5x0 + 16, 38.5, 0.2, "boxes"); // the hot pallet the tape guards

  const post = boxMesh(0.1, 2.4, 0.1, mats.beam);
  post.position.set(CB.c5x0 + 16, 1.2, 34.6);
  scene.add(post);
  const ldSign = makeLabel("LAYDOWN — FERGUSON", "#ffb03a");
  ldSign.position.set(CB.c5x0 + 16, 2.5, 34.75);
  ldSign.rotation.y = Math.PI;
  scene.add(ldSign);

  /* ================================================================
     6. TRASH — Taso ticket. Halls, yard, lunch spots.
     ================================================================ */
  const canMat = mat(0xc45a12);
  const canSil = mat(0x8a8a8e);
  const bottleMat = mat(0x5aa8c8);
  const paperMat = mat(0xe8e0cc);
  const wrapMat = mat(0x6b3a1a);
  const spots = [];
  const hallXs = [CB.hallWX, CB.hallEX, CB.dataX, CB.elecWX];
  for (const hx of hallXs) {
    for (let z = CB.z0 + 2; z < CB.z1 - 4; z += 4.2) {
      spots.push([hx + jit(1.6), z + jit(1.4)]);
    }
  }
  for (const p of [
    [8, 18], [14, 22], [22, 16], [-8, 20], [-16, 28], [4, 34],
    [10, 42], [26, 48], [-22, 40], [6, 56], [CB.corX + 3, podBand(0).mid],
    [CB.corX - 2.5, podBand(1).mid], [18, 12], [11, 15], [-4, 14],
    [32, 18], [9, 26], [-12, 36], [2, 48], [15, 62],
  ]) spots.push([p[0] + jit(1.2), p[1] + jit(1.2)]);
  spots.forEach(([x, z], i) => {
    const k = i % 5;
    if (k === 0) {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.12, 8), i % 2 ? canMat : canSil);
      can.position.set(x, 0.07, z);
      can.rotation.set(1.1 + rnd() * 0.5, rnd() * 6, rnd() * 0.4);
      scene.add(can);
    } else if (k === 1) {
      const b = boxMesh(0.05, 0.16, 0.05, bottleMat);
      b.position.set(x, 0.05, z);
      b.rotation.set(1.2, rnd() * 6, 0.3);
      scene.add(b);
    } else if (k === 2) {
      const ppr = boxMesh(0.22, 0.004, 0.16, paperMat);
      ppr.position.set(x, 0.03, z);
      ppr.rotation.y = rnd() * 6;
      scene.add(ppr);
    } else {
      const w = boxMesh(0.14, 0.02, 0.1, wrapMat);
      w.position.set(x, 0.03, z);
      w.rotation.set(0.2, rnd() * 6, 0.4);
      scene.add(w);
    }
  });
}
