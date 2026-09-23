import * as THREE from '../vendor/three.module.min.js';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { clone } from '../vendor/addons/utils/SkeletonUtils.js';

const cached=new Map();
let loading;
export function loadMooseAssets(){
  if(!loading)loading=Promise.all(['near','far'].map(async lod=>{
    const gltf=await new GLTFLoader().loadAsync(`assets/moose/moose-${lod}.glb`);
    if(!gltf.scene||!['Idle','Walk'].every(name=>gltf.animations.some(a=>a.name===name)))
      throw new Error(`Moose ${lod} rig or animation missing`);
    cached.set(lod,gltf);
  })).then(()=>({loaded:true,forward:'+Z',seatHeight:1.474}));
  return loading;
}

// Call after loadMooseAssets. The compatibility caller may use its fallback while loading.
export function makeMoose(){
  if(!cached.has('near')||!cached.has('far'))return null;
  const root=new THREE.Group();root.name='David_Moose';root.userData.noBake=true;
  const levels=['near','far'].map(lod=>{
    const asset=cached.get(lod),model=clone(asset.scene),mixer=new THREE.AnimationMixer(model);
    model.traverse(o=>{o.userData.noBake=true;if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;}});
    const actions=Object.fromEntries(asset.animations.map(clip=>[clip.name,mixer.clipAction(clip)]));
    actions.Idle.play();root.add(model);
    return {model,mixer,actions,active:'Idle',seat:model.getObjectByName('Moose_Seat'),accum:0};
  });
  let selected=0;levels[1].model.visible=false;
  const seatDefault=new THREE.Vector3(0,1.474,-.07);
  root.userData.seatHeight=1.474;
  root.userData.forward='+Z';
  root.userData.getSeatPosition=(target=new THREE.Vector3())=>{
    const marker=levels[selected].seat;
    if(!marker)return target.copy(seatDefault);
    root.updateWorldMatrix(true,true);
    marker.getWorldPosition(target);
    return root.worldToLocal(target);
  };
  root.userData.animate=(dt,{speed=0,distance=0}={})=>{
    const nextLevel=distance>24?1:0;
    if(nextLevel!==selected){
      levels[selected].model.visible=false;selected=nextLevel;levels[selected].model.visible=true;
    }
    const level=levels[selected],moving=Math.abs(speed)>.035,name=moving?'Walk':'Idle';
    if(name!==level.active){
      level.actions[name].reset().fadeIn(.2).play();level.actions[level.active].fadeOut(.2);level.active=name;
    }
    level.actions.Walk.setEffectiveTimeScale(THREE.MathUtils.clamp(Math.abs(speed)/.952,.2,2.1));
    level.accum+=Math.max(0,Math.min(dt,.25));
    if(!selected||level.accum>=.10){level.mixer.update(level.accum);level.accum=0;}
  };
  root.userData.dispose=()=>{
    for(const level of levels){level.mixer.stopAllAction();level.mixer.uncacheRoot(level.model);}
    // Cached geometry, materials and textures belong to the module, not this clone.
  };
  root.userData.animate(0);
  return root;
}
