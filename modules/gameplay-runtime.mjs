import { SITE_BOUNDS } from './site-layout.mjs';
// Pure rules used by the game and its authored regression harness.
export const SCORE_VERSION = 2;
export const SIDE_POINT_CAP = 2000;
export const MAX_RUN_POINTS = 1_000_000;
export const PRESENCE_TTL_MS = 180_000;
export const PRESENCE_FUTURE_MS = 30_000;
export const PRESENCE_ACTIVE_MODES = new Set(['play','pause','end','store','mag','pull','panel','facp','trouble']);
export const PRESENCE_MODES = new Set(['title','race',...PRESENCE_ACTIVE_MODES]);

export function finiteNumber(value, fallback = 0, min = -Infinity, max = Infinity) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max,Math.max(min,n)) : fallback;
}
export function points(value,max=MAX_RUN_POINTS) {return Math.round(finiteNumber(value,0,0,max));}
export function shortText(value, limit = 24) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,limit);
}
export function outcomeLabel({home=false,overtime=0,shocks=0,corrections=0}={}) {
  if(home)return 'YEAR GOAL HIT';
  if(overtime>0)return 'COMPLETED IN OT';
  if(shocks>0||corrections>0)return 'COMPLETED WITH REWORK';
  return 'CLEAN FINISH';
}
export function legacyOutcomeLabel(value) {
  const rank=shortText(value,40).toUpperCase();
  if(['TOP HAND','LEADMAN','JOURNEYMAN'].includes(rank))return 'COMPLETED';
  if(rank==='APPRENTICE')return 'COMPLETED IN OT';
  if(rank==='RED ASS')return 'YEAR GOAL HIT';
  return rank||'—';
}
export function canCompleteTask(state,id,need,jobs) {
  return !state.runSettled && state.mode!=='end' && jobs.some(j=>j.id===id) &&
    Number.isFinite(need) && need>0 && !state.done[id] &&
    finiteNumber(state.progress[id],0,0)<need;
}
export function settleRun(state,success,jobs) {
  if(state.runSettled || state.mode==='end')return false;
  if(success && !jobs.every(j=>state.done[j.id]))return false;
  state.runSettled=true;
  return true;
}
export function awardSidePoints(state,value,key='') {
  if(state.runSettled || state.mode==='end')return 0;
  state.sideAwarded ||= Object.create(null);
  if(key && state.sideAwarded[key])return 0;
  const before=points(state.sidePoints,SIDE_POINT_CAP);
  const award=Math.min(points(value,1000),SIDE_POINT_CAP-before);
  state.sidePoints=before+award;
  if(key)state.sideAwarded[key]=true;
  return award;
}
export function normalizeScoreRecord(input,lastDay) {
  const record=input||{};
  return {name:shortText(record.name,20).toUpperCase(),local:shortText(record.local,8).toUpperCase(),
    pts:points(record.pts),seconds:Math.round(finiteNumber(record.seconds,0,0,86400)),
    rank:shortText(record.rank,40),day:Math.round(finiteNumber(record.day,1,1,lastDay)),
    level:Math.round(finiteNumber(record.level ?? record.day,1,1,lastDay)),
    who:record.who==='tremont'?'tremont':'utah',started:!!record.started};
}
export function presenceIsFresh(row,now=Date.now()) {
  return !!row && Number.isFinite(row.ts) && row.ts>0 && now-row.ts<=PRESENCE_TTL_MS && row.ts-now<=PRESENCE_FUTURE_MS;
}
export function normalizePresence(row,now=Date.now(),lastDay=99) {
  if(!row || !presenceIsFresh(row,now))return null;
  const id=shortText(row.id,80),x=Number(row.x),z=Number(row.z),yaw=Number(row.yaw);
  // Published jobsite physics bounds. Reject invalid coordinates instead of
  // clamping a malicious/old sample into a fake worker standing at the fence.
  if(!id || !/^[A-Za-z0-9_-]+$/.test(id) || ![x,z,yaw].every(Number.isFinite) ||
    x < SITE_BOUNDS.minx || x > SITE_BOUNDS.maxx || z < SITE_BOUNDS.minz || z > SITE_BOUNDS.maxz)return null;
  return {...row,id,name:shortText(row.name,24)||'HAND',who:row.who==='tremont'?'tremont':'utah',
    x,z,yaw:Math.atan2(Math.sin(yaw),Math.cos(yaw)),
    day:Math.round(finiteNumber(row.day,1,1,lastDay)),mode:PRESENCE_MODES.has(row.mode)?row.mode:'title',
    wave:Math.round(finiteNumber(row.wave,0,0,now+PRESENCE_FUTURE_MS))};
}
export function newestPresenceRows(rows,now=Date.now(),lastDay=99) {
  const unique=new Map();
  for(const raw of (rows||[]).slice(0,200)){
    const row=normalizePresence(raw,now,lastDay);if(!row)continue;
    if(!unique.has(row.id)||row.ts>unique.get(row.id).ts)unique.set(row.id,row);
  }
  return [...unique.values()].sort((a,b)=>b.ts-a.ts).slice(0,40);
}
export function stepRemotePose(current,target,delta) {
  const dt=finiteNumber(delta,0,0,.1),dx=target.x-current.x,dz=target.z-current.z,dist=Math.hypot(dx,dz);
  if(![current.x,current.z,current.yaw,target.x,target.z,target.yaw].every(Number.isFinite))
    return {x:0,z:0,yaw:0,speed:0,moving:false,teleported:false};
  const teleported=dist>18;
  const travel=teleported?dist:Math.min(dist*(1-Math.exp(-5*dt)),6*dt);
  const ratio=dist>0?travel/dist:0;
  const turn=Math.atan2(Math.sin(target.yaw-current.yaw),Math.cos(target.yaw-current.yaw));
  const speed=dt>0&&!teleported?Math.min(6,travel/dt):0;
  return {x:current.x+dx*ratio,z:current.z+dz*ratio,
    yaw:teleported?target.yaw:current.yaw+turn*(1-Math.exp(-9*dt)),
    speed,moving:speed>.12,teleported};
}
export function populateRoster(element,document,{name,who,rows=[]}) {
  element.textContent='';
  const mine=document.createElement('span');mine.className='roster-me';
  mine.textContent=`${shortText(name,24)||'YOU'} · ${who==='tremont'?'TREMONT':'UTAH'}`;
  element.appendChild(mine);
  for(const p of rows.slice(0,40)){
    const span=document.createElement('span');
    const mode=p.mode==='play'?'ON SITE':p.mode==='title'?'GATE':p.mode==='race'?'SXS COURSE':shortText(p.mode,12).toUpperCase();
    span.textContent=`${shortText(p.name,24)} · ${p.who==='tremont'?'TREMONT':'UTAH'} · ${mode}`;
    element.appendChild(span);
  }
}
export function disposeNameTag(tag) {
  if(!tag)return;
  tag.parent?.remove(tag);
  for(const m of Array.isArray(tag.material)?tag.material:[tag.material]){
    m?.map?.dispose();m?.dispose();
  }
}
export function sameShiftRow(row,day) {
  const score=row?.dayScores?.[day] || (row?.day===day ? row : null);
  if(!score || !(points(score.pts)>0))return null;
  return {...row,...score,day,pts:points(score.pts)};
}
export function mergeDayScores(a={},b={}) {
  const merged={...a};
  for(const [day,score]of Object.entries(b)){
    const old=merged[day];
    const p=points(score?.pts),oldP=points(old?.pts),sec=finiteNumber(score?.seconds,0,0),oldSec=finiteNumber(old?.seconds,0,0);
    if(!old || p>oldP || (p===oldP&&sec>0&&(oldSec<=0||sec<oldSec)))merged[day]={...score,pts:p,seconds:sec};
  }
  return merged;
}
export function mergePreviewRun(rows,record) {
  const result=(rows||[]).filter(r=>r&&r.name&&r.scoreVersion===SCORE_VERSION);
  if(record.scoreVersion!==SCORE_VERSION)return {rows:result,kept:true,legacy:true};
  const key=r=>`${r.name}|${r.who}|${r.day}`;
  const idx=result.findIndex(r=>key(r)===key(record));
  const old=idx>=0?result[idx]:null;
  const kept=!!old&&(old.pts>record.pts || (old.pts===record.pts&&old.seconds>0&&
    (record.seconds<=0||old.seconds<=record.seconds)));
  if(!kept){
    const entry={...record,dayScores:{[record.day]:{pts:record.pts,seconds:record.seconds,rank:record.rank}}};
    if(idx>=0)result[idx]=entry;else result.push(entry);
  }
  return {rows:result.slice(-120),kept,legacy:false};
}
