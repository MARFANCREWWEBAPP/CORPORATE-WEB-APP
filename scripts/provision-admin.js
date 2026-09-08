'use strict';
// Read the initial password from stdin; never accept it in committed configuration or output it.
const fs=require('node:fs');
const {Store,PROTECTED_ADMIN_EMAIL}=require('../portal/store');
if(!process.env.DATA_DIR)throw new Error('Configura DATA_DIR con el almacenamiento del portal.');
let secret='';
process.stdin.setEncoding('utf8');
process.stdin.on('data',chunk=>{secret+=chunk;if(secret.includes('\n'))process.stdin.emit('end');});
process.stdin.once('end',async()=>{
  process.stdin.pause();
  const password=secret.replace(/[\r\n]+$/,'');secret='';
  const store=new Store(process.env.DATA_DIR);
  try{await store.provisionProtectedAdmin(password);store.backup('administración protegida');console.log('Cuenta protegida creada: '+PROTECTED_ADMIN_EMAIL);}
  catch(error){console.error(error.message);process.exitCode=1;}
  finally{store.close();process.stdin.destroy();}
});
