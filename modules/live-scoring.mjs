// Existing hands schema, isolated work-point season; legacy IDs are uppercase
// alphanumeric/underscore and can never collide with this reserved prefix.
export const WORK_DOC_PREFIX = 'work2~';
export function workScoreDocumentId(handId){return WORK_DOC_PREFIX+handId;}
const value=f=>Math.max(0,Number(f?.integerValue??f?.doubleValue??f?.stringValue??0)||0);
export function submittedDayIsSaved(rec,fields,lastDay=99){
  if(!fields)return false;
  const key='d'+rec.day,got=value(fields[key+'pts']),want=Math.max(0,Number(rec.pts)||0);
  const sec=value(fields[key+'sec']),wantedSec=Math.max(0,Number(rec.seconds)||0);
  if(!fields[key+'pts']||got<want)return false;
  if(got===want&&wantedSec>0&&(!(sec>0)||sec>wantedSec))return false;
  if(want>0&&(!fields[key+'rank']?.stringValue||fields[key+'rank'].stringValue==='ON SITE'))return false;
  return value(fields.bestDay)>=Math.min(lastDay,Math.max(rec.day||1,rec.level||1));
}
export function liveBoardQuery(collectionId,limit,docs){
  const structuredQuery={from:[{collectionId}],limit};
  if(collectionId==='hands'){
    const prefix=docs.replace(/^https:\/\/firestore\.googleapis\.com\/v1\//,'')+'/hands/'+WORK_DOC_PREFIX;
    structuredQuery.where={compositeFilter:{op:'AND',filters:[
      {fieldFilter:{field:{fieldPath:'__name__'},op:'GREATER_THAN_OR_EQUAL',value:{referenceValue:prefix}}},
      {fieldFilter:{field:{fieldPath:'__name__'},op:'LESS_THAN',value:{referenceValue:prefix+'\uf8ff'}}}
    ]}};
    structuredQuery.orderBy=[{field:{fieldPath:'__name__'},direction:'ASCENDING'}];
  }
  return {structuredQuery};
}
export function scoreSaveMessage(result){
  if(result.legacy)return 'LEGACY SHIFT FINISHED · PREVIOUS RECORDS KEPT · START A NEW SHIFT FOR THE WORK BOARD';
  if(result.down)return result.queued?'SCORE SAVED ON THIS DEVICE · WAITING TO RECONNECT':
    result.local?'DEVICE STORAGE IS FULL — SCORE NOT SAVED':'SCORE NOT SAVED — KEEP THIS SCREEN OPEN AND RETRY';
  if(result.local)return 'WORK SCORE SAVED ON THIS DEVICE';
  return result.kept?'BOARD ALREADY HAS YOUR BEST':'POSTED TO THE CLOUD BOARD';
}
export async function postLiveScore({rec,url,fsFetch,scoreFields,cloudNeedsWrite,queuePending,unqueuePending,invalidateBoard,lastDay,
  pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),attempts=4,timeout=8000}){
  const queued=queuePending(rec)===true;
  async function request(target,options){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
    try{return await fsFetch(target,{...options,signal:controller.signal},true);}finally{clearTimeout(timer);}
  }
  const done=(kept,fields)=>{unqueuePending(rec);invalidateBoard();return {kept,cloud:true,pts:value(fields.pts),level:value(fields.bestDay)};};
  for(let attempt=0;attempt<attempts;attempt++){
    try{
      const response=await request(url);
      let previous=null,updateTime=null;
      if(response.ok){const doc=await response.json();previous=doc.fields||{};updateTime=doc.updateTime;
        // Do not silently fall back to an unconditional overwrite.
        if(typeof updateTime!=='string'||!updateTime)throw new Error('Missing cloud revision');
      }else if(response.status!==404){if([401,403].includes(response.status))break;throw new Error('Cloud read failed');}
      const fields=scoreFields(rec,previous);
      if(!fields||previous&&!cloudNeedsWrite(fields,previous)){
        if(submittedDayIsSaved(rec,previous,lastDay))return done(true,previous);
        throw new Error('Submitted day is not present');
      }
      const mask=Object.keys(fields).map(k=>'updateMask.fieldPaths='+encodeURIComponent(k)).join('&');
      const condition=previous?'currentDocument.updateTime='+encodeURIComponent(updateTime):'currentDocument.exists=false';
      const write=await request(url+'&'+mask+'&'+condition,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({fields})});
      if(!write.ok){if([401,403].includes(write.status))break;throw new Error('Write conflict or cloud failure');}
      const verification=await request(url);
      if(verification.ok){const doc=await verification.json();if(submittedDayIsSaved(rec,doc.fields,lastDay))return done(false,doc.fields);}
    }catch(_){}
    if(attempt+1<attempts)await pause(180*(attempt+1));
  }
  return {kept:false,cloud:false,down:true,queued};
}
