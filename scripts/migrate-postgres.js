'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {Store}=require('../portal/store');
const {inventory}=require('../portal/continuity');
function migrate(source,expected,target){
  if(crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex')!==expected)throw new Error('La copia no coincide con la huella esperada.');
  inventory(source);
  const db=new DatabaseSync(source,{readOnly:true});
  try{if(Object.values(db.prepare('PRAGMA integrity_check').get())[0]!=='ok')throw new Error('La copia no supera la comprobación de integridad.');const incoming=JSON.parse(db.prepare('SELECT value FROM state WHERE id=1').get().value);if(incoming.demo)throw new Error('No se importan las cuentas públicas de demostración a PostgreSQL.');
    const operations=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='operations'").get()?db.prepare('SELECT * FROM operations').all():[];
    target.transaction(null,'POSTGRES_MIGRATION',state=>{
      if(state.revision||state.users.length||state.events.length||['files','sessions','operations'].some(table=>target.db.prepare('SELECT COUNT(*) AS n FROM '+table).get().n))throw new Error('PostgreSQL debe estar vacío. No se sustituyen datos existentes.');
      Object.assign(state,incoming);
      for(const file of db.prepare('SELECT * FROM files').all())target.db.prepare('INSERT INTO files VALUES (?,?,?)').run(file.id,file.eventId,Buffer.from(file.bytes));
      for(const operation of operations)target.db.prepare('INSERT INTO operations VALUES (?,?,?,?)').run(operation.key,operation.digest,operation.result,operation.created);
      const migratedAt=new Date().toISOString();
      for(const request of state.resets||[])request.usedAt=migratedAt;
      for(const message of state.outbox||[])if(message.type==='reset'&&!message.sentAt)message.cancelledAt=migratedAt;
    });
    return {users:target.read().users.length,events:target.read().events.length,files:target.db.prepare('SELECT COUNT(*) AS n FROM files').get().n};
  }finally{db.close();}
}
if(require.main===module){const [source,hash]=process.argv.slice(2);if(!source||!hash||!process.env.DATABASE_URL||!process.env.DATA_DIR){console.error('Indica copia.sqlite y SHA256, y configura DATABASE_URL y DATA_DIR mediante secretos del servidor.');process.exit(1);}let target;try{target=new Store(path.resolve(process.env.DATA_DIR),{databaseURL:process.env.DATABASE_URL});console.log('Migración conservadora completada:',migrate(source,hash,target));}catch(error){console.error(error.message);process.exitCode=1;}finally{target?.close();}}
module.exports={migrate};
