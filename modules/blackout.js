// Generator failure extinguishes incidental scenery lights as well as the main
// hall rig. Keep physical surfaces available for the player's actual headlamp.
export function createBlackout(THREE,scene) {
  let active=false;
  const lights=new Map(),emission=new Map(),unlit=new Map();
  function restore(){
    if(!active)return;
    for(const[o,value]of lights)o.visible=value;
    for(const[m,value]of emission)m.emissiveIntensity=value;
    for(const[m,color]of unlit)m.color.copy(color);
    lights.clear();emission.clear();unlit.clear();active=false;
  }
  return {
    set(dead,headlamp){
      if(!dead){restore();return;}
      if(!active)scene.traverse(o=>{
        if(o.isLight&&o!==headlamp)lights.set(o,o.visible);
        if(!o.isMesh||!o.material)return;
        for(const m of Array.isArray(o.material)?o.material:[o.material]){
          if(m.emissive&&!emission.has(m))emission.set(m,m.emissiveIntensity);
          if(m.isMeshBasicMaterial&&m.color&&!unlit.has(m))unlit.set(m,m.color.clone());
        }
      });
      active=true;
      for(const o of lights.keys())o.visible=false;
      for(const m of emission.keys())m.emissiveIntensity=0;
      for(const m of unlit.keys())m.color.setHex(0);
    },
    restore,
    get active(){return active;},
  };
}
