// Manual trace of the user supplied DroneDeploy aerial dated 2026-06-26.
// These are relationship/footprint guides, not a survey or an interior plan.
export const SITE_BOUNDS = Object.freeze({minx:-640,maxx:300,minz:-170,maxz:221.5});
export const BONUS_COURSE = Object.freeze({x:-530,z:-128});
export const REFERENCE = Object.freeze({width:800,height:411,date:'2026-06-26',cb4:[493,46,560,246]});
// Circular tanks fitted to CB4's compressed N–S scale; these are not survey sizes.
// The wider X collider also covers the west-side ladder. Keep the traced centers.
export const TANK_PROFILE = Object.freeze({bodyRadius:4.25,rimRadius:4.30,bandRadius:4.34,
  padW:9.4,padD:9.4,ladderOffset:4.45,rungOffset:4.57,colliderW:9.5,colliderD:8.9,height:8.4});
const TANK_CENTERS = Object.freeze([[429,162],[429,182]]);
// These aerial text-label anchors do not establish roof envelopes or entrances.
const SMALL_STRUCTURES = Object.freeze([
  {id:'DEN',label:'WULF DEN',anchorPx:[336,141],w:13,d:6,height:4.2},
  {id:'ORIENTATION',label:'SAFETY ORIENTATION',anchorPx:[392,20],w:15,d:5,height:3}
]);
export const FOOTPRINTS = Object.freeze([
  {id:'CB4',label:'CB4',kind:'playable',px:[493,46,560,246],height:8.1},
  {id:'CB5',label:'CB5',kind:'compute',px:[623,49,686,244],height:9.1},
  {id:'CB3',label:'CB3',kind:'compute',px:[297,257,431,304],height:8},
  {id:'CB2',label:'CB2',kind:'compute',px:[148,260,244,294],height:7.4},
  {id:'CB1',label:'CB1',kind:'compute',px:[191,214,261,248],height:7.4},
  {id:'MB1',label:'MB1',kind:'mining',px:[374,43,394,125],height:7.2},
  {id:'MB2',label:'MB2',kind:'mining',px:[359,157,389,242],height:7.2},
  {id:'MB4',label:'MB4',kind:'mining',px:[308,158,336,242],height:7.2},
  {id:'MINING_NW',label:'MINING',kind:'mining',px:[281,62,330,96],height:6.8,labelConfidence:'digit unclear in low-resolution source'},
  {id:'PLANT',label:'SOMERSET STATION',kind:'legacy',px:[175,89,253,205],height:24,confidence:'cluster envelope; constituent roof shapes approximated'},
  {id:'PONDS',label:'PONDS',kind:'ponds',px:[9,149,86,261],height:0,confidence:'visible western pond cells; use is not inferred'},
  {id:'SUBSTATION',label:'SUBSTATION',kind:'substation',px:[622,275,732,347],height:0,confidence:'construction yard envelope'},
  {id:'CONTRACTOR_PARKING',label:'CONTRACTOR PARKING',kind:'parking',px:[470,254,559,294],height:0},
  {id:'PARKING5',label:'PARKING 5',kind:'parking',px:[101,58,194,120],height:0,confidence:'approximate lot extent'},
  {id:'PARKING3',label:'PARKING 3',kind:'parking',px:[4,272,84,330],height:0,confidence:'cropped lot extent'},
  {id:'PARKING4',label:'PARKING 4',kind:'parking',px:[339,380,486,410],height:0,confidence:'cropped lot extent'}
]);
export function createSiteLayout(CB={west:-48,east:28,z0:52,z1:151.5}) {
  const [u0,v0,u1,v1]=REFERENCE.cb4;
  const sx=(CB.east-CB.west)/(u1-u0),sz=(CB.z1-CB.z0)/(v1-v0);
  const point=(u,v)=>({x:CB.west+(u-u0)*sx,z:CB.z0+(v1-v)*sz});
  const features=FOOTPRINTS.map(f=>{
    const a=point(f.px[0],f.px[3]),b=point(f.px[2],f.px[1]);
    return {...f,minx:a.x,maxx:b.x,minz:a.z,maxz:b.z,x:(a.x+b.x)/2,z:(a.z+b.z)/2,w:b.x-a.x,d:b.z-a.z};
  });
  const byId=Object.fromEntries(features.map(f=>[f.id,f]));
  const smallStructures=SMALL_STRUCTURES.map(f=>({...f,...point(...f.anchorPx),kind:'other',
    confidence:'provisional annotation anchor; representative envelope; entrance unknown'}));
  const tanks=TANK_CENTERS.map((anchorPx,i)=>({id:`TANK_${i+1}`,label:`TANK ${i+1}`,anchorPx,
    ...point(...anchorPx),...TANK_PROFILE,referenceRadiusPx:9,
    confidence:'visible aerial center; source roof radius approximate; game dimensions fitted to compressed scale'}));
  const contains=(f,x,z,pad=0)=>x>=f.minx-pad&&x<=f.maxx+pad&&z>=f.minz-pad&&z<=f.maxz+pad;
  const buildingAt=(x,z)=>features.find(f=>['compute','mining','legacy'].includes(f.kind)&&contains(f,x,z));
  const zoneAt=(x,z)=>{
    if(contains(byId.CB4,x,z))return null;
    if(x>BONUS_COURSE.x-36&&x<BONUS_COURSE.x+40&&z>BONUS_COURSE.z-18&&z<BONUS_COURSE.z+112)return 'SXS COURSE · BONUS AREA';
    const f=features.find(f=>f.id!=='CB4'&&contains(f,x,z,1));
    return f?.label||null;
  };
  return {features,byId,point,contains,buildingAt,zoneAt,sx,sz,bounds:SITE_BOUNDS,smallStructures,tanks,
    laydown:{x:38,z:33},den:point(336,141),orientation:point(392,20),
    // The approved playable CB4 interior has compressed N–S depth. Preserve it;
    // rebuild exterior footprints using this documented anisotropic guide.
    calibration:'CB4 anchored, +X east, +Z north; relative map layout, not survey metres'};
}
