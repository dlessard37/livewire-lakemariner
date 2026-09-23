const geometryVariants=new WeakMap();
const builds={lugo:[.17,.23],kenny:[.39,.49],don:[.27,.36],nate:[.33,.43]};
const bell=(y,center,width)=>Math.exp(-Math.pow((y-center)/width,2));

export function applyBuildProfile(model,name){
  const build=builds[name];if(!build)return;
  model.traverse(mesh=>{
    if(!mesh.isSkinnedMesh||!mesh.geometry.attributes.position)return;
    const source=mesh.geometry;
    if(!geometryVariants.has(source))geometryVariants.set(source,new Map());
    const cache=geometryVariants.get(source);
    if(!cache.has(name)){
      const geometry=source.clone(),p=geometry.attributes.position;
      const joints=geometry.attributes.skinIndex,weights=geometry.attributes.skinWeight;
      const torsoBones=mesh.skeleton.bones.map(b=>/^(root|pelvis[LR]?|spine\d+)$/.test(b.name));
      const legBones=mesh.skeleton.bones.map(b=>/^(pelvis|upperleg|lowerleg)/.test(b.name));
      for(let i=0;i<p.count;i++){
        const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
        // Use original rig weights so T-pose arms/hands are never lengthened by
        // sharing waist height. Head/hat and foot-weighted boots remain exact.
        let torsoWeight=0,legWeight=0;
        for(let k=0;k<4;k++){const bone=joints.getComponent(i,k),weight=weights.getComponent(i,k);if(torsoBones[bone])torsoWeight+=weight;if(legBones[bone])legWeight+=weight;}
        // Ignore tiny nearest-surface fitting weights on accessories and hands.
        if(torsoWeight<.001)torsoWeight=0;if(legWeight<.001)legWeight=0;
        const torso=bell(y,1.19,.28)*(1-Math.min(1,Math.max(0,(y-1.5)/.11)))*torsoWeight;
        const leg=bell(y,.72,.25)*Math.min(1,Math.max(0,(y-.30)/.15))*legWeight,center=Math.exp(-Math.pow(x/.28,4));
        const broad=build[0]*torso+.12*leg;
        p.setXYZ(i,x*(1+broad),y,z*(1+build[1]*torso+.12*leg)+.055*torso*center);
      }
      geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();cache.set(name,geometry);
    }
    mesh.geometry=cache.get(name);
  });
}

export function dressCrewShirt(THREE,material,name){
  if(name!=='drew'&&name!=='kenny')return;
  material.color.setHex(0xffffff);material.roughness=.96;
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vCrewCloth;').replace('#include <begin_vertex>','#include <begin_vertex>\nvCrewCloth = position;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vCrewCloth;');
    const bills=`
      vec3 clothColor=vec3(0.0,0.0331,0.2664);
      float sleeve=step(.225,abs(vCrewCloth.x));
      float whiteBand=sleeve*step(1.32,vCrewCloth.y)*(1.0-step(1.35,vCrewCloth.y));
      float redBand=sleeve*step(1.35,vCrewCloth.y)*(1.0-step(1.39,vCrewCloth.y));
      clothColor=mix(clothColor,vec3(.93),whiteBand);
      clothColor=mix(clothColor,vec3(.565,.004,.03),redBand);
    `;
    const dye=`
      vec2 p=vec2(vCrewCloth.x*8.0,(vCrewCloth.y-1.22)*8.0+vCrewCloth.z*2.0);
      float a=atan(p.y,p.x)+length(p)*7.5+sin(p.x*7.0+p.y*9.0)*.28;
      vec3 clothColor=pow(.5+.5*cos(a+vec3(0.0,2.094,4.188)),vec3(.8));
      clothColor=mix(clothColor,vec3(.92),.13+.12*sin(a*2.2));
    `;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>\n${name==='drew'?bills:dye}\nfloat weave=clamp(dot(diffuseColor.rgb,vec3(.3333))*1.7,.48,1.0);diffuseColor.rgb=clothColor*weave;`);
  };
  material.customProgramCacheKey=()=>`crew-clothing-${name}-v1`;
  material.userData.clothing=name==='drew'?'Buffalo blue with red and white sleeve stripes':'Spiral tie-dye';
}

export function createNeckProfile(model,name){
  if(name!=='gibbs')return null;
  const entries=[['neck02',.35],['neck03',.35],['head',.52]].map(([key,scale])=>{const bone=model.getObjectByName(key);return bone?{bone,scale,base:bone.position.clone()}:null;}).filter(Boolean);
  return {reset(){for(const e of entries)e.bone.position.copy(e.base);},apply(){for(const e of entries)e.bone.position.y*=e.scale;}};
}
