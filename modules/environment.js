import { RGBELoader } from '../vendor/addons/loaders/RGBELoader.js';

export async function upgradeEnvironment({ THREE, scene, renderer, mats, dayLights }) {
  const loader = new THREE.TextureLoader();
  const physicalMaterials = new Map();
  const errors = [];
  async function texture(file, color = false) {
    const t = await loader.loadAsync(`assets/materials/${file}`);
    t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
  }
  async function surface(material, id, metres, {color=0xffffff,normal=.6,roughness=1,metalness=0}={}) {
    try {
      const [map, normalMap, roughnessMap] = await Promise.all([
        texture(`${id}_diff_1k.jpg`, true), texture(`${id}_nor_gl_1k.jpg`), texture(`${id}_rough_1k.jpg`),
      ]);
      Object.assign(material, {map, normalMap, roughnessMap, roughness, metalness, envMapIntensity:.65});
      material.normalScale.setScalar(normal);
      material.color.setHex(color);
      material.needsUpdate = true;
      physicalMaterials.set(material, metres);
    } catch(error) { errors.push(`${id}: ${error.message}`); }
  }
  await Promise.all([
    surface(mats.gravel,'gravel_floor_02',2.5,{normal:1.1,roughness:1}),
    surface(mats.slab,'concrete_floor_worn_001',4,{normal:.26,roughness:.72}),
    surface(mats.concrete,'concrete_floor_02',3,{normal:.35,roughness:.92}),
    ...(mats.grass?[surface(mats.grass,'aerial_grass_rock',5,{normal:.65,roughness:1})]:[]),
  ]);
  if(mats.grassDark&&mats.grass){
    Object.assign(mats.grassDark,{map:mats.grass.map,normalMap:mats.grass.normalMap,roughnessMap:mats.grass.roughnessMap});
    mats.grassDark.normalScale.copy(mats.grass.normalScale);mats.grassDark.needsUpdate=true;
    physicalMaterials.set(mats.grassDark,5);
  }
  try {
    const [normalMap,roughnessMap] = await Promise.all([
      texture('corrugated_iron_02_nor_gl_1k.jpg'),texture('corrugated_iron_02_rough_1k.jpg'),
    ]);
    // Interior fan-hall partitions in the reference video are smooth white panels.
    // Keep their shared wall material plain; use ribbed metal only on marked exterior pieces.
    mats.exteriorCladding=mats.wall.clone();
    Object.assign(mats.exteriorCladding,{normalMap,roughnessMap,roughness:.7,metalness:.12,envMapIntensity:.5});
    mats.exteriorCladding.color.setHex(0xe9ece8);
    mats.exteriorCladding.normalScale.set(.32,.32);
    physicalMaterials.set(mats.exteriorCladding,2.4);
    scene.traverse(mesh=>{if(mesh.isMesh&&mesh.userData.exteriorCladding)mesh.material=mats.exteriorCladding;});
  } catch(error) { errors.push(`wall: ${error.message}`); }

  let sky = null;
  let envTarget = null;
  let hdr = null;
  const supportsPmrem=renderer.extensions.has('EXT_color_buffer_float')||renderer.extensions.has('EXT_color_buffer_half_float');
  try {
    hdr = await new RGBELoader().loadAsync('assets/materials/daylight_1k.hdr');
    hdr.mapping=THREE.EquirectangularReflectionMapping;
    if(supportsPmrem){
      const pmrem=new THREE.PMREMGenerator(renderer);
      envTarget=pmrem.fromEquirectangular(hdr);
      pmrem.dispose();
      scene.environment=envTarget.texture;
      dayLights.env=envTarget.texture;
    }else{scene.environment=null;dayLights.env=null;}
    // A dome leaves the game's fog/background colors and night logic intact.
    sky=new THREE.Mesh(new THREE.SphereGeometry(450,48,24),new THREE.MeshBasicMaterial({
      map:hdr,side:THREE.BackSide,depthWrite:false,fog:false,toneMapped:true,
    }));
    sky.name='Lake Ontario daylight sky';
    sky.userData.noBake=true;
    sky.frustumCulled=false;
    sky.renderOrder=-100;
    scene.add(sky);
  } catch(error) { errors.push(`daylight: ${error.message}`); }
  if(errors.length) console.warn('[LW] Material loading warnings',errors);
  return {
    status:errors.length?'partial':'ready', errors,physicalMaterials,
    async restoreContext(){
      if(!hdr||!supportsPmrem)return;
      const wasActive=scene.environment===envTarget?.texture;
      envTarget?.dispose();hdr.needsUpdate=true;
      const pmrem=new THREE.PMREMGenerator(renderer);
      envTarget=pmrem.fromEquirectangular(hdr);pmrem.dispose();
      dayLights.env=envTarget.texture;
      if(wasActive)scene.environment=envTarget.texture;
    },
    update({position,night,inside}) {
      if(sky) { sky.visible=!night&&!inside; sky.position.set(position.x,0,position.z); }
    },
    dispose() { if(sky){scene.remove(sky);sky.geometry.dispose();sky.material.map.dispose();sky.material.dispose();}envTarget?.dispose(); },
  };
}

// Project each static surface in metres, avoiding stretched stones across an entire hall.
export function projectWorldUVs(THREE,scene,materials) {
  const point=new THREE.Vector3(),normal=new THREE.Vector3(),normalMatrix=new THREE.Matrix3();
  scene.updateMatrixWorld(true);
  function visit(obj,blocked=false) {
    blocked=blocked||obj.userData.noBake===true;
    const scale=materials.get(obj.material);
    if(obj.isMesh&&!obj.isSkinnedMesh&&!blocked&&scale&&obj.geometry.attributes.normal) {
      const geometry=obj.geometry.clone();
      const positions=geometry.attributes.position,normals=geometry.attributes.normal;
      const uv=new Float32Array(positions.count*2);
      normalMatrix.getNormalMatrix(obj.matrixWorld);
      for(let i=0;i<positions.count;i++) {
        point.fromBufferAttribute(positions,i).applyMatrix4(obj.matrixWorld);
        normal.fromBufferAttribute(normals,i).applyMatrix3(normalMatrix).normalize();
        const nx=Math.abs(normal.x),ny=Math.abs(normal.y),nz=Math.abs(normal.z);
        if(ny>=nx&&ny>=nz) {uv[i*2]=point.x/scale;uv[i*2+1]=point.z/scale;}
        else if(nx>=nz) {uv[i*2]=point.z/scale;uv[i*2+1]=point.y/scale;}
        else {uv[i*2]=point.x/scale;uv[i*2+1]=point.y/scale;}
      }
      geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
      obj.geometry=geometry;
    }
    for(const child of obj.children) visit(child,blocked);
  }
  visit(scene);
}
