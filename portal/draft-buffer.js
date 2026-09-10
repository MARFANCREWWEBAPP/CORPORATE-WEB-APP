'use strict';
// One buffer and timer per conversation. Unconfirmed text stays in memory only.
function createDraftBuffer({load,save,changed=()=>{},delay=800,schedule=setTimeout,cancel=clearTimeout}){
  const entries=new Map();
  function read(key){
    const remote=load(key)||{body:'',revision:undefined};let entry=entries.get(key);
    if(!entry){entry={body:remote.body||'',confirmed:remote.body||'',revision:remote.revision,dirty:false,saving:null,timer:null,attempt:null,error:null};entries.set(key,entry);}
    else if(!entry.dirty&&!entry.saving&&!entry.attempt&&(remote.revision||0)>(entry.revision||0)){entry.body=entry.confirmed=remote.body||'';entry.revision=remote.revision;}
    return entry;
  }
  function edit(key,body){
    const entry=read(key);entry.body=body;entry.dirty=Boolean(entry.attempt)||body!==entry.confirmed;
    if(entry.timer)cancel(entry.timer);entry.timer=null;
    if(entry.dirty&&entry.error?.status!==409)entry.timer=schedule(()=>{entry.timer=null;void flush(key).catch(()=>{});},delay);
    changed();return entry;
  }
  function flush(key){
    const entry=read(key);if(entry.timer)cancel(entry.timer);entry.timer=null;
    if(entry.saving)return entry.saving;
    if(!entry.dirty)return Promise.resolve(entry);
    if(entry.error?.status===409)return Promise.reject(entry.error);
    entry.saving=Promise.resolve().then(async()=>{
      while(entries.get(key)===entry&&entry.dirty){
        // A lost response may have committed. Retry that exact revision/body first.
        const attempt=entry.attempt||(entry.attempt={body:entry.body,revision:entry.revision});
        try{
          const result=await save(key,attempt);
          if(entries.get(key)!==entry)return;
          entry.revision=result.revision;entry.confirmed=attempt.body;entry.attempt=null;entry.error=null;
          entry.dirty=entry.body!==attempt.body;
        }catch(error){
          if(entries.get(key)!==entry)return;
          entry.error=error;entry.dirty=true;
          if(error.status>=400&&error.status<500&&error.status!==429)entry.attempt=null;
          throw error;
        }
      }
      return entry;
    }).finally(()=>{entry.saving=null;if(entries.get(key)===entry)changed();});
    changed();return entry.saving;
  }
  function rebase(key,remote,body){
    const entry=read(key);if(entry.saving||entry.attempt)throw Error('Confirma primero el guardado pendiente.');
    entry.revision=remote?.revision;entry.confirmed=remote?.body||'';entry.error=null;edit(key,body);
  }
  function reset(key){
    const selected=key===undefined?[...entries.keys()]:[key];
    for(const id of selected){const entry=entries.get(id);if(entry?.timer)cancel(entry.timer);entries.delete(id);}changed();
  }
  const pending=()=>[...entries].filter(([,entry])=>entry.dirty||entry.saving||entry.attempt).map(([key])=>key);
  function conflict(key,error){const entry=read(key);entry.error=error;entry.dirty=true;changed();}
  return {read,edit,flush,rebase,reset,pending,conflict,flushAll:()=>Promise.all(pending().map(flush))};
}
if(typeof module!=='undefined'&&module.exports)module.exports={createDraftBuffer};
