'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const {Store,fail,id,now,email,text,admin,publicUser,passwordHash,verifyPassword,CLOSED,STATUSES,PROTECTED_ADMIN_EMAIL}=require('./store');
const {buildPortal}=require('./template');
const equal=(a,b)=>{const left=Buffer.from(a||''),right=Buffer.from(b||'');return left.length===right.length&&crypto.timingSafeEqual(left,right);};
const MAX_FILE=20*1024*1024;
async function readJson(req,limit=128*1024) {
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))fail(415,'Se requiere JSON.');
  if(Number(req.headers['content-length'])>limit)fail(413,'La petición supera el tamaño permitido.');
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>limit)fail(413,'La petición supera el tamaño permitido.');chunks.push(chunk);}
  let result;try{result=JSON.parse(Buffer.concat(chunks).toString());}catch{fail(400,'Petición no válida.');}
  if(!result||typeof result!=='object'||Array.isArray(result))fail(400,'Petición no válida.');return result;
}
function parseFile(data) {
  const name=text(data.originalName,200,true);
  if(!/^[A-Za-z0-9+/]*={0,2}$/.test(data.base64||'')||data.base64.length>Math.ceil(MAX_FILE/3)*4)fail(400,'Archivo no válido.');
  const bytes=Buffer.from(data.base64,'base64');if(!bytes.length||bytes.length>MAX_FILE)fail(413,'El archivo debe tener un máximo de 20 MB.');
  const extension=name.split('.').at(-1).toLowerCase();
  const types={pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
  if(!types[extension])fail(400,'Usa PDF, PNG, JPG, DOCX o XLSX.');
  const valid=extension==='pdf'?bytes.subarray(0,5).toString()==='%PDF-':extension==='png'?bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):['jpg','jpeg'].includes(extension)?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes[0]===80&&bytes[1]===75;
  if(!valid)fail(400,'El contenido no corresponde al formato del archivo.');
  return {bytes,mimeType:types[extension]};
}
function createPortal(options={}) {
  const env=options.env||process.env;
  const origin=new URL(env.APP_ORIGIN||'http://localhost:3000').origin;
  const production=env.NODE_ENV==='production'||Boolean(env.RAILWAY_ENVIRONMENT_ID);
  if(production && (!env.APP_ORIGIN||!origin.startsWith('https://')||!env.DATA_DIR))throw new Error('Configura APP_ORIGIN HTTPS y DATA_DIR persistente antes de activar el portal.');
  if(env.RAILWAY_ENVIRONMENT_ID && (!env.RAILWAY_VOLUME_MOUNT_PATH||path.resolve(env.DATA_DIR)!==path.resolve(env.RAILWAY_VOLUME_MOUNT_PATH)))throw new Error('El portal necesita un volumen Railway montado en DATA_DIR.');
  const store=new Store(env.DATA_DIR||path.join(__dirname,'../.data'));
  if(!store.read().users.length&&(env.BOOTSTRAP_TOKEN||'').length<32){store.close();throw new Error('Configura BOOTSTRAP_TOKEN de al menos 32 caracteres para el alta inicial.');}
  const html=Buffer.from(buildPortal());
  const compressed=zlib.gzipSync(html);
  const hashes=[...html.toString().matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>`'sha256-${crypto.createHash('sha256').update(m[1]).digest('base64')}'`);
  const csp=`default-src 'self'; script-src ${hashes.join(' ')}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'self' data: blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`;
  const cookieName=production?'__Host-marquee_session':'marquee_session';
  const cookie=(token,age=43200)=>`${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${production?'; Secure':''}`;
  const attempts=new Map();let hashing=0;let lastBackupError=null;
  function rateLimit(key,max=10) {
    const previous=attempts.get(key);const entry=previous&&previous.until>Date.now()?previous:{count:0,until:Date.now()+15*60000};
    if(++entry.count>max)fail(429,'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.');attempts.set(key,entry);
    if(attempts.size>5000)for(const [k,v]of attempts)if(v.until<Date.now())attempts.delete(k);
  }
  async function hashTask(fn){if(hashing>=4)fail(429,'Hay varios accesos en curso. Vuelve a intentarlo en unos segundos.');hashing++;try{return await fn();}finally{hashing--;}}
  function makeBackup(reason){try{const result=store.backup(reason);lastBackupError=null;return result;}catch(error){lastBackupError=now();console.error('No se pudo completar la copia de recuperación:',error.code||error.name);throw error;}}
  if(!options.noAutomaticBackup)makeBackup('arranque');
  const backupTimer=options.noAutomaticBackup?null:setInterval(()=>{try{makeBackup('automática diaria');}catch{}},24*3600000);
  backupTimer?.unref();
  const server=http.createServer(async(req,res)=> {
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('Content-Security-Policy',csp);
    if(production)res.setHeader('Strict-Transport-Security','max-age=31536000');
    const send=(status,body,type='application/json; charset=utf-8')=>{const bytes=Buffer.isBuffer(body)?body:Buffer.from(type.startsWith('application/json')?JSON.stringify(body):String(body));res.writeHead(status,{'Content-Type':type,'Content-Length':bytes.length});res.end(req.method==='HEAD'?undefined:bytes);};
    try {
      const url=new URL(req.url,origin),route=url.pathname;
      if(route==='/health'&&['GET','HEAD'].includes(req.method)) {store.read();return send(200,{status:'ok',version:'4.1.0-portal',storage:'persistent',backupStatus:lastBackupError?'error':'ok'});}
      if(['/','/index.html'].includes(route)&&['GET','HEAD'].includes(req.method)) {
        const gzip=/\bgzip\b/.test(req.headers['accept-encoding']||'');res.setHeader('Vary','Accept-Encoding');if(gzip)res.setHeader('Content-Encoding','gzip');return send(200,gzip?compressed:html,'text/html; charset=utf-8');
      }
      if(route==='/robots.txt'&&req.method==='GET')return send(200,'User-agent: *\nDisallow: /\n','text/plain');
      if(!route.startsWith('/api/'))fail(404,'No encontrado.');
      if(!['GET','POST','PATCH'].includes(req.method))fail(405,'Método no permitido.');
      const write=req.method!=='GET';
      if(write && (req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site'))fail(403,'Origen de la petición no permitido.');
      const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
      const session=store.session(token);
      if(route==='/api/session'&&req.method==='GET')return send(200,{user:session?publicUser(session.user):null,csrf:session?.csrf||null,setupRequired:store.read().users.length===0,setupEmail:store.read().users.length===0?PROTECTED_ADMIN_EMAIL:undefined});
      if(route==='/api/bootstrap'&&req.method==='POST') {
        rateLimit('setup:'+req.socket.remoteAddress,5);const data=await readJson(req);
        if(store.read().users.length || !equal(data.token,env.BOOTSTRAP_TOKEN))fail(403,'El enlace de activación no es válido o ya se ha utilizado.');
        if(email(data.email)!==PROTECTED_ADMIN_EMAIL)fail(400,'La cuenta inicial debe ser la de administración protegida.');
        const hash=await hashTask(()=>passwordHash(data.password));
        const user=store.transaction(null,'ADMIN_BOOTSTRAPPED',state=>{if(state.users.length)fail(409,'La cuenta inicial ya existe.');const user={id:id(),firstName:text(data.firstName,100,true),lastName:text(data.lastName,150),email:email(data.email),passwordHash:hash,role:'ADMIN',venueId:null,active:true,protectedAccount:true,mustChangePassword:false,createdAt:now()};state.users.push(user);return user;});
        const created=store.newSession(user);res.setHeader('Set-Cookie',cookie(created.token));return send(201,{user:created.user,csrf:created.csrf});
      }
      if(route==='/api/login'&&req.method==='POST') {
        const data=await readJson(req);const normalized=String(data.email||'').trim().toLowerCase();
        rateLimit('login:'+req.socket.remoteAddress,40);rateLimit('email:'+normalized,10);
        const state=store.read(),user=state.users.find(u=>u.email===normalized);
        const dummy='00000000000000000000000000000000:'+ '00'.repeat(64);
        const valid=await hashTask(()=>verifyPassword(data.password,user?.passwordHash||dummy));
        if(!valid||!user?.active||(user.role==='VENUE_USER'&&!state.venues.some(v=>v.id===user.venueId&&v.state==='ACTIVE')))fail(401,'Email o contraseña incorrectos, o cuenta desactivada.');
        attempts.delete('email:'+normalized);const created=store.newSession(user);res.setHeader('Set-Cookie',cookie(created.token));return send(200,{user:created.user,csrf:created.csrf});
      }
      if(!session)fail(401,'Inicia sesión para continuar.');
      if(write&&!equal(req.headers['x-csrf-token'],session.csrf))fail(403,'La sesión de seguridad ha cambiado. Vuelve a entrar.');
      const user=session.user;
      if(route==='/api/logout'&&req.method==='POST'){store.db.prepare('DELETE FROM sessions WHERE token=?').run(session.token);res.setHeader('Set-Cookie',cookie('',0));return send(200,{ok:true});}
      if(route==='/api/password'&&req.method==='POST') {
        rateLimit('password:'+user.id,10);const data=await readJson(req);
        if(!await hashTask(()=>verifyPassword(data.currentPassword,user.passwordHash)))fail(400,'La contraseña actual no es correcta.');
        if(equal(data.currentPassword,data.password))fail(400,'Elige una contraseña diferente de la temporal.');
        const hash=await hashTask(()=>passwordHash(data.password));
        const updated=store.transaction(user,'PASSWORD_CHANGED',state=>{const current=state.users.find(u=>u.id===user.id);current.passwordHash=hash;current.mustChangePassword=false;store.revoke(user.id);return current;});
        const created=store.newSession(updated);res.setHeader('Set-Cookie',cookie(created.token));return send(200,{user:created.user,csrf:created.csrf});
      }
      if(user.mustChangePassword)fail(403,'Cambia la contraseña temporal antes de continuar.');
      if(route==='/api/state'&&req.method==='GET')return send(200,{data:store.view(user)});
      if(route==='/api/backups'&&req.method==='GET'){admin(user);return send(200,{backups:store.backups(),lastBackupError});}
      if(route==='/api/backups'&&req.method==='POST'){admin(user);await readJson(req);return send(201,{backup:makeBackup('manual')});}
      if(route==='/api/export'&&req.method==='GET') {
        admin(user);const status=url.searchParams.get('status');if(status&&!STATUSES.includes(status))fail(400,'Categoría no válida.');
        const payload=store.exportArchive(user,status);const serialized=JSON.stringify(payload);const sha256=crypto.createHash('sha256').update(serialized).digest('hex');
        res.setHeader('Content-Disposition',`attachment; filename="marquee-${status||'completo'}-${now().slice(0,10)}.json"`);return send(200,{sha256,payload});
      }
      const fileMatch=route.match(/^\/api\/files\/([a-z0-9-]+)$/i);
      if(fileMatch&&req.method==='GET') {
        const {metadata,bytes}=store.file(user,fileMatch[1]);
        const disposition=url.searchParams.get('download')==='1'||!['application/pdf','image/png','image/jpeg'].includes(metadata.mimeType)?'attachment':'inline';
        res.setHeader('Content-Disposition',`${disposition}; filename*=UTF-8''${encodeURIComponent(metadata.originalName).replaceAll("'",'%27')}`);return send(200,bytes,metadata.mimeType);
      }
      let result;
      if(route==='/api/venues-with-user'&&req.method==='POST'){admin(user);result=await hashTask(async()=>store.createVenueWithUser(user,await readJson(req)));}
      else if(route==='/api/users'&&req.method==='POST'){admin(user);result=await hashTask(async()=>store.createUser(user,await readJson(req)));}
      else if(route.match(/^\/api\/users\/[^/]+$/)&&req.method==='PATCH'){admin(user);result=await hashTask(async()=>store.updateUser(user,route.split('/').at(-1),await readJson(req)));}
      else if(route==='/api/venues'&&req.method==='POST')result=store.saveVenue(user,null,await readJson(req));
      else if(route.match(/^\/api\/venues\/[^/]+$/)&&req.method==='PATCH')result=store.saveVenue(user,route.split('/').at(-1),await readJson(req));
      else if(route==='/api/events'&&req.method==='POST')result=store.createEvent(user,await readJson(req));
      else if(route.match(/^\/api\/events\/[^/]+$/)&&req.method==='PATCH'){
        const data=await readJson(req);if(!Number.isInteger(data.revision))fail(400,'Falta la versión del evento.');
        result=store.updateEvent(user,route.split('/').at(-1),data);
        if(CLOSED.includes(data.status)){try{makeBackup('evento archivado');}catch{/* El evento está confirmado en la base de datos; el panel informa del fallo de copia. */}}
      }
      else if(route.match(/^\/api\/events\/[^/]+\/comments$/)&&req.method==='POST')result=store.addComment(user,route.split('/')[3],await readJson(req));
      else if(route.match(/^\/api\/events\/[^/]+\/tasks$/)&&req.method==='POST')result=store.task(user,route.split('/')[3],await readJson(req));
      else if(route.match(/^\/api\/events\/[^/]+\/files$/)&&req.method==='POST'){
        const data=await readJson(req,28*1024*1024);const file=parseFile(data);result=store.addFile(user,route.split('/')[3],{...data,mimeType:file.mimeType},file.bytes);
      }
      else if(route==='/api/notifications/read'&&req.method==='POST'){const data=await readJson(req);store.markRead(user,data.id);result={ok:true};}
      else if(route==='/api/settings'&&req.method==='PATCH'){
        admin(user);const data=await readJson(req);store.transaction(user,'SETTINGS_UPDATED',state=>{for(const key of ['staleDays','budgetResponseDays'])if(key in data){const value=Number(data[key]);if(!Number.isInteger(value)||value<1||value>30)fail(400,'Usa un plazo entre 1 y 30 días.');state.settings[key]=value;}if('showCommercialToVenue'in data)state.settings.showCommercialToVenue=Boolean(data.showCommercialToVenue);});result={ok:true};
      }
      else fail(404,'Acción no encontrada.');
      return send(200,{result,data:store.view(user),backupWarning:lastBackupError?'La última copia de recuperación falló. El expediente sigue guardado; revisa Copias de seguridad.':null});
    } catch(error) {
      const status=error.status||500;
      if(status===500)console.error('Error de operación del portal:',error.code||error.name);
      if(!res.headersSent)send(status,{error:status===500?'No se pudo completar la operación. No se ha confirmado el guardado; vuelve a intentarlo.':error.message});else res.destroy();
    }
  });
  server.requestTimeout=45000;server.headersTimeout=15000;server.maxRequestsPerSocket=1000;
  server.on('close',()=>{if(backupTimer)clearInterval(backupTimer);store.close();});
  return {server,store,origin};
}
function start() {
  const port=Number(process.env.PORT||3000);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT no válido.');
  if(process.env.PORTAL_REDIRECT_URL){const destination=new URL(process.env.PORTAL_REDIRECT_URL);if(destination.protocol!=='https:')throw new Error('La redirección debe ser HTTPS.');const server=http.createServer((req,res)=>{if(req.url==='/health'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({status:'ok',version:'4.1.0-redirect'}));}res.writeHead(307,{Location:new URL(req.url,destination).href,'Cache-Control':'no-store'});res.end();});server.listen(port,'0.0.0.0');return;}
  const {server}=createPortal();server.listen(port,process.env.HOST||'0.0.0.0',()=>console.log('Marquee Flow: cuentas y datos persistentes, puerto '+port));
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),5000).unref();});
}
module.exports={createPortal,start,parseFile};
