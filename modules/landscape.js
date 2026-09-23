import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';

function groundFrame(THREE,asset) {
  asset.scene.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(asset.scene),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  if(!Number.isFinite(size.y)||size.y<=0)throw new Error('Landscape asset has no finite height');
  return new THREE.Matrix4().makeScale(1/size.y,1/size.y,1/size.y).multiply(new THREE.Matrix4().makeTranslation(-center.x,-bounds.min.y,-center.z));
}

/** Exported for numeric verification against the actual loaded GLBs. */
export function prepareLandscapeAssets({THREE,sources,masks}) {
  const ownedGeometries=new Set(),ownedMaterials=new Set(),ownedMasks=new Set();
  const treeFrame=groundFrame(THREE,sources[0]);
  function material(source,level) {
    const m=source.clone(),leaf=/leav/i.test(m.name),grass=/grass/i.test(m.name);
    m.transparent=false;m.depthWrite=true;m.roughness=.93;m.metalness=0;m.envMapIntensity=.35;
    if(leaf||grass) {
      // The optimized GLBs contain RGB-only diffuse images. Their original
      // grayscale opacity masks are necessary: alphaTest alone cannot cut RGB.
      const sourceMask=leaf?masks.leaves:masks.grass;
      if(!sourceMask)throw new Error(`Missing original opacity mask for ${m.name}`);
      const alpha=sourceMask.clone();alpha.flipY=false;alpha.colorSpace=THREE.NoColorSpace;
      if(m.map){alpha.channel=m.map.channel;alpha.wrapS=m.map.wrapS;alpha.wrapT=m.map.wrapT;alpha.offset.copy(m.map.offset);alpha.repeat.copy(m.map.repeat);alpha.center.copy(m.map.center);alpha.rotation=m.map.rotation;}
      alpha.minFilter=THREE.LinearMipmapLinearFilter;alpha.magFilter=THREE.LinearFilter;alpha.generateMipmaps=true;alpha.needsUpdate=true;
      m.alphaMap=alpha;m.alphaTest=level==='far'?.25:.4;m.side=THREE.DoubleSide;m.forceSinglePass=true;ownedMasks.add(alpha);
    }
    m.needsUpdate=true;ownedMaterials.add(m);return m;
  }
  function parts(asset,level,frame,selection=null) {
    const byMaterial=new Map();asset.scene.updateMatrixWorld(true);
    asset.scene.traverse(o=>{if(!o.isMesh||selection&&o!==selection)return;
      if(!byMaterial.has(o.material))byMaterial.set(o.material,[]);
      const g=o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(frame,o.matrixWorld));byMaterial.get(o.material).push(g);
    });
    return [...byMaterial].map(([source,geometries])=>{
      const geometry=mergeGeometries(geometries,false);for(const g of geometries)g.dispose();
      if(!geometry)throw new Error('Landscape geometry attributes could not be merged');
      geometry.computeBoundingBox();geometry.computeBoundingSphere();ownedGeometries.add(geometry);return {geometry,material:material(source,level)};
    });
  }
  const near=parts(sources[0],'near',treeFrame),far=parts(sources[1],'far',treeFrame);
  // grass-tuft.glb is a specimen library laid out along X, not one plant.
  // Select one rooted clump instead of enlarging its entire seventeen-item row.
  let clump=null;sources[2].scene.traverse(o=>{if(o.isMesh&&/large_a/i.test(o.name))clump=o;});
  if(!clump)sources[2].scene.traverse(o=>{if(o.isMesh&&!clump)clump=o;});
  if(!clump)throw new Error('Grass asset contains no clump');
  sources[2].scene.updateMatrixWorld(true);const grassBounds=new THREE.Box3().setFromObject(clump),grassSize=grassBounds.getSize(new THREE.Vector3()),grassCenter=grassBounds.getCenter(new THREE.Vector3());
  const grassFrame=new THREE.Matrix4().makeScale(1/grassSize.y,1/grassSize.y,1/grassSize.y).multiply(new THREE.Matrix4().makeTranslation(-grassCenter.x,-grassBounds.min.y,-grassCenter.z));
  const grass=parts(sources[2],'grass',grassFrame,clump);
  return {near,far,grass,treeFrame,grassClump:clump.name,dispose(){for(const g of ownedGeometries)g.dispose();for(const m of ownedMaterials)m.dispose();for(const t of ownedMasks)t.dispose();}};
}

export async function createLandscape({THREE,scene,trees,shoreZ,assetBase='assets/landscape/',sources=null,masks=null,nearDistance=38,treeDistance=null,grassDistance=42,clock=()=>performance.now()}={}) {
  const loader=new GLTFLoader(),textureLoader=new THREE.TextureLoader();
  const loadedSources=sources||await Promise.all(['tree-near','tree-far','grass-tuft'].map(name=>loader.loadAsync(`${assetBase}${name}.glb`)));
  const loadedMasks=masks||await Promise.all(['tree-leaves-alpha.png','grass-alpha.png'].map(name=>textureLoader.loadAsync(`${assetBase}${name}`))).then(([leaves,grass])=>({leaves,grass}));
  const parts=prepareLandscapeAssets({THREE,sources:loadedSources,masks:loadedMasks});
  const cells=new Map(),matrix=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3(),quat=new THREE.Quaternion();
  function record(kind,p){
    if(!Number.isFinite(p.x+p.z+p.h)||p.h<=0)return;
    const key=`${kind}:${Math.floor(p.x/32)}:${Math.floor(p.z/32)}`;
    if(!cells.has(key))cells.set(key,{kind,records:[]});
    const rotation=((p.x*13.1+p.z*7.7)%6.283);
    matrix.compose(position.set(p.x,.005,p.z),quat.setFromAxisAngle(THREE.Object3D.DEFAULT_UP,rotation),scale.setScalar(p.h));
    cells.get(key).records.push({...p,matrix:matrix.clone(),level:null});
  }
  for(const p of trees)record('tree',p);
  for(let i=0;i<96;i++)record('grass',{x:-140+i*3.1,z:shoreZ+18+Math.sin(i*2.3)*2,h:.3+(i%4)*.07});
  const allMeshes=[];
  for(const c of cells.values()) {
    c.levels={};
    for(const level of c.kind==='tree'?['near','far']:['grass'])c.levels[level]=parts[level].map(p=>{
      const mesh=new THREE.InstancedMesh(p.geometry,p.material,c.records.length);
      mesh.name=`Shore ${c.kind} ${level}`;mesh.userData.noBake=true;mesh.userData.landscapeKind=c.kind;mesh.userData.landscapeLod=level;
      mesh.castShadow=false;mesh.receiveShadow=true;mesh.count=0;mesh.visible=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(mesh);allMeshes.push(mesh);return mesh;
    });
  }
  let next=0,disposed=false;const stats={trees:trees.length,near:0,far:0,grass:0,culled:0,draws:0,triangles:0,updates:0,treeDistance:0,nearDistance,grassClump:parts.grassClump};
  return {
    update(p,force=false){
      if(disposed||!p||!Number.isFinite(p.x+p.z))return false;
      const now=clock();if(!force&&now<next)return false;next=now+350;
      // Keep distant silhouettes until the game's fog has actually concealed
      // them. Previously trees vanished abruptly at 260 m inside 380 m fog.
      const farLimit=treeDistance??(scene.fog?.far||400);stats.treeDistance=farLimit;stats.near=0;stats.far=0;stats.grass=0;stats.culled=0;stats.draws=0;stats.triangles=0;
      for(const c of cells.values()) {
        const n={near:0,far:0,grass:0};
        for(const r of c.records) {
          const distance=Math.hypot(r.x-p.x,r.z-p.z),limit=c.kind==='tree'?farLimit:grassDistance;
          if(distance>limit){r.level=null;if(c.kind==='tree')stats.culled++;continue;}
          const level=c.kind==='grass'?'grass':distance<nearDistance*(r.level==='near'?1.12:1)?'near':'far';r.level=level;
          for(const mesh of c.levels[level])mesh.setMatrixAt(n[level],r.matrix);n[level]++;stats[level]++;
        }
        for(const[level,meshes]of Object.entries(c.levels))for(const mesh of meshes) {
          mesh.count=n[level];mesh.visible=mesh.count>0;mesh.instanceMatrix.needsUpdate=true;
          if(mesh.count){mesh.computeBoundingBox();mesh.computeBoundingSphere();stats.draws++;stats.triangles+=(mesh.geometry.index?.count||mesh.geometry.attributes.position.count)/3*mesh.count;}
        }
      }
      stats.updates++;return true;
    },
    inspect:()=>({...stats}),
    dispose(){if(disposed)return;disposed=true;for(const m of allMeshes){m.removeFromParent();m.dispose();}parts.dispose();if(!masks){loadedMasks.leaves.dispose();loadedMasks.grass.dispose();}},
  };
}
