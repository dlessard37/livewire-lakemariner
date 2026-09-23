import RAPIER from '../vendor/rapier.mjs';

/** Solid compact compound chassis/cab attached to the existing scripted patrol.
 * No new simulation loop: JobsitePhysics remains the only world.step authority.
 * The fork tines and elevated telescoping arm remain visual, as with the old game.
 */
export function createTelehandlerPhysics({physics,mesh,id='yard-telehandler'}={}){
 if(!physics?.world||!mesh)throw new Error('Pass the initialized jobsite physics and telehandler root.');
 const world=physics.world,scale=mesh.scale.x||1,p=mesh.position,q=mesh.quaternion;
 const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x,p.y,p.z).setRotation(q).setCcdEnabled(true));
 const boxes=[{size:[2.44,1.40,4.76],at:[0,.85,-.04],part:'chassis and tyres'},{size:[.98,1.50,1.95],at:[-.59,2.00,-.53],part:'driver cab'}];
 const colliders=boxes.map(({size,at,part})=>{const c=world.createCollider(RAPIER.ColliderDesc.cuboid(...size.map(n=>n*scale/2)).setTranslation(...at.map(n=>n*scale)).setFriction(.55).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),body);physics.colliderMetadata.set(c.handle,{type:'equipment',id,part});return c;});
 world.propagateModifiedBodyPositionsToColliders();world.updateSceneQueries();let disposed=false;
 return {body,colliders,
  sync({teleport=false}={}){if(disposed||physics.disposed)return false;const p=mesh.position,q=mesh.quaternion,old=body.translation();if(teleport||Math.hypot(old.x-p.x,old.z-p.z)>4){body.setTranslation(p,true);body.setRotation(q,true);world.propagateModifiedBodyPositionsToColliders();world.updateSceneQueries();}body.setNextKinematicTranslation(p);body.setNextKinematicRotation(q);return true;},
  inspect:()=>({id,kind:'kinematic compound chassis/cab',colliders:colliders.length,forkTinesCollide:false,usesSharedWorldStep:true}),
  dispose(){if(disposed)return;disposed=true;if(physics.disposed)return;for(const c of colliders)physics.colliderMetadata.delete(c.handle);world.removeRigidBody(body);world.updateSceneQueries();},
 };
}
