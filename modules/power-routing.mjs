/** Supported local geometry for power corridors. No tasks, score or cloud state.
 * The gear's front faces +X; a mirrored row rotates its whole group by PI.
 * Shared templates are immutable and intended for the existing static merger.
 */
export function createPowerRouting({THREE,BufferGeometryUtils,materials={}}){
  const steel=materials.tray||new THREE.MeshStandardMaterial({color:0x9aa6af,roughness:.5,metalness:.65});
  const dark=materials.dark||new THREE.MeshStandardMaterial({color:0x303735,roughness:.9,metalness:.05});
  const colors=[materials.copper,materials.orange,materials.greenBus].map((m,i)=>m||new THREE.MeshStandardMaterial({color:[0xa98242,0xc7823d,0x5e7156][i],roughness:.78,metalness:.04}));
  const cache=new Map();
  function build(name,fn){
    const entries=new Map();
    const add=(g,m,at=[0,0,0],rot=[0,0,0])=>{
      const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot));
      g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...at),q,new THREE.Vector3(1,1,1)));
      if(!entries.has(m))entries.set(m,[]);entries.get(m).push(g);
    };
    const b={box:(w,h,d,at,m=steel)=>add(new THREE.BoxGeometry(w,h,d),m,at),
      tube:(points,r,m=colors[0],segments=12)=>add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),false,'centripetal'),segments,r,5,false),m),
      gland:(r,h,at)=>add(new THREE.CylinderGeometry(r,r,h,8),steel,at)};
    fn(b);
    const group=new THREE.Group();group.name=name;
    for(const [m,geos]of entries){
      const merged=BufferGeometryUtils.mergeGeometries(geos,false);if(!merged)throw new Error('Power routing geometry merge failed');
      const mesh=new THREE.Mesh(merged,m);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);geos.forEach(g=>g.dispose());
    }
    return group;
  }
  function feeders({height=6.05,trayOffset=2.44,kind=0}={}){
    const key=`feeders:${height}:${trayOffset}:${kind}`;
    if(!cache.has(key))cache.set(key,build('Gear feeders · connected to ladder tray',b=>{
      const trayY=7.05,cableY=7.12;
      for(const side of [-1,1])b.box(trayOffset+.35,.07,.055,[trayOffset/2-.025,trayY,side*.38]);
      for(let x=.12;x<trayOffset+.17;x+=.36)b.box(.045,.04,.76,[x,trayY+.025,0]);
      // Back-to-back vertical strut supports the cabinet top bend.
      for(const side of [-1,1])b.box(.06,trayY-height,.065,[.04,(height+trayY)/2,side*.38]);
      for(const y of [height+.2,height+.57])b.box(.06,.06,.80,[.04,y,0]);
      // Three readable conductor routes, continuous from gland to longitudinal tray.
      for(let i=0;i<3;i++){
        const z=-.25+i*.25,targetX=trayOffset-.28+i*.09;
        b.gland(.055,.095,[0,height+.05,z]);
        b.tube([[0,height+.05,z],[.025,height+.39,z],[.22,cableY-.08,z],
          [.55,cableY,z],[targetX-.26,cableY,z],[targetX,cableY,z+.19],[targetX,cableY,z+.65]],.026,colors[(i+kind)%3],14);
      }
      // One compact trapeze ties this branch to the overhead structure.
      for(const side of [-1,1])b.box(.025,8-trayY,.025,[trayOffset-.10,(8+trayY)/2,side*.38]);
    }));
    return cache.get(key).clone(true);
  }
  function workDrop(){
    if(!cache.has('workDrop'))cache.set('workDrop',build('Supported feeder preparation · at gear face',b=>{
      // Cable ladder/riser is beside the gear, not an upright bundle in the aisle.
      for(const side of [-1,1])b.box(.07,6.65,.07,[0,3.73,side*.40]);
      for(let y=.6;y<7.05;y+=.48)b.box(.07,.045,.80,[0,y,0]);
      for(const y of [1.0,3.1,5.35])b.box(.24,.07,.84,[-.075,y,0]);
      for(const side of [-1,1])b.box(1.86,.07,.055,[.90,7.05,side*.40]);
      for(let x=.1;x<1.8;x+=.36)b.box(.045,.04,.8,[x,7.075,0]);
      for(let i=0;i<3;i++){
        const z=-.22+i*.22;
        // The small service loop hangs on a support, well above the floor.
        const tx=1.77-.28+i*.09;
        b.tube([[tx,7.12,z+.65],[tx,7.12,z+.19],[tx-.24,7.12,z],[.38,7.12,z],
          [.055,6.8,z],[.055,5.84,z],[.06,4.5,z],[.07,2.5,z],[.11,1.30,z],
          [.16,.90,z+.10],[.18,.83,z+.23],[.16,1.0,z+.34],[.12,1.38,z+.32]],.027,colors[i],26);
        b.box(.14,.10,.09,[.10,1.44,z+.31],dark); // protective end boot
      }
      b.box(.26,.08,1.05,[.14,.75,.12],steel); // service-loop saddle
    }));
    return cache.get('workDrop').clone(true);
  }
  function temporaryPower(){
    if(!cache.has('tempPower'))cache.set('tempPower',build('Supported temporary distribution',b=>{
      b.box(.11,2.2,.11,[0,1.1,0],steel);
      b.box(.42,.05,.54,[0,.025,0],steel);
      for(let i=0;i<3;i++){
        b.box(.16,.25,.16,[.08,1.0+i*.35,0],dark);
        b.box(.045,.08,.11,[.18,1.0+i*.35,0],colors[1]);
      }
      b.tube([[.08,2.12,0],[.07,2.7,0],[.07,4.5,0],[.07,6.8,0],[.35,7.12,0],[1.49,7.12,0],[1.58,7.12,.35]],.021,colors[1],16);
      for(const y of [2.2,3.5,4.9,6.6])b.box(.12,.055,.09,[.035,y,0],steel);
      b.box(.14,6.7,.07,[-.035,3.5,0],steel);
      b.box(1.7,.045,.16,[.78,7.08,0],steel);
    }));
    return cache.get('tempPower').clone(true);
  }
  function hazardEnclosure(){
    if(!cache.has('hazard'))cache.set('hazard',build('Open electrical service enclosure',b=>{
      b.box(.08,1.32,.64,[-.08,.78,0],steel);
      for(const side of [-1,1])b.box(.36,1.32,.055,[.07,.78,side*.32],steel);
      for(const y of [.12,1.44])b.box(.36,.055,.64,[.07,y,0],steel);
      b.box(.04,.9,.46,[-.02,.80,0],dark);
      for(const z of [-.17,0,.17])b.box(.05,.42,.065,[.045,.89,z],colors[0]);
      b.box(.08,.43,.10,[-.08,1.68,0],steel);
    }));
    return cache.get('hazard').clone(true);
  }
  return {feeders,workDrop,temporaryPower,hazardEnclosure};
}

export function powerServicePosition(CB,side,z){
  // Cabinets project ~1.07 m from each wall. All added low work stays inside
  // the next 0.6 m strip, preserving the centered through route.
  return side==='west'?{x:CB.elecW0+1.23,z,yaw:0,normal:1,hallX:CB.elecWX}
    :{x:CB.elecE1-1.23,z,yaw:Math.PI,normal:-1,hallX:CB.elecEX};
}

export function auditPowerAisles({CB,colliders=[],sparks=[]}){
  const hits=[];
  for(const x of [CB.elecWX,CB.elecEX])for(let z=CB.z0+.7;z<CB.z1-.7;z+=.5){
    const b=colliders.find(b=>b.y<1.78&&b.y+b.h>.10&&x+.43>b.minx&&x-.43<b.maxx&&z+.43>b.minz&&z-.43<b.maxz);
    if(b)hits.push({x,z,collider:{...b}});
  }
  const centerHazards=sparks.filter(s=>Math.min(Math.abs(s.x-CB.elecWX),Math.abs(s.x-CB.elecEX))<.85);
  return {clear:!hits.length&&!centerHazards.length,blockedSamples:hits.length,examples:hits.slice(0,8),centerHazards:centerHazards.length};
}
