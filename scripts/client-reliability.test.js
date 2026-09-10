'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const {createDraftBuffer}=require('../portal/draft-buffer');
function fixture(write){
  const remote=new Map(),calls=[],timers=new Map();let seq=0;
  const buffer=createDraftBuffer({load:key=>remote.get(key),schedule:fn=>{const id=++seq;timers.set(id,fn);return id;},cancel:id=>timers.delete(id),save:async(key,data)=>{calls.push({key,...data});const result=write?await write(key,data,remote):{...data,revision:(data.revision||0)+1};remote.set(key,result);return result;}});
  return {buffer,remote,calls,timers};
}
test('Switching conversations retains independent text and independent autosave timers',async()=>{
  const {buffer,calls,timers}=fixture();buffer.edit('A','Primera versión');buffer.edit('A','Última versión A');buffer.edit('B','Texto B');
  assert.equal(buffer.read('A').body,'Última versión A');assert.equal(timers.size,2);assert.deepEqual(buffer.pending(),['A','B']);
  await buffer.flushAll();assert.equal(calls.length,2);assert.deepEqual(calls.map(c=>c.body).sort(),['Texto B','Última versión A']);assert.equal(buffer.pending().length,0);assert.equal(timers.size,0);
});
test('Typing while an autosave is in flight serializes the next version without losing it',async()=>{
  let release;const gate=new Promise(resolve=>release=resolve);
  const {buffer,calls}=fixture(async(key,data)=>{if(data.body==='Primero')await gate;return {...data,revision:(data.revision||0)+1};});
  buffer.edit('A','Primero');const saving=buffer.flush('A');await Promise.resolve();buffer.edit('A','Segundo');assert.equal(buffer.flush('A'),saving);release();await saving;
  assert.deepEqual(calls.map(c=>[c.body,c.revision]),[['Primero',undefined],['Segundo',1]]);assert.equal(buffer.read('A').body,'Segundo');assert.equal(buffer.pending().length,0);
});
test('A lost response is retried with its exact body and revision before saving a newer edit',async()=>{
  const confirmed=new Map();let writes=0,drop=true;
  const {buffer,calls}=fixture(async(key,data)=>{const identity=JSON.stringify({key,...data});if(confirmed.has(identity))return confirmed.get(identity);const result={...data,revision:++writes};confirmed.set(identity,result);if(drop){drop=false;throw Error('response lost after commit');}return result;});
  buffer.edit('A','Primero');await assert.rejects(buffer.flush('A'),/response lost/);buffer.edit('A','Segundo');await buffer.flush('A');
  assert.deepEqual(calls.map(c=>[c.body,c.revision]),[['Primero',undefined],['Primero',undefined],['Segundo',1]]);assert.equal(writes,2);assert.equal(buffer.read('A').body,'Segundo');assert.equal(buffer.pending().length,0);
});
test('Conflicting drafts stay local until the user reviews and explicitly chooses a version',async()=>{
  let conflict=true;
  const f=fixture(async(key,data)=>{if(conflict)throw Object.assign(Error('changed elsewhere'),{status:409});assert.equal(data.revision,8);return {...data,revision:9};});
  f.buffer.edit('A','Mi texto');await assert.rejects(f.buffer.flush('A'),{status:409});f.remote.set('A',{body:'Otro dispositivo',revision:8});assert.equal(f.buffer.read('A').body,'Mi texto');
  await assert.rejects(f.buffer.flush('A'),{status:409});assert.equal(f.calls.length,1);
  conflict=false;f.buffer.rebase('A',f.remote.get('A'),'Mi texto');await f.buffer.flush('A');assert.equal(f.remote.get('A').body,'Mi texto');
});
test('Resetting an account detaches an old in-flight save from the next account buffer',async()=>{
  let release;const gate=new Promise(resolve=>release=resolve);const f=fixture(async(key,data)=>{await gate;return {...data,revision:1};});
  f.buffer.edit('A','Cuenta anterior');const request=f.buffer.flush('A');await Promise.resolve();f.buffer.reset();f.buffer.edit('A','Cuenta nueva');release();await request;assert.equal(f.buffer.read('A').body,'Cuenta nueva');assert.ok(f.buffer.read('A').dirty);
});
test('An older state response cannot roll back a confirmed draft from another request',async()=>{
  const {buffer,remote}=fixture();buffer.edit('B','Guardado reciente');await buffer.flush('B');remote.set('B',{body:'Estado anterior',revision:0});assert.equal(buffer.read('B').body,'Guardado reciente');
  remote.set('B',{body:'Cambio posterior',revision:2});assert.equal(buffer.read('B').body,'Cambio posterior');
});
const source=fs.readFileSync(require.resolve('../portal/client-workflows.js'),'utf8');
function draftHarness(){
  const saved=new Map(),calls=[];let drop=true;
  const context={structuredClone,JSON,document:{},portalAccount:{id:'test-user'},app:{v4WizardDraft:{eventName:'Primera versión'},v4WizardStep:1,data:{drafts:[]}},auditState:{draft:null,draftDirty:true,draftSaving:null,draftAttempt:null},auditUpdateConnection(){},toast(){},portalApi:async(route,method,data)=>{
    calls.push({route,method,...data});const key=method+route+JSON.stringify(data);if(saved.has(key))return saved.get(key);const result={result:{id:'draft-1',values:data.values,step:data.step,revision:(data.revision||0)+1},data:{drafts:[]}};saved.set(key,result);if(drop){drop=false;throw Error('response lost');}return result;
  }};
  vm.createContext(context);vm.runInContext(source.slice(source.indexOf('  function auditSaveDraft()'),source.indexOf('  saveV4Draft=function')),context);
  return {context,calls,saved};
}
test('A form retries an unconfirmed draft creation before applying text typed during the outage',async()=>{
  const {context,calls,saved}=draftHarness();await assert.rejects(context.auditSaveDraft(),/response lost/);context.app.v4WizardDraft.eventName='Nueva edición';context.app.v4WizardStep=2;await context.auditSaveDraft();
  assert.equal(calls.length,3);assert.equal(calls[0].route,'/drafts');assert.equal(calls[1].route,'/drafts');assert.deepEqual(calls[1].values,calls[0].values);assert.equal(calls[2].route,'/drafts/draft-1');assert.equal(calls[2].values.eventName,'Nueva edición');assert.equal(calls[2].step,2);assert.equal(saved.size,2);assert.equal(context.auditState.draftDirty,false);
});
function apiHarness(fetch){
  const context={crypto,AbortController,setTimeout,clearTimeout,JSON,portalAccount:{id:'one'},portalCsrf:'csrf',auditState:{pending:new Map()},auditUpdateConnection(){},fetch};
  vm.createContext(context);vm.runInContext(source.slice(source.indexOf('  portalApi=async function'),source.indexOf('  const auditChangeStatus')),context);return context;
}
test('Losing the response body retains the idempotency key for a safe retry',async()=>{
  const keys=[];let fail=true;const c=apiHarness(async(route,request)=>{keys.push(request.headers['Idempotency-Key']);return {ok:true,status:200,json:async()=>{if(fail){fail=false;throw Error('body disconnected');}return {ok:true};}};});
  await assert.rejects(c.portalApi('/events/id/comments','POST',{body:'Mensaje'}),/confirmar/);await c.portalApi('/events/id/comments','POST',{body:'Mensaje'});assert.equal(keys[0],keys[1]);assert.equal(c.auditState.pending.size,0);
});
test('A late response cannot be applied after switching to a different account',async()=>{
  let release;const pending=new Promise(resolve=>release=resolve),c=apiHarness(async()=>{await pending;return {ok:true,status:200,json:async()=>({data:{private:'previous account'}})};});
  const request=c.portalApi('/state');c.portalAccount={id:'two'};release();await assert.rejects(request,/sesión ha cambiado/);
});
