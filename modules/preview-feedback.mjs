// Device-local review requests. Native IndexedDB preserves actual photo/audio
// blobs without uploading them, exposing them as data URLs, or discarding them.
export function createPreviewFeedback({indexedDB=globalThis.indexedDB,URL=globalThis.URL,
  dbName='livewire-preview-feedback-v1'}={}) {
  let dbPromise,urls=[];
  function db(){
    if(!indexedDB)return Promise.reject(new Error('This browser cannot save requests on this device.'));
    return dbPromise ||= new Promise((resolve,reject)=>{
      const request=indexedDB.open(dbName,1);
      request.onupgradeneeded=()=>request.result.createObjectStore('tickets',{keyPath:'id'});
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error('Could not open the local request bench.'));
      request.onblocked=()=>reject(new Error('Close another preview tab and try saving again.'));
    });
  }
  async function transaction(mode,action){
    const connection=await db();
    return new Promise((resolve,reject)=>{
      const tx=connection.transaction('tickets',mode),store=tx.objectStore('tickets');
      let result;
      const request=action(store);
      request.onsuccess=()=>{result=request.result;};
      tx.oncomplete=()=>resolve(result);
      tx.onerror=()=>reject(tx.error||request.error||new Error('Could not save the local request.'));
      tx.onabort=()=>reject(tx.error||new Error('Local request storage is full. Your selected files are still in this form.'));
    });
  }
  function release(){for(const url of urls)URL.revokeObjectURL(url);urls=[];}
  async function records(){return ((await transaction('readonly',store=>store.getAll()))||[])
    .sort((a,b)=>b.createdAt-a.createdAt).slice(0,80);}
  return {
    async add({text,name,who,build,photos=[],clips=[]}){
      const attachments=[...photos.map(p=>({...p,kind:'photo'})),...clips];
      if(photos.length>2||clips.length>2||attachments.some(a=>!a.blob||a.blob.size>2_800_000))
        throw new Error('Use up to two photos and two clips, each under 2.8 MB.');
      const createdAt=Date.now();
      const id=`preview-${createdAt.toString(36)}-${crypto.randomUUID()}`;
      const row={id,text:String(text).slice(0,500),name:String(name||'ANON').slice(0,20),
        who:who==='tremont'?'tremont':'utah',createdAt,status:'new',build:String(build||'').slice(0,40),
        local:true,photoN:photos.length,clipN:clips.length,
        attachments:attachments.map(a=>({blob:a.blob,kind:a.kind||'voice',name:String(a.name||'').slice(0,120),mime:a.mime||a.blob.type}))};
      await transaction('readwrite',store=>store.add(row));
      return row;
    },
    async list(){
      const rows=await records();release();
      return rows.map(({attachments,...row})=>{
        const photoUrls=[],clipUrls=[];
        for(const a of attachments||[]){const url=URL.createObjectURL(a.blob);urls.push(url);
          (a.kind==='photo'?photoUrls:clipUrls).push(url);}
        return {...row,photoUrls,clipUrls};
      });
    },
    async exportMetadata(){return (await records()).map(({attachments,...row})=>({...row,
      attachments:(attachments||[]).map(a=>({kind:a.kind,name:a.name,mime:a.mime,bytes:a.blob.size}))}));},
    async close(){release();if(dbPromise){(await dbPromise).close();dbPromise=null;}},
    release,
  };
}
