'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {fail,id,now,email,text,passwordHash,verifyPassword}=require('./store');
const {sealed,unseal,sha}=require('./reliability');
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32(bytes){let bits=0,value=0,out='';for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){out+=alphabet[(value>>>(bits-5))&31];bits-=5;}}if(bits)out+=alphabet[(value<<(5-bits))&31];return out;}
function decode32(value){let bits=0,n=0,bytes=[];for(const c of value.replace(/=|\s/g,'').toUpperCase()){const k=alphabet.indexOf(c);if(k<0)throw new Error('Secreto no válido');n=(n<<5)|k;bits+=5;if(bits>=8){bytes.push((n>>>(bits-8))&255);bits-=8;}}return Buffer.from(bytes);}
function totp(secret,at=Date.now()){const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(at/30000)));const hash=crypto.createHmac('sha1',decode32(secret)).update(counter).digest(),offset=hash.at(-1)&15;return String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');}
function checkTotp(secret,code,lastCounter=-1){if(!/^\d{6}$/.test(code||''))return null;for(const shift of [-1,0,1]){const at=Date.now()+shift*30000,counter=Math.floor(at/30000);if(counter>lastCounter&&crypto.timingSafeEqual(Buffer.from(totp(secret,at)),Buffer.from(code)))return counter;}return null;}
function createSecurity(store,env){
  const keyPath=path.join(store.directory,'.security-key');let key;
  if(env.PORTAL_SECRET_KEY)key=Buffer.from(env.PORTAL_SECRET_KEY,'base64');
  else{if(env.NODE_ENV==='production'||env.RAILWAY_ENVIRONMENT_ID)throw new Error('Configura PORTAL_SECRET_KEY para proteger los secretos de segundo factor.');if(!fs.existsSync(keyPath))fs.writeFileSync(keyPath,crypto.randomBytes(32),{mode:0o600,flag:'wx'});key=fs.readFileSync(keyPath);}
  if(key.length!==32)throw new Error('PORTAL_SECRET_KEY debe contener 32 bytes en base64.');
  const encrypt=value=>sealed(Buffer.from(value),key).toString('base64'),decrypt=value=>unseal(Buffer.from(value,'base64'),key).toString();
  function verifyMfa(state,user,code){
    if(!user.mfaSecret)return;
    const current=state.users.find(u=>u.id===user.id),counter=checkTotp(decrypt(current.mfaSecret),String(code||''),current.mfaLastCounter??-1);
    if(counter!==null){current.mfaLastCounter=counter;return;}
    const hashed=sha(String(code||'').replace(/\s/g,'')),index=(current.recoveryCodes||[]).indexOf(hashed);
    if(index>=0){current.recoveryCodes.splice(index,1);return;}
    fail(401,'Introduce un código válido del autenticador o un código de recuperación sin utilizar.');
  }
  async function setup(user,password){if(!await verifyPassword(password,user.passwordHash))fail(401,'Contraseña incorrecta.');if(user.mfaSecret)fail(409,'El segundo factor ya está activo.');const secret=base32(crypto.randomBytes(20));store.transaction(user,'MFA_SETUP_STARTED',state=>{state.users.find(u=>u.id===user.id).mfaPending={secret:encrypt(secret),expires:Date.now()+10*60000};});return {secret,uri:'otpauth://totp/'+encodeURIComponent('Marquee Flow:'+user.email)+'?secret='+secret+'&issuer=Marquee%20Flow&algorithm=SHA1&digits=6&period=30'};}
  function enable(user,code){return store.transaction(user,'MFA_ENABLED',state=>{const current=state.users.find(u=>u.id===user.id);if(!current.mfaPending||current.mfaPending.expires<Date.now())fail(400,'La configuración ha caducado. Iníciala de nuevo.');const counter=checkTotp(decrypt(current.mfaPending.secret),code);if(counter===null)fail(400,'El código no es correcto.');const codes=Array.from({length:10},()=>crypto.randomBytes(10).toString('hex'));current.mfaSecret=current.mfaPending.secret;delete current.mfaPending;current.mfaLastCounter=counter;current.recoveryCodes=codes.map(sha);store.revoke(user.id);return {recoveryCodes:codes};});}
  async function disable(user,data){if(!await verifyPassword(data.currentPassword,user.passwordHash))fail(401,'Contraseña incorrecta.');store.transaction(user,'MFA_DISABLED',state=>{const current=state.users.find(u=>u.id===user.id);verifyMfa(state,current,data.code);delete current.mfaSecret;delete current.mfaPending;delete current.recoveryCodes;delete current.mfaLastCounter;store.revoke(user.id);});}
  function requestReset(address,mailConfigured){
    // Same public response for missing, disabled, and existing accounts. A provider must be configured before accepting requests.
    if(!mailConfigured)fail(503,'La recuperación por email todavía no está activada. Contacta con administración.');
    let normalized;try{normalized=email(address);}catch{return;}
    store.transaction(null,'PASSWORD_RESET_REQUESTED',state=>{
      const user=state.users.find(u=>u.email===normalized&&u.active);if(!user)return;
      if(state.resets.some(r=>r.userId===user.id&&r.expires>Date.now()&&!r.usedAt))return;
      const token=crypto.randomBytes(32).toString('base64url');state.resets.push({id:id(),userId:user.id,hash:sha(token),expires:Date.now()+30*60000});
      state.outbox.push({id:id(),recipientId:user.id,type:'reset',subject:'Recuperar acceso a Marquee Flow',secretBody:encrypt('Has solicitado cambiar tu contraseña. Este enlace caduca en 30 minutos: '+new URL('/#reset='+token,env.APP_ORIGIN).href+'\nSi no has sido tú, puedes ignorar este mensaje.'),createdAt:now(),attempts:0,nextAttemptAt:now(),expiresAt:Date.now()+30*60000});
    });
  }
  async function reset(data){const token=text(data.token,100,true);const found=store.read().resets.find(r=>r.hash===sha(token)&&!r.usedAt&&r.expires>Date.now());if(!found)fail(400,'El enlace no es válido o ha caducado.');const hash=await passwordHash(data.password);
    return store.transaction(null,'PASSWORD_RESET_COMPLETED',state=>{const request=state.resets.find(r=>r.id===found.id&&!r.usedAt&&r.expires>Date.now());if(!request)fail(400,'El enlace ya se utilizó o ha caducado.');const user=state.users.find(u=>u.id===request.userId&&u.active);if(!user)fail(400,'El enlace no está disponible.');verifyMfa(state,user,data.code);user.passwordHash=hash;user.mustChangePassword=false;request.usedAt=now();for(const r of state.resets)if(r.userId===user.id)r.usedAt=r.usedAt||now();store.revoke(user.id);return {ok:true};});
  }
  return {encrypt,decrypt,verifyMfa,setup,enable,disable,requestReset,reset};
}
module.exports={createSecurity,base32,decode32,totp,checkTotp};
