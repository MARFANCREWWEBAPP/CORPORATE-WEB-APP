'use strict';
const {Worker,MessageChannel,receiveMessageOnPort}=require('node:worker_threads');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');
const path=require('node:path');
// Preserve the existing synchronous domain transactions. Network I/O runs on a
// dedicated connection in a worker; callers wait for an acknowledged result.
// Deploy near PostgreSQL and measure latency before enabling large workloads.
class PostgresDatabase{
  constructor(options){
    this.kind='postgres';const {port1,port2}=new MessageChannel();this.port=port1;this.signal=new Int32Array(new SharedArrayBuffer(4));
    this.worker=new Worker(path.join(__dirname,'postgres-worker.js'),{workerData:{url:options.databaseURL,testDirectory:options.postgresTestDirectory,port:port2,signal:this.signal.buffer},transferList:[port2]});this.worker.unref();this.port.unref();
    try{this.exec(`CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), value JSON NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, "userId" TEXT NOT NULL, csrf TEXT NOT NULL, expires BIGINT NOT NULL);
      CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, "eventId" TEXT NOT NULL, bytes BYTEA NOT NULL);
      CREATE TABLE IF NOT EXISTS operations (key TEXT PRIMARY KEY, digest TEXT NOT NULL, result TEXT NOT NULL, created BIGINT NOT NULL);`);
      // Signed production snapshots depend on the original JSON key order.
      // JSONB has already lost that order; converting it cannot repair old hashes.
      const format=this.prepare("SELECT data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='state' AND column_name='value'").get();
      if(format?.data_type!=='json')throw new Error('El estado PostgreSQL usa un formato anterior que no conserva las huellas. Restaura una copia verificada en una base nueva; la base existente se conserva.');
    }catch(error){this.worker.terminate();this.port.close();throw error;}
  }
  rpc(request){
    if(this.failed)throw new Error('La conexión PostgreSQL necesita reiniciarse.');
    Atomics.store(this.signal,0,0);this.port.postMessage(request);
    const outcome=Atomics.wait(this.signal,0,0,25000);
    if(outcome==='timed-out'){this.failed=true;this.worker.terminate();throw new Error('PostgreSQL no confirmó la operación a tiempo. No repitas una escritura sin comprobar su resultado.');}
    const reply=receiveMessageOnPort(this.port)?.message;
    if(!reply){this.failed=true;throw new Error('Respuesta de PostgreSQL no disponible.');}
    if(reply.error)throw Object.assign(new Error(reply.error.message),{code:reply.error.code});return reply.result;
  }
  sql(input){
    let sql=input.replace(/PRAGMA[^;]+;/g,'').replace(/\bBLOB\b/g,'BYTEA').replace(/expires INTEGER/g,'expires BIGINT').replace(/created INTEGER/g,'created BIGINT').replace(/value TEXT NOT NULL/g,'value JSON NOT NULL');
    sql=sql.replace(/(?<!")\b(userId|eventId)\b(?!")/g,'"$1"');
    if(sql==='BEGIN IMMEDIATE')return 'BEGIN; SELECT id FROM state WHERE id=1 FOR UPDATE;';
    if(sql.startsWith('INSERT OR IGNORE INTO state'))sql=sql.replace('INSERT OR IGNORE','INSERT')+' ON CONFLICT (id) DO NOTHING';
    let count=0;return sql.replace(/\?/g,()=>'$'+(++count));
  }
  exec(sql){const translated=this.sql(sql);if(translated.trim())return this.rpc({op:'exec',sql:translated});}
  prepare(sql){const translated=this.sql(sql);return {run:(...params)=>this.rpc({op:'query',sql:translated,params}),get:(...params)=>this.rpc({op:'query',sql:translated,params}).rows[0],all:(...params)=>this.rpc({op:'query',sql:translated,params}).rows};}
  snapshotTo(destination){
    if(fs.existsSync(destination))throw new Error('La carpeta de copia ya contiene ese archivo.');
    const tables=this.rpc({op:'snapshot'}),db=new DatabaseSync(destination);
    try{db.exec('CREATE TABLE state (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL); CREATE TABLE sessions (token TEXT PRIMARY KEY, userId TEXT NOT NULL, csrf TEXT NOT NULL, expires INTEGER NOT NULL); CREATE TABLE files (id TEXT PRIMARY KEY, eventId TEXT NOT NULL, bytes BLOB NOT NULL); CREATE TABLE operations (key TEXT PRIMARY KEY, digest TEXT NOT NULL, result TEXT NOT NULL, created INTEGER NOT NULL); BEGIN;');
      for(const row of tables.state)db.prepare('INSERT INTO state VALUES (?,?)').run(row.id,row.value);
      for(const row of tables.sessions)db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(row.token,row.userId,row.csrf,row.expires);
      for(const row of tables.files)db.prepare('INSERT INTO files VALUES (?,?,?)').run(row.id,row.eventId,Buffer.from(row.bytes));
      for(const row of tables.operations)db.prepare('INSERT INTO operations VALUES (?,?,?,?)').run(row.key,row.digest,row.result,row.created);
      db.exec('COMMIT');
    }finally{db.close();}
  }
  close(){try{if(!this.failed)this.rpc({op:'close'});}finally{this.port.close();void this.worker.terminate();}}
}
module.exports={PostgresDatabase};
