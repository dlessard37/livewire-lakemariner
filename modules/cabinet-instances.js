// Shared per-material instance batches, spatially grouped for hall culling.
// Physics proxies remain in the original game layout.
export function createCabinetInstances({THREE, scene, industrial, placements}) {
  const groups = new Map();
  for (const p of placements) {
    const key = `${p.kind}:${Math.floor(p.x/24)}:${Math.floor(p.z/24)}`;
    if (!groups.has(key)) groups.set(key, {kind:p.kind, records:[]});
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(p.x,0,p.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),p.yaw),new THREE.Vector3(1,1,1));
    groups.get(key).records.push({...p, matrix, near:false});
  }
  for (const g of groups.values()) {
    for (const lod of ['near','far']) {
      g[lod] = industrial.createInstances({options:{kind:g.kind,lod}, capacity:g.records.length});
      scene.add(g[lod].group);
    }
  }
  let next = 0;
  return {
    update(position, force=false) {
      const now=performance.now();
      if (!force && now<next) return;
      next=now+250;
      for (const g of groups.values()) {
        let near=0,far=0;
        for (const p of g.records) {
          const distance=Math.hypot(p.x-position.x,p.z-position.z);
          if(distance>100)continue;
          p.near = distance < (p.near ? 21 : 18);
          if (p.near) g.near.setTransform(near++,p.matrix);
          else g.far.setTransform(far++,p.matrix);
        }
        g.near.setCount(near); g.far.setCount(far);
        g.near.group.visible=near>0;g.far.group.visible=far>0;
        g.near.commit(); g.far.commit();
      }
    },
    get count(){return placements.length;},
  };
}
