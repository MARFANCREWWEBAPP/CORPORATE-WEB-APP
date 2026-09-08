'use strict';
const {admin,fail,now,PROTECTED_ADMIN_EMAIL}=require('./store');
const {sha}=require('./reliability');
const confirmation='BORRAR DEMO';
function planFor(state,user){
  admin(user);
  if(state.demo?.version!==1)fail(404,'La limpieza solo está disponible en la base aislada de demostración.');
  // Everything in this database is a sample. Never identify demo data by names
  // or email suffixes in the private portal, which uses separate storage.
  const preserved=state.users.filter(u=>u.protectedAccount||u.email===PROTECTED_ADMIN_EMAIL||u.id===user.id||(u.demoAccount&&u.role==='ADMIN'));
  const keep=new Set(preserved.map(u=>u.id));
  const users=state.users.filter(u=>!keep.has(u.id));
  const events=state.events.map(e=>({id:e.id,name:e.eventName,status:e.status}));
  const body={revision:state.revision,actorId:user.id,users:users.map(u=>({id:u.id,email:u.email})),events,preserved:preserved.map(u=>({id:u.id,email:u.email}))};
  return {...body,digest:sha(JSON.stringify(body)),confirmation,cleanedAt:state.demo.cleanedAt||null};
}
function review(store,user){
  const plan=planFor(store.read(),user),ids=new Set(plan.events.map(e=>e.id));
  return {...plan,files:store.db.prepare('SELECT id,eventId FROM files').all().filter(f=>ids.has(f.eventId)).length};
}
function clean(store,user,data,recovery){
  const plan=review(store,user);
  if(data.confirmation!==confirmation||data.digest!==plan.digest)fail(409,'Revisa de nuevo la lista y escribe BORRAR DEMO para confirmar.');
  if(!plan.events.length&&!plan.users.length)return {removedEvents:0,removedUsers:0,removedFiles:0,backup:null};
  // A verified full snapshot is mandatory. Any failure leaves the live data intact.
  const backup=recovery.make('antes de limpiar demo',true);
  return store.transaction(user,'DEMO_DATA_CLEANED',state=>{
    const current=planFor(state,user);
    if(current.digest!==plan.digest)fail(409,'La demo ha cambiado. Revisa la lista antes de borrar.');
    const removed=new Set(plan.users.map(u=>u.id));
    for(const event of plan.events)store.db.prepare('DELETE FROM files WHERE eventId=?').run(event.id);
    for(const account of removed)store.revoke(account);
    state.users=state.users.filter(u=>!removed.has(u.id));
    state.events=[];
    for(const key of ['notifications','outbox','drafts','messageDrafts','integrationJobs','fileReplicas'])state[key]=[];
    state.resets=state.resets.filter(r=>!removed.has(r.userId));
    state.savedViews=state.savedViews.filter(v=>!removed.has(v.userId));
    // Cached mutation responses must not expose a removed record after cleanup.
    store.db.exec('CREATE TABLE IF NOT EXISTS operations (key TEXT PRIMARY KEY, digest TEXT NOT NULL, result TEXT NOT NULL, created INTEGER NOT NULL); DELETE FROM operations;');
    state.demo.accountIds=state.demo.accountIds.filter(account=>!removed.has(account));
    state.demo.cleanedAt=now();state.demo.cleanedBy=user.id;
    state.demo.lastCleanupBackup={filename:backup.filename,sha256:backup.sha256,createdAt:backup.createdAt};
    return {removedEvents:plan.events.length,removedUsers:plan.users.length,removedFiles:plan.files,backup:state.demo.lastCleanupBackup};
  });
}
function publicDemo(store){
  const {accounts,password}=require('./demo'),state=store.read();
  return {accounts:accounts.filter(a=>state.users.some(u=>u.demoAccount&&u.active&&u.email===a.email)),password,cleanedAt:state.demo.cleanedAt||null};
}
module.exports={review,clean,publicDemo};
