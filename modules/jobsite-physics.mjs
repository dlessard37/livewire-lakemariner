import { SITE_BOUNDS } from './site-layout.mjs';
import RAPIER from '../vendor/rapier.mjs';

// Rapier 0.17.3 compatibility build includes WASM: no CDN or bundler is required.
let initialization;
const ZERO = Object.freeze({ x: 0, y: 0, z: 0 });
const IDENTITY = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const vec = (v = ZERO) => ({ x: finite(v.x), y: finite(v.y), z: finite(v.z) });
const quat = (q = IDENTITY) => ({ x: finite(q.x), y: finite(q.y), z: finite(q.z), w: finite(q.w, 1) });
const copy = (v) => ({ x: v.x, y: v.y, z: v.z });
const positive = (n, fallback) => Number.isFinite(n) && n > 0 ? n : fallback;

/** All distances are metres, time seconds, mass kilograms, positions at player feet. */
export async function createJobsitePhysics(options = {}) {
  initialization ||= RAPIER.init();
  await initialization;
  return new JobsitePhysics(options);
}

export class JobsitePhysics {
  constructor(options = {}) {
    this.options = options;
    this.fixedStep = positive(options.fixedStep, 1 / 60);
    this.maxSubsteps = Math.max(1, Math.floor(positive(options.maxSubsteps, 8)));
    this.maxFrameDelta = positive(options.maxFrameDelta, 0.15);
    this.gravity = finite(options.gravity, -9.81);
    this.playerGravity = finite(options.playerGravity, this.gravity);
    this.radius = positive(options.radius, 0.42);
    this.height = Math.max(this.radius * 2 + 0.01, positive(options.height, 1.78));
    this.offset = positive(options.offset, 0.015);
    this.centerOffset = this.height / 2 + this.offset;
    this.jumpSpeed = positive(options.jumpSpeed, 4.8);
    this.spawn = vec(options.spawn);
    this.accumulator = 0;
    this.simulationTime = 0;
    this.droppedTime = 0;
    this.grounded = false;
    this.verticalVelocity = 0;
    this.pendingJump = null;
    this.lastJumpInput = false;
    this.playerEnabled = true;
    this.disposed = false;
    this.events = [];
    this.props = new Map();
    this.staticColliders = [];
    this.colliderMetadata = new Map();
    this.world = new RAPIER.World({ x: 0, y: this.gravity, z: 0 });
    this.world.timestep = this.fixedStep;
    this.world.integrationParameters.numSolverIterations = 6;
    this.eventQueue = new RAPIER.EventQueue(true);

    if (options.groundBounds !== false) this.addGround(options.groundBounds || {});
    this.importColliders(options.colliders || []);
    for (const ramp of options.ramps || []) this.addRamp(ramp);

    this.playerBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(this.spawn.x, this.spawn.y + this.centerOffset, this.spawn.z)
        .setCcdEnabled(true),
    );
    this.playerCollider = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(this.height / 2 - this.radius, this.radius)
        .setFriction(0).setMass(positive(options.playerMass, 85)), this.playerBody,
    );
    this.colliderMetadata.set(this.playerCollider.handle, { type: 'player', id: 'player' });
    this.controller = this.world.createCharacterController(this.offset);
    this.controller.setSlideEnabled(true);
    this.controller.enableAutostep(positive(options.stepHeight, 0.32), 0.22, false);
    this.controller.enableSnapToGround(positive(options.snapDistance, 0.24));
    this.controller.setMaxSlopeClimbAngle(positive(options.maxSlopeAngle, 46) * Math.PI / 180);
    this.controller.setMinSlopeSlideAngle(positive(options.slideSlopeAngle, 47) * Math.PI / 180);
    this.controller.setApplyImpulsesToDynamicBodies(true);
    this.controller.setCharacterMass(positive(options.playerMass, 85));
    // Populate broad phase before the first controller query. No moving props exist yet.
    this.world.step(this.eventQueue);
    this.lastOutputPosition = this.getPlayerPosition();
  }

  assertLive() {
    if (this.disposed) throw new Error('This physics world has been disposed.');
  }

  addStaticDescriptor(description, metadata) {
    this.assertLive();
    const collider = this.world.createCollider(description);
    this.staticColliders.push(collider);
    this.colliderMetadata.set(collider.handle, metadata);
    return collider;
  }

  /** Small fixed supports and equipment frames, with optional quaternion rotation. */
  addStaticBox({ id, position = ZERO, size = { x: 1, y: 1, z: 1 }, rotation = IDENTITY, friction = 0.65 } = {}) {
    const p = vec(position);
    const collider = this.addStaticDescriptor(RAPIER.ColliderDesc.cuboid(
      positive(size.x, 1) / 2, positive(size.y, 1) / 2, positive(size.z, 1) / 2,
    ).setTranslation(p.x, p.y, p.z).setRotation(quat(rotation)).setFriction(friction),
    { type: 'static', id: id || `support-${this.staticColliders.length}` });
    this.world.updateSceneQueries();
    return collider;
  }

  removeStaticCollider(collider) {
    this.assertLive();
    const index = this.staticColliders.indexOf(collider);
    if (index < 0) return false;
    this.colliderMetadata.delete(collider.handle);
    this.staticColliders.splice(index, 1);
    this.world.removeCollider(collider, true);
    this.world.updateSceneQueries();
    return true;
  }

  /** Imports original LIVE WIRE {minx,maxx,minz,maxz,y,h} axis-aligned bounds. */
  importColliders(bounds) {
    let imported = 0;
    let skipped = 0;
    bounds.forEach((b, index) => {
      const width = b.maxx - b.minx;
      const depth = b.maxz - b.minz;
      if (![b.minx, b.maxx, b.minz, b.maxz, b.y, b.h].every(Number.isFinite) || width <= 0 || depth <= 0 || b.h <= 0) {
        skipped++;
        return;
      }
      this.addStaticDescriptor(
        RAPIER.ColliderDesc.cuboid(width / 2, b.h / 2, depth / 2)
          .setTranslation((b.minx + b.maxx) / 2, b.y + b.h / 2, (b.minz + b.maxz) / 2)
          .setFriction(0.65),
        { type: 'static', id: b.id || `static-${index}`, sourceIndex: index },
      );
      imported++;
    });
    return { imported, skipped };
  }

  /** groundBounds use x/z min/max; floor top is y (default zero). */
  addGround({ minx = SITE_BOUNDS.minx, maxx = SITE_BOUNDS.maxx, minz = SITE_BOUNDS.minz, maxz = SITE_BOUNDS.maxz, y = 0, boundaryWalls = true, continuousPlane = false } = {}) {
    if (!(maxx > minx && maxz > minz)) throw new Error('Ground bounds must have positive area.');
    this.addStaticDescriptor(
      (continuousPlane
        ? new RAPIER.ColliderDesc(new RAPIER.HalfSpace({ x: 0, y: 1, z: 0 })).setTranslation(0, y, 0)
        : RAPIER.ColliderDesc.cuboid((maxx - minx) / 2 + 1, 0.5, (maxz - minz) / 2 + 1)
          .setTranslation((minx + maxx) / 2, y - 0.5, (minz + maxz) / 2)).setFriction(0.75),
      { type: 'ground', id: 'ground' },
    );
    if (boundaryWalls) {
      for (const [x, z, w, d] of [
        [minx - 0.5, (minz + maxz) / 2, 1, maxz - minz + 2],
        [maxx + 0.5, (minz + maxz) / 2, 1, maxz - minz + 2],
        [(minx + maxx) / 2, minz - 0.5, maxx - minx + 2, 1],
        [(minx + maxx) / 2, maxz + 0.5, maxx - minx + 2, 1],
      ]) this.addStaticDescriptor(
        RAPIER.ColliderDesc.cuboid(w / 2, 25, d / 2).setTranslation(x, y + 24.5, z),
        { type: 'boundary', id: `boundary-${x}-${z}` },
      );
    }
  }

  /** Convex wedge follows addRamp's visible THREE Y rotation, not legacy groundH. */
  addRamp({ x = 0, z = 0, yaw = 0, len, wid, h0 = 0, h1 = 1, id, surfaceOffset = 0 } = {}) {
    if (!(len > 0 && wid > 0)) throw new Error('Ramp len and wid must be positive.');
    const bottom = Math.min(h0, h1, 0) - 0.2;
    const vertices = new Float32Array([
      -wid / 2, bottom, 0, wid / 2, bottom, 0,
      -wid / 2, bottom, len, wid / 2, bottom, len,
      -wid / 2, h0 + surfaceOffset, 0, wid / 2, h0 + surfaceOffset, 0,
      -wid / 2, h1 + surfaceOffset, len, wid / 2, h1 + surfaceOffset, len,
    ]);
    const descriptor = RAPIER.ColliderDesc.convexHull(vertices);
    if (!descriptor) throw new Error('Rapier could not construct this ramp.');
    return this.addStaticDescriptor(descriptor
      .setTranslation(x, 0, z)
      .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
      .setFriction(0.8), { type: 'ramp', id: id || `ramp-${x}-${z}` });
  }

  /** Add a Three-compatible mesh with world-space pivot at the body's centre. */
  addDynamicProp({ id, shape = 'box', position = { x: 0, y: 2, z: 0 }, rotation = IDENTITY,
    size = { x: 0.8, y: 0.8, z: 0.8 }, radius = 0.42, halfHeight = 0.35,
    mass = 18, friction = 0.55, restitution = 0.08, linearDamping = 0.2,
    angularDamping = 0.45, upright = false, mesh = null, meshOffset = ZERO } = {}) {
    this.assertLive();
    id ||= `prop-${this.props.size + 1}`;
    if (this.props.has(id)) throw new Error(`Duplicate physics prop id: ${id}`);
    const p = vec(position);
    const q = quat(rotation);
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(p.x, p.y, p.z).setRotation(q)
      .setLinearDamping(Math.max(0, linearDamping)).setAngularDamping(Math.max(0, angularDamping))
      .setCcdEnabled(true).setCanSleep(true));
    if (upright) body.setEnabledRotations(false, true, false, true);
    const descriptions = [];
    if (shape === 'sphere') descriptions.push(RAPIER.ColliderDesc.ball(positive(radius, 0.42)));
    else if (shape === 'cylinder') descriptions.push(RAPIER.ColliderDesc.cylinder(positive(halfHeight, 0.35), positive(radius, 0.42)));
    else if (shape === 'reel') {
      // Three cylinders form a real spool. Axis is local X; flanges touch ground.
      const r = positive(radius, 0.52), h = positive(halfHeight, 0.36);
      const axle = { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 };
      descriptions.push(RAPIER.ColliderDesc.cylinder(h, r * 0.65).setRotation(axle));
      descriptions.push(RAPIER.ColliderDesc.cylinder(0.055, r).setRotation(axle).setTranslation(-h, 0, 0));
      descriptions.push(RAPIER.ColliderDesc.cylinder(0.055, r).setRotation(axle).setTranslation(h, 0, 0));
    } else if (shape === 'box' || shape === 'cart') {
      descriptions.push(RAPIER.ColliderDesc.cuboid(positive(size.x, 0.8) / 2, positive(size.y, 0.8) / 2, positive(size.z, 0.8) / 2));
      if (shape === 'cart') body.setEnabledRotations(false, true, false, true);
    } else {
      this.world.removeRigidBody(body);
      throw new Error(`Unsupported dynamic shape: ${shape}`);
    }
    const colliders = descriptions.map(description => {
      const collider = this.world.createCollider(description.setMass(positive(mass, 18) / descriptions.length)
        .setFriction(Math.max(0, friction)).setRestitution(Math.min(1, Math.max(0, restitution)))
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), body);
      this.colliderMetadata.set(collider.handle, { type: 'prop', id });
      return collider;
    });
    const prop = { id, body, colliders, mesh, meshOffset: vec(meshOffset),
      initialPosition: p, initialRotation: q, previousPosition: copy(p), previousRotation: quat(q) };
    this.props.set(id, prop);
    this.world.updateSceneQueries();
    this.syncProp(prop, 1);
    return prop;
  }

  removeProp(id) {
    this.assertLive();
    const prop = this.props.get(id);
    if (!prop) return false;
    prop.colliders.forEach(c => this.colliderMetadata.delete(c.handle));
    this.world.removeRigidBody(prop.body);
    this.props.delete(id);
    return true;
  }

  /** Physical hinge e.g. a reel on a fixed stand; anchor coordinates are local. */
  createHinge({ a, b, anchorA = ZERO, anchorB = ZERO, axis = { x: 1, y: 0, z: 0 } }) {
    this.assertLive();
    const bodyA = typeof a === 'string' ? this.props.get(a)?.body : a;
    const bodyB = typeof b === 'string' ? this.props.get(b)?.body : b;
    if (!bodyA || !bodyB) throw new Error('Both hinge bodies must exist.');
    return this.world.createImpulseJoint(RAPIER.JointData.revolute(vec(anchorA), vec(anchorB), vec(axis)), bodyA, bodyB, true);
  }

  createAnchor(position) {
    this.assertLive();
    const p = vec(position);
    return this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(p.x, p.y, p.z));
  }

  applyImpulse(id, impulse, point) {
    this.assertLive();
    const prop = this.props.get(id);
    if (!prop) return false;
    if (point) prop.body.applyImpulseAtPoint(vec(impulse), vec(point), true);
    else prop.body.applyImpulse(vec(impulse), true);
    return true;
  }

  /** Impulse is queued across render frames that do not contain a physics tick. */
  jump(speed = this.jumpSpeed) {
    this.assertLive();
    if (!this.playerEnabled || !this.grounded) return false;
    this.pendingJump = positive(speed, this.jumpSpeed);
    return true;
  }

  setPlayerPosition(position, { verticalVelocity = 0, grounded = false } = {}) {
    this.assertLive();
    const p = vec(position);
    const centre = { x: p.x, y: p.y + this.centerOffset, z: p.z };
    this.playerBody.setTranslation(centre, true);
    this.playerBody.setNextKinematicTranslation(centre);
    this.playerBody.setLinvel(ZERO, true);
    this.world.propagateModifiedBodyPositionsToColliders();
    this.world.updateSceneQueries();
    this.verticalVelocity = finite(verticalVelocity);
    this.grounded = Boolean(grounded);
    this.pendingJump = null;
    this.lastOutputPosition = copy(p);
  }

  getPlayerPosition() {
    this.assertLive();
    const p = this.playerBody.translation();
    return { x: p.x, y: p.y - this.centerOffset, z: p.z };
  }

  /**
   * One call per rendered frame. velocity is desired metres/sec, not displacement.
   * Pass externalPosition every frame to detect existing checkpoint/hazard teleports.
   * enabled:false releases control to lift/UTV/bed modes while props still simulate.
   */
  update(dt, { velocity = ZERO, jump = false, jumpSpeed = this.jumpSpeed,
    enabled = true, externalPosition } = {}) {
    this.assertLive();
    this.events.length = 0;
    if (externalPosition) {
      const p = vec(externalPosition), last = this.lastOutputPosition;
      if (!enabled || !this.playerEnabled || Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z) > 0.002) {
        this.setPlayerPosition(p);
      }
    }
    if (enabled !== this.playerEnabled) {
      this.playerEnabled = Boolean(enabled);
      this.playerBody.setEnabled(this.playerEnabled);
      this.world.updateSceneQueries();
      this.verticalVelocity = 0;
      this.pendingJump = null;
      this.grounded = false;
    }
    if (jump && !this.lastJumpInput) this.jump(jumpSpeed);
    this.lastJumpInput = Boolean(jump);
    const elapsed = Math.max(0, finite(dt));
    const admitted = Math.min(elapsed, this.maxFrameDelta);
    this.droppedTime += elapsed - admitted;
    this.accumulator += admitted;
    let steps = 0;
    const characterContacts = new Set();
    while (this.accumulator + 1e-10 >= this.fixedStep && steps < this.maxSubsteps) {
      this.fixedUpdate(vec(velocity), characterContacts);
      this.accumulator = Math.max(0, this.accumulator - this.fixedStep);
      this.simulationTime += this.fixedStep;
      steps++;
    }
    if (this.accumulator >= this.fixedStep) {
      const remainder = this.accumulator % this.fixedStep;
      this.droppedTime += this.accumulator - remainder;
      this.accumulator = remainder;
    }
    const alpha = this.accumulator / this.fixedStep;
    this.syncMeshes(alpha);
    const position = this.getPlayerPosition();
    this.lastOutputPosition = copy(position);
    return { position, grounded: this.grounded, verticalVelocity: this.verticalVelocity,
      steps, alpha, simulationTime: this.simulationTime, droppedTime: this.droppedTime,
      events: this.events.slice() };
  }

  fixedUpdate(velocity, characterContacts) {
    for (const prop of this.props.values()) {
      prop.previousPosition = copy(prop.body.translation());
      prop.previousRotation = quat(prop.body.rotation());
    }
    if (this.playerEnabled) {
      if (this.pendingJump !== null) {
        this.verticalVelocity = this.pendingJump;
        this.pendingJump = null;
        this.grounded = false;
      }
      this.verticalVelocity = Math.max(-55, this.verticalVelocity + this.playerGravity * this.fixedStep);
      const desired = { x: velocity.x * this.fixedStep, y: this.verticalVelocity * this.fixedStep, z: velocity.z * this.fixedStep };
      this.controller.computeColliderMovement(this.playerCollider, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
      const movement = this.controller.computedMovement();
      this.grounded = this.controller.computedGrounded();
      if ((this.grounded && this.verticalVelocity < 0) || (this.verticalVelocity > 0 && movement.y < desired.y - 0.0001)) this.verticalVelocity = 0;
      const p = this.playerBody.translation();
      this.playerBody.setNextKinematicTranslation({ x: p.x + movement.x, y: p.y + movement.y, z: p.z + movement.z });
      for (let i = 0; i < this.controller.numComputedCollisions(); i++) {
        const collision = this.controller.computedCollision(i);
        if (!collision?.collider || characterContacts.has(collision.collider.handle)) continue;
        characterContacts.add(collision.collider.handle);
        const metadata = this.colliderMetadata.get(collision.collider.handle);
        if (metadata?.type === 'prop') this.recordEvent({ type: 'player-contact', other: metadata,
          normal: copy(collision.normal1), point: copy(collision.witness1) });
      }
    }
    this.world.step(this.eventQueue);
    this.eventQueue.drainCollisionEvents((a, b, started) => this.recordEvent({
      type: started ? 'contact-start' : 'contact-end',
      a: this.colliderMetadata.get(a) || { type: 'unknown', id: a },
      b: this.colliderMetadata.get(b) || { type: 'unknown', id: b },
    }));
    for (const prop of this.props.values()) {
      // Recover loose props outside the jobsite after falling through an unbuilt area.
      if (prop.body.translation().y < -35) this.resetProp(prop);
    }
  }

  recordEvent(event) {
    if (this.events.length < 128) this.events.push(event);
    if (typeof this.options.onCollision === 'function') this.options.onCollision(event);
  }

  syncProp(prop, alpha) {
    if (!prop.mesh) return;
    const p = prop.body.translation(), old = prop.previousPosition;
    const q = prop.body.rotation(), previous = prop.previousRotation;
    const px = old.x + (p.x - old.x) * alpha + prop.meshOffset.x;
    const py = old.y + (p.y - old.y) * alpha + prop.meshOffset.y;
    const pz = old.z + (p.z - old.z) * alpha + prop.meshOffset.z;
    if (typeof prop.mesh.position?.set === 'function') prop.mesh.position.set(px, py, pz);
    if (typeof prop.mesh.quaternion?.set === 'function') {
      // Normalized lerp follows the shortest quaternion arc without a Three dependency.
      const sign = previous.x * q.x + previous.y * q.y + previous.z * q.z + previous.w * q.w < 0 ? -1 : 1;
      const x = previous.x + (q.x * sign - previous.x) * alpha;
      const y = previous.y + (q.y * sign - previous.y) * alpha;
      const z = previous.z + (q.z * sign - previous.z) * alpha;
      const w = previous.w + (q.w * sign - previous.w) * alpha;
      const length = Math.hypot(x, y, z, w) || 1;
      prop.mesh.quaternion.set(x / length, y / length, z / length, w / length);
    }
  }

  syncMeshes(alpha = 1) {
    this.assertLive();
    for (const prop of this.props.values()) this.syncProp(prop, Math.min(1, Math.max(0, alpha)));
  }

  resetProp(propOrId) {
    this.assertLive();
    const prop = typeof propOrId === 'string' ? this.props.get(propOrId) : propOrId;
    if (!prop) return false;
    prop.body.setTranslation(prop.initialPosition, true);
    prop.body.setRotation(prop.initialRotation, true);
    prop.body.setLinvel(ZERO, true);
    prop.body.setAngvel(ZERO, true);
    prop.body.resetForces(true);
    prop.body.resetTorques(true);
    prop.previousPosition = copy(prop.initialPosition);
    prop.previousRotation = quat(prop.initialRotation);
    this.syncProp(prop, 1);
    return true;
  }

  /** Reset transforms and momentum; keeps imported static geometry and prop handles. */
  reset({ spawn = this.spawn, props = true } = {}) {
    this.assertLive();
    this.accumulator = 0;
    this.simulationTime = 0;
    this.droppedTime = 0;
    this.lastJumpInput = false;
    this.playerEnabled = true;
    this.playerBody.setEnabled(true);
    this.setPlayerPosition(spawn);
    if (props) for (const prop of this.props.values()) this.resetProp(prop);
    this.events.length = 0;
    this.eventQueue.clear();
    this.world.propagateModifiedBodyPositionsToColliders();
    this.world.updateSceneQueries();
  }

  stats() {
    this.assertLive();
    return { engine: `Rapier ${RAPIER.version()}`, staticColliders: this.staticColliders.length,
      dynamicProps: this.props.size, bodies: this.world.bodies.len(), fixedStep: this.fixedStep,
      simulationTime: this.simulationTime, droppedTime: this.droppedTime, playerEnabled: this.playerEnabled };
  }

  debugRender() { this.assertLive(); return this.world.debugRender(); }

  dispose() {
    if (this.disposed) return;
    this.eventQueue.free();
    this.world.free();
    this.props.clear();
    this.colliderMetadata.clear();
    this.staticColliders.length = 0;
    this.disposed = true;
  }
}
