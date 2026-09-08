'use strict';
const {verifyRecovery}=require('../portal/reliability');
const [source,destination,hash]=process.argv.slice(2);
if(!source||!destination||!hash){console.error('Uso: node scripts/restore-backup.js copia.sqlite carpeta-nueva SHA256');process.exit(1);}
try{console.log('Copia recuperada y verificada:',verifyRecovery(source,destination,hash,process.env.BACKUP_ENCRYPTION_KEY?Buffer.from(process.env.BACKUP_ENCRYPTION_KEY,'base64'):undefined));}catch(error){console.error(error.message);process.exit(1);}
