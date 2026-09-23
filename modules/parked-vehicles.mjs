// Authored procedural parked vehicles. Metres, +Z forward, tyres rest at y=0.
// One shared near/far template per body style; fleet instances retain original placement/colliders.
export const VEHICLE_SPECS = Object.freeze({
  pickup: Object.freeze({ width:1.9, length:4.4, height:1.825, wheelRadius:.37, wheelbase:2.66 }),
  sedan: Object.freeze({ width:1.7, length:4, height:1.45, wheelRadius:.305, wheelbase:2.48 }),
});
const caches = new WeakMap();
function cache(T) {
  if (!caches.has(T)) {
    const material = (roughness,metalness) => new T.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness,metalness});
    caches.set(T,{ templates:new Map(), materials:{paint:material(.36,.35),rubber:material(.91,.03),glass:material(.18,.42),trim:material(.38,.65),far:material(.67,.12)} });
  }
  return caches.get(T);
}

function builder(T,detail) {
  const far=detail==='far', parts=[];
  const C={paint:0xffffff,rubber:0x181b1e,glass:0x26343e,chrome:0xaeb6ba,black:0x21272b,red:0x8e1c15,white:0xc5d2d7,amber:0xbd6315};
  function add(g,bucket,color,x=0,y=0,z=0,rx=0,ry=0,rz=0) {
    g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(x,y,z),new T.Quaternion().setFromEuler(new T.Euler(rx,ry,rz)),new T.Vector3(1,1,1)));
    parts.push({g,bucket:far&&bucket!=='paint'?'far':bucket,color});
  }
  function box(w,h,d,bucket,color,x=0,y=0,z=0,rx=0,ry=0,rz=0) { add(new T.BoxGeometry(w,h,d),bucket,color,x,y,z,rx,ry,rz); }
  function rounded(w,h,d,r=.04) {
    const s=new T.Shape(),x=-w/2,y=-h/2; r=Math.max(.001,Math.min(r,w/3,h/3));
    s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);
    const b=Math.min(.012,d/5,r/3),g=new T.ExtrudeGeometry(s,{depth:d-2*b,bevelEnabled:!far,bevelThickness:b,bevelSize:b,bevelSegments:1,curveSegments:far?1:2,steps:1});
    // Extrude's bevel extends shape in XY. Contract is the outer footprint.
    if(!far)g.scale(w/(w+2*b),h/(h+2*b),1);g.translate(0,0,-d/2+b);return g;
  }
  function panel(w,h,d,bucket,color,x=0,y=0,z=0,rx=0,ry=0,rz=0,r=.04) { add(rounded(w,h,d,r),bucket,color,x,y,z,rx,ry,rz); }
  function cyl(r,h,bucket,color,x,y,z,rz=Math.PI/2,segments=16) { add(new T.CylinderGeometry(r,r,h,far?8:segments),bucket,color,x,y,z,0,0,rz); }
  function line(points,r,bucket,color) {
    const vs=points.map(p=>new T.Vector3(...p)),path=new T.CatmullRomCurve3(vs,false,'centripetal');
    add(new T.TubeGeometry(path,far?Math.max(1,points.length):Math.max(2,points.length*2),r,far?3:5,false),bucket,color);
  }
  function surface(vertices,indices,bucket,color,smooth=false) {
    let g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices.flat(),3));g.setIndex(indices);if(!smooth){const flat=g.toNonIndexed();g.dispose();g=flat;}g.computeVertexNormals();add(g,bucket,color);
  }
  function quad(points,bucket,color) { surface(points,[0,1,2,0,2,3],bucket,color); }
  function shell(stations,bucket='paint',color=C.paint,openRoofUntil=null) {
    const v=[],idx=[];
    for(const s of stations) {
      const x=s.width/2,b=s.bottom,t=s.top,corner=Math.min(.065,(t-b)/4),shoulder=s.shoulder??.08;
      v.push([-x+shoulder,b,s.z],[x-shoulder,b,s.z],[x,b+corner,s.z],[x,t-corner,s.z],[x-shoulder,t,s.z],[-x+shoulder,t,s.z],[-x,t-corner,s.z],[-x,b+corner,s.z]);
    }
    for(let k=0;k<stations.length-1;k++)for(let j=0;j<8;j++){if((j===4||j===0)&&openRoofUntil!==null&&stations[k+1].z<=openRoofUntil)continue;const a=k*8+j,b=k*8+(j+1)%8;idx.push(a,b,a+8,b,b+8,a+8);}
    for(let j=1;j<7;j++)idx.push(0,j+1,j);
    const e=(stations.length-1)*8;for(let j=1;j<7;j++)idx.push(e,e+j,e+j+1);
    surface(v,idx,bucket,color,true);
  }
  function body(kind) {
    const pickup=kind==='pickup',L=pickup?2.15:1.95,wx=pickup?1.33:1.24,wr=pickup?.37:.305,arch=wr+.052;
    const zs=[-L,-L+.10,-1.8,-1.65,-.66,-.60,0,.66,1.65,1.8,L-.1,L];
    for(const wheel of [-wx,wx]) for(let i=0;i<=(far?4:8);i++)zs.push(wheel+Math.cos(i/(far?4:8)*Math.PI)*arch);
    const unique=[...new Set(zs.filter(z=>z>=-L&&z<=L))].sort((a,b)=>a-b);
    shell(unique.map(z=>{
      let bottom=pickup?.39:.32;
      for(const wheel of [-wx,wx]) if(Math.abs(z-wheel)<arch)bottom=Math.max(bottom,wr+Math.sqrt(arch*arch-(z-wheel)*(z-wheel)));
      const end=Math.max(0,(Math.abs(z)-(L-.4))/.4),width=(pickup?1.82:1.63)-end*(pickup?.13:.18);
      const top=pickup?(z<-.55?1.04:z>1.1?1.10-(z-1.1)*.11:1.12):1.00-Math.max(0,Math.abs(z)-.95)*.14;
      return {z,width,top,bottom};
    }), 'paint', C.paint, pickup?-.60:null);
    // Wheel opening outlines follow the physical arch, with tyre shoulder visible below.
    if(!far)for(const s of [-1,1])for(const z of [-wx,wx]) {
      const pts=[];for(let i=0;i<=12;i++){const a=i/12*Math.PI;pts.push([s*(pickup?.910:.815),wr+Math.sin(a)*arch,z+Math.cos(a)*arch]);}
      line(pts,.019,'paint',C.paint);
    }
  }
  function wheel(kind,side,z) {
    const pickup=kind==='pickup',r=pickup?.37:.305,w=pickup?.245:.20,x=side*(pickup?.790:.713);
    if(far) {cyl(r,w,'rubber',C.rubber,x,r,z,Math.PI/2,8);cyl(r*.61,.027,'trim',C.chrome,x+side*w*.52,r,z,Math.PI/2,8);return;}
    const profile=(far?[[.47,-.5],[.85,-.5],[1,-.27],[1,.27],[.85,.5],[.47,.5],[.47,-.5]]:[[.47,-.48],[.74,-.51],[.92,-.39],[.985,-.20],[1,0],[.985,.20],[.92,.39],[.74,.51],[.47,.48],[.47,-.48]]).map(([a,b])=>new T.Vector2(a*r,b*w));
    add(new T.LatheGeometry(profile,far?12:24),'rubber',C.rubber,x,r,z,0,0,Math.PI/2);
    const outer=x+side*w*.47;cyl(r*.61,.025,'trim',C.chrome,outer,r,z,Math.PI/2,far?10:20);
    cyl(r*.23,.030,'trim',C.chrome,outer+side*.015,r,z,Math.PI/2,far?8:12);
    if(far)return;
    for(let i=0;i<6;i++) {
      const a=i*Math.PI/3,ry=r+Math.cos(a)*r*.4,rz=z+Math.sin(a)*r*.4;
      // Dark recessed vents lie on each dished rim, between six metal spokes.
      box(.007,r*.19,r*.23,'rubber',0x303639,outer+side*.014,ry,rz,a);
      cyl(.016,.014,'trim',0xd7dcde,outer+side*.036,r+Math.cos(a)*r*.17,z+Math.sin(a)*r*.17,Math.PI/2,6);
    }
    for(let i=0;i<20;i++) {
      const a=i/20*Math.PI*2;
      for(const lane of [-1,1])box(w*.39,r*.10,.014,'rubber',0x222628,x+lane*w*.23,r+Math.cos(a)*r*.949,z+Math.sin(a)*r*.949,a,lane*.22);
    }
  }
  function cab(kind) {
    const pickup=kind==='pickup',bottom=pickup?1.10:.98,top=pickup?1.79:1.412,
      lowW=pickup?1.65:1.53,topW=pickup?1.42:1.22,
      rearBottom=pickup?-.60:-1.04,rearTop=pickup?-.50:-.60,frontBottom=pickup?1.11:.98,frontTop=pickup?.73:.39;
    // A closed trapezoid cabin: continuous dark glazing, roof and raised pillars.
    const v=[[-lowW/2,bottom,rearBottom],[lowW/2,bottom,rearBottom],[lowW/2,bottom,frontBottom],[-lowW/2,bottom,frontBottom],[-topW/2,top,rearTop],[topW/2,top,rearTop],[topW/2,top,frontTop],[-topW/2,top,frontTop]];
    surface(v,[0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0],'glass',C.glass);
    panel(topW+.045,.07,frontTop-rearTop+.09,'paint',C.paint,0,top,(frontTop+rearTop)/2,0,0,0,.08);
    for(const s of [-1,1]) {
      const n=.016;
      line([[s*(lowW/2+n),bottom,frontBottom],[s*(topW/2+n),top,frontTop]],far?.025:.027,'paint',C.paint);
      line([[s*(lowW/2+n),bottom,rearBottom],[s*(topW/2+n),top,rearTop]],far?.03:.04,'paint',C.paint);
      line([[s*(topW/2+n),top,rearTop],[s*(topW/2+n),top,frontTop]],.025,'paint',C.paint);
      const pillarZ=pickup?.20:-.10;
      line([[s*(lowW/2+.015),bottom,pillarZ],[s*(topW/2+.015),top,pillarZ]],far?.027:.027,'rubber',C.black);
      if(!far) {
        // Mirror stalks and housings stay within the original collision width.
        const mx=s*(pickup?.922:.822),mz=pickup?.89:.75;
        line([[s*(lowW/2),bottom+.12,mz],[mx,bottom+.15,mz]],.018,'rubber',C.black);
        panel(.046,.105,.165,'rubber',C.black,mx,bottom+.18,mz,0,0,0,.02);
        panel(.008,.065,.117,'trim',0x85959e,mx+s*.024,bottom+.18,mz-.009,0,0,0,.015);
        // Beltline trim and door seams; these do not alter the silhouette.
        line([[s*(pickup?.906:.812),bottom-.035,rearBottom],[s*(pickup?.906:.812),bottom-.035,frontBottom]],.009,'trim',0x859094);
        for(const dz of [rearBottom+.09,pillarZ+.035,frontBottom-.055])line([[s*(pickup?.913:.816),bottom-.055,dz],[s*(pickup?.91:.81),pickup?.52:.41,dz]],.005,'rubber',0x383c3e);
        for(const hz of [pillarZ-.19,frontBottom-.28]) panel(.015,.033,.105,'trim',C.chrome,s*(pickup?.917:.818),bottom-.12,hz,0,0,0,.012);
      }
    }
    if(!far) {
      // Curved windshield seal and wiper arms add readable scale at eye level.
      for(const z of [rearBottom,frontBottom])line([[-lowW*.46,bottom+.017,z],[0,bottom+.008,z+.015],[lowW*.46,bottom+.017,z]],.012,'rubber',C.black);
      for(const x of [-.33,.23])line([[x,bottom+.032,frontBottom+.013],[x-.2,bottom+.075,frontBottom-.036]],.009,'rubber',C.black);
    }
  }
  function details(kind) {
    const pickup=kind==='pickup',w=pickup?1.82:1.6,L=pickup?2.2:2, bumperY=pickup?.52:.39;
    panel(w,pickup?.18:.18,.12,pickup?'trim':'paint',pickup?0x8c979d:C.paint,0,bumperY,L-.06,0,0,0,.045);
    panel(w-.05,.17,.12,pickup?'trim':'paint',pickup?0x8c979d:C.paint,0,bumperY,-L+.06,0,0,0,.045);
    panel(pickup?.87:.99,pickup?.29:.22,.025,'rubber',C.black,0,pickup?.86:.62,L-.04,0,0,0,.055);
    panel(w-.14,.057,.065,'rubber',0x252a2d,0,bumperY-.084,L-.064,0,0,0,.02);
    for(const s of [-1,1]) {
      if(pickup)panel(.32,.21,.028,'trim',C.white,s*.68,.90,L-.047,0,s*.04,0,.05);
      else {
        const lens=[[s*.38,.797,L-.015],[s*.741,.77,L-.038],[s*.748,.865,L-.065],[s*.40,.872,L-.018]];if(s<0)lens.reverse();quad(lens,'trim',C.white);
        if(!far)line([[s*.405,.811,L-.010],[s*.695,.797,L-.029],[s*.725,.850,L-.039]],.009,'trim',0xecf0f1);
      }
      panel(pickup?.12:.24,pickup?.36:.113,.035,'trim',C.red,s*(pickup?.81:.64),pickup?.83:.81,-L+.052,0,s*-.12,0,.025);
      if(!far)panel(.045,.12,.036,'trim',C.amber,s*(pickup?.83:.746),pickup?.9:.81,L-.053,0,0,0,.012);
    }
    if(!far) {
      for(let i=0;i<(pickup?4:3);i++)box(pickup?.76:.80,.014,.035,'trim',0x889297,0,(pickup?.755:.58)+i*.062,L-.021);
      panel(.115,.052,.04,'trim',0xc9d1d4,0,pickup?.855:.65,L-.023,0,0,0,.012);
      for(const z of [-L+.009,L-.009])panel(.28,.106,.010,'trim',0xb8bfb9,0,bumperY+.025,z,0,0,0,.006);
      for(const s of [-1,1]) {
        panel(.082,.045,pickup?1.71:1.30,'rubber',0x2b3032,s*(pickup?.909:.795),pickup?.34:.286,0,0,0,0,.02);
        add(new T.CylinderGeometry(.034,.034,.17,12),'trim',0x777f84,s*.64,.28,-L+.145,Math.PI/2);
      }
    }
    if(pickup) {
      // Genuine recessed cargo bed: separate liner, rails, wheel tubs and tailgate.
      panel(1.52,.035,1.45,'rubber',0x242a2d,0,.73,-1.35,0,0,0,.025);
      for(const s of [-1,1]) {
        panel(.12,.38,1.57,'paint',C.paint,s*.842,.865,-1.345,0,0,0,.04);
        panel(.134,.033,1.57,'rubber',0x30373b,s*.842,1.065,-1.345,0,0,0,.012);
        if(!far)panel(.15,.175,.57,'rubber',0x303639,s*.696,.80,-1.33,0,0,0,.05);
      }
      panel(1.61,.33,.09,'paint',C.paint,0,.87,-2.075,0,0,0,.035);
      if(!far) {
        panel(.25,.054,.015,'rubber',0x252b2e,0,1.005,-2.126,0,0,0,.012);
        for(let i=-5;i<=5;i++)box(.023,.017,1.30,'rubber',0x3e4549,i*.12,.754,-1.33);
        panel(.45,.025,.024,'trim',C.red,0,1.73,-.55,0,0,0,.008);
      }
    } else if(!far) {
      // Subtle bonnet and trunk shutlines follow their tapered surfaces.
      for(const s of [-1,1])line([[s*.58,.98,.97],[s*.59,.905,1.50],[s*.55,.887,1.72]],.004,'rubber',0x42484c);
      line([[-.62,.891,-1.70],[0,.911,-1.58],[.62,.891,-1.70]],.004,'rubber',0x42484c);
      panel(.45,.018,.04,'trim',C.red,0,1.02,-1.07,0,0,0,.008);
    }
  }
  function finish() {
    const buckets=new Map();for(const p of parts){if(!buckets.has(p.bucket))buckets.set(p.bucket,[]);buckets.get(p.bucket).push(p);}
    const result=[];
    for(const [bucket,items] of buckets) {
      const all=items.map(p=>{const g=p.g.index?p.g.toNonIndexed():p.g;if(g!==p.g)p.g.dispose();return {...p,g};});
      const count=all.reduce((sum,p)=>sum+p.g.attributes.position.count,0),position=new Float32Array(count*3),normal=new Float32Array(count*3),color=new Float32Array(count*3);
      let offset=0;for(const p of all){position.set(p.g.attributes.position.array,offset*3);normal.set(p.g.attributes.normal.array,offset*3);const c=new T.Color(p.color);for(let i=0;i<p.g.attributes.position.count;i++)c.toArray(color,(offset+i)*3);offset+=p.g.attributes.position.count;p.g.dispose();}
      const g=new T.BufferGeometry();for(const [name,a]of [['position',position],['normal',normal],['color',color]])g.setAttribute(name,new T.BufferAttribute(a,3));g.computeBoundingBox();g.computeBoundingSphere();result.push({bucket,geometry:g,material:cache(T).materials[bucket]});
    }
    return result;
  }
  return {body,cab,details,wheel,finish};
}
function template(T,kind,detail) {
  if(!VEHICLE_SPECS[kind])throw new Error(`Unknown parked vehicle kind: ${kind}`);
  const c=cache(T),key=`${kind}:${detail}`;if(c.templates.has(key))return c.templates.get(key);
  const b=builder(T,detail);b.body(kind);b.cab(kind);b.details(kind);const z=VEHICLE_SPECS[kind].wheelbase/2;for(const side of[-1,1])for(const axle of[-z,z])b.wheel(kind,side,axle);
  const value=b.finish();c.templates.set(key,value);return value;
}
function protect(root) {root.traverse(o=>o.userData.noBake=true);return root;}
/** Individual gallery/model use. Geometry is shared; only body material is per instance. */
export function createParkedVehicleModel({THREE,kind='pickup',color=0x8a1a1a,detail='near'}={}) {
  const root=new THREE.Group();root.name=`Detailed parked ${kind} (${detail})`;const owned=[];
  for(const part of template(THREE,kind,detail)) {let material=part.material;if(part.bucket==='paint'){material=material.clone();material.color.set(color);owned.push(material);}const m=new THREE.Mesh(part.geometry,material);m.name=part.bucket;m.castShadow=detail==='near';m.receiveShadow=true;root.add(m);}
  root.userData.vehicleKind=kind;root.userData.detail=detail;root.userData.dispose=()=>owned.forEach(m=>m.dispose());root.userData.inspect=()=>({kind,detail,drawCalls:root.children.length,triangles:root.children.reduce((s,m)=>s+m.geometry.attributes.position.count/3,0)});return protect(root);
}
/** Standalone automatic LOD, for reuse outside the instanced game fleet. */
export function createParkedVehicleLod(options={}) {
  const root=new options.THREE.LOD();root.name=`Parked ${options.kind||'pickup'} LOD`;root.addLevel(createParkedVehicleModel({...options,detail:'near'}),0);root.addLevel(createParkedVehicleModel({...options,detail:'far'}),options.nearDistance??25,.10);root.userData.dispose=()=>root.levels.forEach(l=>l.object.userData.dispose());return protect(root);
}
/**
 * Whole-site batching: <= 12 render calls (4 materials × 2 near styles + 2 × 2 far).
 * No rigid bodies here: existing row collision remains authoritative. Placements are
 * {kind:'pickup'|'sedan',x,z,y?:0,yaw?:0,color?:hex}. Call update(player.position)
 * once per game tick; distances are checked at most four times per second.
 */
export function createParkedVehicleFleet({THREE,scene,placements=[],nearDistance=25,farDistance=150,maxNearVehicles=10,updateInterval=.25,clock=()=>performance.now()/1000}={}) {
  const root=new THREE.Group();root.name='Instanced parked fleet';root.userData.noBake=true;const batches=[],objects=[];
  const list=placements.map((p,i)=>{if(!VEHICLE_SPECS[p.kind])throw new Error(`Placement ${i} has invalid vehicle kind`);for(const k of['x','z'])if(!Number.isFinite(p[k]))throw new Error(`Placement ${i} has invalid ${k}`);return {...p,y:p.y??0,yaw:p.yaw??0,color:p.color??0x8a1a1a,lod:null};});
  for(const kind of Object.keys(VEHICLE_SPECS))for(const detail of['near','far']) {
    const capacity=list.filter(p=>p.kind===kind).length;if(!capacity)continue;
    const parts=template(THREE,kind,detail).map(p=>{const mesh=new THREE.InstancedMesh(p.geometry,p.material,capacity);mesh.name=`${kind} ${detail} ${p.bucket}`;mesh.count=0;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.castShadow=detail==='near';mesh.receiveShadow=true;mesh.userData.noBake=true;root.add(mesh);return {mesh,bucket:p.bucket};});
    batches.push({kind,detail,parts,capacity});objects.push(...parts.map(p=>p.mesh));
  }
  scene?.add(root);const matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion(),axis=new THREE.Vector3(0,1,0),one=new THREE.Vector3(1,1,1),position=new THREE.Vector3(),tint=new THREE.Color();let last=-Infinity,disposed=false;
  const stats={placements:list.length,near:0,far:0,culled:list.length,drawCalls:0,triangles:0,updates:0};
  function update(view,force=false) {
    if(disposed||!view||!Number.isFinite(view.x)||!Number.isFinite(view.z))return false;
    const now=clock();if(!force&&now-last<updateInterval)return false;last=now;stats.near=0;stats.far=0;stats.culled=0;
    const nearby=[];
    for(const p of list){const d=Math.hypot(p.x-view.x,p.z-view.z),nearLimit=nearDistance*(p.lod==='near'?1.10:1);p.lod=d>farDistance?null:'far';if(d<nearLimit&&p.lod)nearby.push({p,d});}
    nearby.sort((a,b)=>a.d-b.d);for(const {p}of nearby.slice(0,Math.max(0,maxNearVehicles)))p.lod='near';
    for(const p of list)p.lod?stats[p.lod]++:stats.culled++;
    stats.drawCalls=0;stats.triangles=0;
    for(const b of batches) {
      const selected=list.filter(p=>p.kind===b.kind&&p.lod===b.detail);
      for(let i=0;i<selected.length;i++){const p=selected[i];matrix.compose(position.set(p.x,p.y,p.z),rotation.setFromAxisAngle(axis,p.yaw),one);for(const part of b.parts){part.mesh.setMatrixAt(i,matrix);if(part.bucket==='paint')part.mesh.setColorAt(i,tint.set(p.color));}}
      for(const {mesh}of b.parts){mesh.count=selected.length;mesh.visible=mesh.count>0;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;if(mesh.count){mesh.computeBoundingBox();mesh.computeBoundingSphere();stats.drawCalls++;stats.triangles+=mesh.geometry.attributes.position.count/3*mesh.count;}}
    }
    stats.updates++;return true;
  }
  const api={root,update,inspect:()=>({...stats,nearDistance,farDistance,maxNearVehicles,uniqueGeometryCount:objects.length}),getPlacements:()=>list.map(({lod,...p})=>({...p,lod})),dispose(){if(disposed)return;disposed=true;root.removeFromParent();for(const o of objects)o.dispose();root.clear();}};
  root.userData.inspect=api.inspect;root.userData.dispose=api.dispose;return api;
}
/** Release shared buffers/materials only once every fleet/model using this THREE is removed. */
export function disposeSharedParkedVehicleResources(THREE) {const c=caches.get(THREE);if(!c)return;for(const parts of c.templates.values())for(const p of parts)p.geometry.dispose();for(const m of Object.values(c.materials))m.dispose();caches.delete(THREE);}
