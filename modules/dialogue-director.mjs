const normalize=text=>String(text||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();

/** One conversational channel shared by nearby crew, the player and the radio.
 * Audio completion owns the channel; callers offer candidates, not interruptions.
 */
export function createDialogueDirector({now=()=>performance.now()/1000,random=Math.random,onStart,canPlay=()=>true}={}) {
  const queue=new Map(),heard=new Map(),speakers=new Map();
  let paused=false,suspended=null;
  let active=null,sequence=0,nextAmbient=0,endedAt=-Infinity,started=0,finished=0,expired=0;
  function priority(item){return item.priority??(item.kind==='ambient'?0:2);}
  function eligible(item,t){try{return item.expires>t&&(!item.valid||item.valid());}catch{return false;}}
  function offer(input){
    if(!input?.speaker)return false;
    const lines=[...new Set((input.lines||[input.text]).filter(t=>typeof t==='string'&&t.trim()))];
    if(!lines.length)return false;
    const t=now(),kind=input.kind||'ambient';
    // Ambient belongs to a speaker, even when radio and nearby callers supply different keys.
    const key=kind==='ambient'?`ambient:${input.speaker}`:`event:${input.speaker}:${input.key||normalize(lines[0])}`;
    if(active?.key===key&&kind!=='ambient')return false;
    const prior=queue.get(key),item={...input,lines,kind,key,order:prior?.order??sequence++,queuedAt:prior?.queuedAt??t,expires:t+(input.ttl??(kind==='ambient'?12:30))};
    if(!eligible(item,t))return false;
    if(!prior&&queue.size>=24){const removable=[...queue.values()].filter(i=>i.kind==='ambient').sort((a,b)=>a.queuedAt-b.queuedAt)[0];if(removable)queue.delete(removable.key);else return false;}
    queue.set(key,item);return true;
  }
  function selectLine(item,t){
    const cooldown=item.repeatSeconds??(item.kind==='ambient'?140:10);
    const available=item.lines.filter(line=>t-(heard.get(normalize(line))??-Infinity)>=cooldown);
    if(!available.length)return null;
    const oldest=Math.min(...available.map(line=>heard.get(normalize(line))??-Infinity));
    const fresh=available.filter(line=>(heard.get(normalize(line))??-Infinity)===oldest);
    return fresh[Math.min(fresh.length-1,Math.floor(random()*fresh.length))];
  }
  function complete(token,{cancelled=false}={}){
    if(active!==token)return;
    active=null;endedAt=now();nextAmbient=endedAt+2.4+random()*1.6;finished++;
    if(cancelled)try{token.cancel?.();}catch{}
    try{token.item.onFinish?.();}catch{}
  }
  function tick(){
    if(paused)return;
    const t=now();
    for(const[key,item]of queue)if(!eligible(item,t)){queue.delete(key);expired++;}
    // Release a stalled old clip even while new playback is disallowed.
    if(active){if(t>active.deadline)complete(active,{cancelled:true});else return;}
    if(!canPlay())return;
    const candidates=[...queue.values()].filter(item=>{
      if(item.kind==='ambient'&&(t<nextAmbient||t-(speakers.get(item.speaker)??-Infinity)<16))return false;
      if(item.kind!=='ambient'&&t<endedAt+.35)return false;
      return !!selectLine(item,t);
    }).sort((a,b)=>(a.kind==='ambient')-(b.kind==='ambient')||priority(b)-priority(a)||(speakers.get(a.speaker)??-1e12)-(speakers.get(b.speaker)??-1e12)||a.order-b.order);
    const item=candidates[0];if(!item)return;
    const text=selectLine(item,t);queue.delete(item.key);
    const token={key:item.key,item:{...item,text},startedAt:t,deadline:t+30,cancel:null};active=token;
    heard.set(normalize(text),t);speakers.set(item.speaker,t);started++;
    // Bound a long session's history while retaining every repeat window.
    if(heard.size>512)for(const[k,when]of heard)if(t-when>600)heard.delete(k);
    const done=()=>complete(token);
    done.extend=seconds=>{if(active===token)token.deadline=now()+Math.max(1,Math.min(90,seconds));};
    try{const cancel=onStart?.(token.item,done);if(active===token)token.cancel=cancel;}catch{complete(token,{cancelled:true});}
  }
  function clear({keepHistory=true}={}){queue.clear();suspended=null;if(active)complete(active,{cancelled:true});if(!keepHistory){heard.clear();speakers.clear();}nextAmbient=now()+2.4;}
  function pause(){if(paused)return;paused=true;if(active){suspended=active;active=null;try{suspended.cancel?.();}catch{}}}
  function resume(){if(!paused)return;paused=false;if(suspended){const prior=suspended;suspended=null;const token={...prior,deadline:now()+30,cancel:null};active=token;const done=()=>complete(token);done.extend=seconds=>{if(active===token)token.deadline=now()+Math.max(1,Math.min(90,seconds));};try{token.cancel=onStart?.(token.item,done);}catch{complete(token,{cancelled:true});}}}
  return {offer,tick,clear,pause,resume,inspect:()=>({paused,suspended:suspended?{speaker:suspended.item.speaker,text:suspended.item.text}:null,active:active?{speaker:active.item.speaker,text:active.item.text,kind:active.item.kind,startedAt:active.startedAt}:null,queued:[...queue.values()].map(i=>({speaker:i.speaker,kind:i.kind,choices:i.lines.length})),started,finished,expired,rememberedLines:heard.size,speakerCooldown:16,repeatCooldown:140})};
}
