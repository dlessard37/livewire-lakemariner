// Resolve against the same solid wall segments that build the scene and collision map.
export function resolveWallMount(surfaces, {axis, plane, along, height, width=.3, depth=.1, normal=1, edge=.3}) {
  const candidates=surfaces.filter(w=>w.axis===axis&&Math.abs(w.plane-plane)<.02&&w.hi-w.lo>=width+edge*2&&height>0&&height< w.height);
  if(!candidates.length)throw new Error(`No supporting ${axis} wall at ${plane}`);
  let best=null;
  for(const wall of candidates){
    const at=Math.max(wall.lo+width/2+edge,Math.min(wall.hi-width/2-edge,along));
    const distance=Math.abs(at-along);
    if(!best||distance<best.distance)best={wall,at,distance};
  }
  const surface=plane+normal*best.wall.thickness/2;
  const offset=surface+normal*(depth/2+.003);
  return {...best,axis,normal,height,width,depth,surface,x:axis==='x'?offset:best.at,z:axis==='z'?offset:best.at,yaw:axis==='x'?normal*Math.PI/2:normal===1?0:Math.PI};
}
export function auditWallMount(mount){
  const {wall,at,width,depth,axis,surface,normal}=mount;
  return at-width/2>=wall.lo+.29&&at+width/2<=wall.hi-.29&&Math.abs((mount[axis]-surface)*normal-depth/2-.003)<.00001;
}
