import * as THREE from '../vendor/three.module.min.js';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { clone } from '../vendor/addons/utils/SkeletonUtils.js';
import { attachRedBeard, internCharacterSkeletons } from './redbeard-accessory.mjs';
import { applyBuildProfile, dressCrewShirt, createNeckProfile } from './crew-profiles.mjs';

const assets = new Map(), pending = new Map();
let personSequence=0;
const files = {utah:'utah-character-lod.glb', crew:'crew-worker-lod.glb', lugo:'lugo-character-lod.glb', drew:'drew-character-lod.glb', maritza:'maritza-character-lod.glb'};
function loadCharacter(kind) {
  if(!pending.has(kind)) pending.set(kind,new GLTFLoader().loadAsync(`assets/characters/${files[kind]}`).then(gltf=>{
    if(!gltf.scene||!['Idle','Walk','Work','Seated'].every(name=>gltf.animations.some(a=>a.name===name)))
      throw new Error(`${kind} rig or animation missing`);
    assets.set(kind,gltf);
    return {animations:gltf.animations.map(a=>a.name),loaded:true};
  }));
  return pending.get(kind);
}
export function loadUtahCharacter(){return loadCharacter('utah');}
export async function loadCrewCharacters({lugo=false,drew=false,maritza=false}={}) {
  return Promise.all([loadCharacter('crew'), ...(lugo?[loadCharacter('lugo')]:[]), ...(drew?[loadCharacter('drew')]:[]), ...(maritza?[loadCharacter('maritza')]:[])]);
}
export function makeUtahCharacter(outfit={}) {return makeCharacter('utah',{outfit,name:'Utah'});}
export function makeCrewCharacter(kitName, kit, options={}) {
  return makeCharacter(kitName==='safety'||options.character==='maritza'?'maritza':options.character==='drew'&&assets.has('drew')?'drew':options.character==='lugo'&&assets.has('lugo')?'lugo':'crew',
    {name:options.character||kitName,kit,kitName,options});
}
function makeCharacter(kind, {outfit={},name,kit,kitName,options={}}={}) {
  const asset=assets.get(kind);
  if(!asset)return null;
  const root=new THREE.Group();
  root.name=name;
  const model=clone(asset.scene),materials=new Map();
  const skeletonSharing=internCharacterSkeletons(model);
  const identity=options.character||kitName||name;
  if(kind!=='drew'&&kind!=='maritza')applyBuildProfile(model,identity);
  const neckProfile=kind==='drew'||kind==='maritza'?null:createNeckProfile(model,identity);
  model.traverse(o=>{
    o.userData.noBake=true;
    if(!o.isMesh)return;
    o.castShadow=true;o.receiveShadow=true;
    const copy=m=>{if(!materials.has(m))materials.set(m,m.clone());return materials.get(m);};
    o.material=Array.isArray(o.material)?o.material.map(copy):copy(o.material);
    // Parent distance culling includes animation bounds; don't clip moving arms on the near rig.
    o.frustumCulled=false;
  });
  const shirt={shirt_black:0x222528,shirt_blue:0x24456d};
  const pants={pants_black:0x34383b,pants_khaki:0x968564};
  for(const m of materials.values()) {
    m.envMapIntensity=.7;
    if(m.name==='Drew_dense_brown_beard_undercoat')m.depthWrite=false;
    if(m.name==='Clear_safety_lenses'){m.depthWrite=false;m.opacity=.065;}
    if(m.name==='Faded_red_cotton'&&shirt[outfit.shirt])m.color.setHex(shirt[outfit.shirt]);
    if(m.name==='Faded_indigo_denim'&&pants[outfit.pants])m.color.setHex(pants[outfit.pants]);
    if(m.name==='Scuffed_ivory_hardhat'&&outfit.hat==='hat_black')m.color.setHex(0x222528);
    if(kind==='crew'&&kit) {
      if(m.name==='Crew_navy_work_shirt'){m.color.setHex(kit.shirt);dressCrewShirt(THREE,m,identity);}
      if(m.name==='Faded_indigo_denim')m.color.setHex(kit.jeans);
      if(m.name==='Crew_yellow_hardhat')m.color.setHex(kit.hat);
      if(m.name==='Vest_lime_mesh')m.color.setHex(kit.vest);
      if(m.name==='Utah_skin_CC0')m.color.setHex([0xf8e7d9,0xb58467,0xffffff,0xd8b29b][Math.abs(options.skin||0)%4]);
      if(m.name==='Dark_brown_hair'&&kitName==='redbeard')m.color.setHex(0xc57a48);
    }
  }
  if(kind==='crew') {
    const build=kitName==='gf'?1.12:kitName==='labor'?1.06:kitName==='insulator'?.94:1;
    model.scale.set(build,1,build);
  }
  const redBeard = kind==='crew' && (kitName==='redbeard'||identity==='drew')
    ? attachRedBeard({THREE,donorScene:assets.get('lugo')?.scene,crewModel:model,style:identity==='drew'?'brown':'ginger'}) : null;
  root.add(model);
  root.userData.noBake=true;
  root.userData.realCharacter=true;
  // Old gameplay can assign limb Euler angles without fighting imported animation tracks.
  for(const limb of ['armL','armR','legL','legR','head'])root.userData[limb]=new THREE.Object3D();
  const mixer=new THREE.AnimationMixer(model);
  const actions=Object.fromEntries(asset.animations.map(clip=>[clip.name,mixer.clipAction(clip)]));
  let disposed=false,active=null;const idlePhase=(personSequence++*.731)%3;
  function animate(dt,{moving=false,speed=0,working=false,talking=false,lookBack=false,seated=false}={}) {
    if(disposed)return;
    const clip=seated?'Seated':working?'Work':moving?'Walk':talking?'Talk':lookBack?'LookBack':'Idle';
    const next=actions[clip]||actions.Idle;
    if(next!==active){next.reset();if(active){next.fadeIn(.18);active.fadeOut(.18);}else{next.setEffectiveWeight(1);if(clip==='Idle')next.time=idlePhase%next.getClip().duration;}next.play();active=next;}
    if(clip==='Walk')next.setEffectiveTimeScale(THREE.MathUtils.clamp(speed/1.35,.65,1.8));
    // The UTV anchors the player's feet at seat height; offset only the imported visual.
    model.position.y=seated?-.95:0;
    neckProfile?.reset();mixer.update(Math.min(dt,.15));neckProfile?.apply();
    root.userData.animationState={clip,time:next.time,speed};
  }
  root.userData.animate=animate;
  root.userData.dispose=()=>{
    if(disposed)return;disposed=true;
    redBeard?.dispose();mixer.stopAllAction();mixer.uncacheRoot(model);
    // SkeletonUtils creates independent skeletons for this clone; meshes within
    // it share interned skeletons. Release each bone texture once, keeping shared
    // source geometry and clothing textures available to the other characters.
    const skeletons=new Set();model.traverse(o=>{if(o.isSkinnedMesh&&o.skeleton)skeletons.add(o.skeleton);});
    for(const skeleton of skeletons)skeleton.dispose();
    for(const m of materials.values())m.dispose();
  };
  root.userData.assetInfo={source:files[kind],kind,identity,clips:Object.keys(actions),skeletonSharing,...(redBeard?{variant:identity==='drew'?'Drew':'Red Beard',beard:redBeard.inspect()}: {})};
  animate(0);
  return root;
}
export function disposeCharacter(root) {
  if(!root)return;
  if(root.userData.dispose){root.userData.dispose();return;}
  root.traverse(o=>{
    if(!o.isMesh)return;
    o.geometry?.dispose();
    for(const m of Array.isArray(o.material)?o.material:[o.material])if(m&&!m.vertexColors)m.dispose?.();
  });
}
