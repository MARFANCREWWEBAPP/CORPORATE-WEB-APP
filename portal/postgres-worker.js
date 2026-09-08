'use strict';
const {workerData}=require('node:worker_threads');
const port=workerData.port,signal=new Int32Array(workerData.signal);
let client;
const ready=(async()=>{
  if(workerData.testDirectory){const {PGlite}=require('@electric-sql/pglite');client=new PGlite(workerData.testDirectory);await client.waitReady;}
  else{const {Client}=require('pg');client=new Client({connectionString:workerData.url,connectionTimeoutMillis:10000,query_timeout:15000,statement_timeout:12000});client.on('error',()=>{});await client.connect();}
})();
ready.catch(()=>{});
async function query(sql,params=[]){const result=await client.query(sql,params.map(value=>value instanceof Uint8Array?Buffer.from(value):value));return {rows:(result.rows||[]).map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,key==='value'&&typeof value==='object'?JSON.stringify(value):['expires','created','n'].includes(key)?Number(value):value]))),rowCount:result.rowCount??result.affectedRows};}
port.on('message',async request=>{
  try{await ready;let result;
    if(request.op==='close'){await (client.end?client.end():client.close());result={};}
    else if(request.op==='snapshot'){await query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');try{result={};for(const table of ['state','sessions','files','operations'])result[table]=(await query('SELECT * FROM '+table)).rows;await query('COMMIT');}catch(error){await query('ROLLBACK');throw error;}}
    else if(request.op==='exec'){if(workerData.testDirectory)await client.exec(request.sql);else await client.query(request.sql);result={};}
    else result=await query(request.sql,request.params);
    port.postMessage({result});
  }catch(error){port.postMessage({error:{message:'La operación de PostgreSQL no se ha podido confirmar.',code:error.code||'POSTGRES_ERROR'}});}
  finally{Atomics.store(signal,0,1);Atomics.notify(signal,0);}
});
