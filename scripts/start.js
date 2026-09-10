'use strict';
const fs=require('node:fs'),path=require('node:path');
async function start(){
  const env=process.env,production=env.NODE_ENV==='production'||Boolean(env.RAILWAY_ENVIRONMENT_ID);
  if(env.DEMO_MODE===undefined){if(production)throw new Error('Configura DEMO_MODE explícitamente antes de publicar.');env.DEMO_MODE='1';}
  if(!['0','1'].includes(env.DEMO_MODE))throw new Error('DEMO_MODE debe ser 0 o 1.');
  if(env.DEMO_MODE==='1'){require('./start-demo');return;}
  if(!env.DATA_DIR)throw new Error('Configura DATA_DIR para el portal privado.');
  if(production&&(!env.APP_ORIGIN||new URL(env.APP_ORIGIN).protocol!=='https:'))throw new Error('Configura el origen HTTPS del portal privado.');
  if(env.RAILWAY_ENVIRONMENT_ID&&(!env.RAILWAY_VOLUME_MOUNT_PATH||path.resolve(env.DATA_DIR)!==path.resolve(env.RAILWAY_VOLUME_MOUNT_PATH)))throw new Error('El portal privado necesita su volumen persistente.');
  const requestFile=path.join(env.DATA_DIR,'.private-activation.json');
  if(fs.existsSync(requestFile)){
    const {Store}=require('../portal/store');
    const store=new Store(env.DATA_DIR,{databaseURL:env.DATABASE_URL});
    try{
      require('../portal/security').createSecurity(store,env);
      const request=JSON.parse(fs.readFileSync(requestFile,'utf8'));
      if(production&&request.requireExternal!==true)throw new Error('La activación publicada exige copia externa verificada.');
      const result=await require('../portal/private-activation').activate(store,request,require('../portal/reliability').createRecovery(store,env));
      fs.unlinkSync(requestFile);console.log(result.alreadyPrivate?'Portal privado ya activado.':'Demo retirada; copia verificada y administrador protegido.');
    }finally{store.close();}
  }
  require('../portal/server').start();
}
if(require.main===module)start().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={start};
