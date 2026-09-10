'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const {Store,fail,id,now,email,text,admin,publicUser,passwordHash,verifyPassword,CLOSED,STATUSES,PROTECTED_ADMIN_EMAIL}=require('./store');
const reliability=require('./reliability');
reliability.install(Store);
const operations=require('./operations');
operations.install(Store);
const productionWork=require('./production');
productionWork.install(Store);
const branding=require('./branding');
branding.install(Store);
require('./reservations').install(Store);
const {createSecurity}=require('./security');
const {createMail}=require('./mail');
const {scheduleConflicts}=require('./workflow-store');
const {buildPortal}=require('./template');
const equal=(a,b)=>{const left=Buffer.from(a||''),right=Buffer.from(b||'');return left.length===right.length&&crypto.timingSafeEqual(left,right);};
const MAX_FILE=20*1024*1024;
async function readJson(req,limit=128*1024) {
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))fail(415,'Se requiere JSON.');
  if(Number(req.headers['content-length'])>limit)fail(413,'La petición supera el tamaño permitido.');
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>limit)fail(413,'La petición supera el tamaño permitido.');chunks.push(chunk);}
  let result;try{result=JSON.parse(Buffer.concat(chunks).toString());}catch{fail(400,'Petición no válida.');}
  if(!result||typeof result!=='object'||Array.isArray(result))fail(400,'Petición no válida.');const operation=reliability.context.getStore();if(operation?.key)operation.digest=reliability.sha(operation.route+'\n'+JSON.stringify(result));return result;
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
  const suppliedEnv=options.env||process.env;
  const demo=suppliedEnv.DEMO_MODE==='1';
  const env=demo?{...suppliedEnv,DATABASE_URL:'',RESEND_API_KEY:'',BACKUP_S3_ENDPOINT:''}:suppliedEnv;
  // Demo backups need their own explicit credentials; never inherit a private destination.
  if(demo&&suppliedEnv.DEMO_EXTERNAL_BACKUPS==='1'){
    const keys=['BACKUP_S3_ENDPOINT','BACKUP_S3_BUCKET','BACKUP_S3_ACCESS_KEY','BACKUP_S3_SECRET_KEY','BACKUP_ENCRYPTION_KEY'];
    if(keys.some(key=>!suppliedEnv['DEMO_'+key]))throw new Error('Configura el destino y la clave propios de las copias de demostración.');
    for(const key of [...keys,'BACKUP_S3_REGION','BACKUP_S3_SESSION_TOKEN','BACKUP_S3_URL_STYLE'])env[key]=suppliedEnv['DEMO_'+key]||'';
  }
  const origin=new URL(env.APP_ORIGIN||'http://localhost:3000').origin;
  const production=env.NODE_ENV==='production'||Boolean(env.RAILWAY_ENVIRONMENT_ID);
  if(production && (!env.APP_ORIGIN||!origin.startsWith('https://')||(!demo&&!env.DATA_DIR)))throw new Error('Configura APP_ORIGIN HTTPS y DATA_DIR persistente antes de activar el portal.');
  if(!demo && env.RAILWAY_ENVIRONMENT_ID && (!env.RAILWAY_VOLUME_MOUNT_PATH||path.resolve(env.DATA_DIR)!==path.resolve(env.RAILWAY_VOLUME_MOUNT_PATH)))throw new Error('El portal necesita un volumen Railway montado en DATA_DIR.');
  if(demo&&env.RAILWAY_ENVIRONMENT_ID&&(env.RAILWAY_VOLUME_MOUNT_PATH||env.DEMO_EXTERNAL_BACKUPS==='1')&&(!env.DATA_DIR||!env.RAILWAY_VOLUME_MOUNT_PATH||path.resolve(env.DATA_DIR)!==path.resolve(env.RAILWAY_VOLUME_MOUNT_PATH)))throw new Error('La demostración persistente necesita el volumen montado en DATA_DIR.');
  const store=new Store(env.DATA_DIR||path.join(__dirname,demo?'../.demo-data':'../.data'),{databaseURL:env.DATABASE_URL,postgresTestDirectory:options.postgresTestDirectory});
  try {if(demo)require('./demo').seedDemo(store);else if(store.read().demo)throw new Error('La base de demostración solo puede abrirse en modo demo.');}catch(error){store.close();throw error;}
  if(!store.read().users.length&&(env.BOOTSTRAP_TOKEN||'').length<32){store.close();throw new Error('Configura BOOTSTRAP_TOKEN de al menos 32 caracteres para el alta inicial.');}
  let security,recovery,mailer;try{security=createSecurity(store,env);recovery=reliability.createRecovery(store,env,options.backupFetch);mailer=createMail(store,env,security,options.mailFetch);}catch(error){store.close();throw error;}
  const objectStorage=require('./object-storage').createObjectStorage(store,env,options.objectFetch);
  const integrations=require('./integrations').createIntegrations(store,env,options.integrationFetch);
  const continuity=require('./continuity').createContinuity(store,recovery,env,options.backupFetch);
  const automation=operations.createAutomation(store);
  if(!options.noAutomaticBackup)automation.run();
  const automationTimer=options.noAutomaticBackup?null:setInterval(()=>{try{automation.run();}catch(error){console.error('Seguimiento automático no completado:',error.name);}},60000);automationTimer?.unref();
  const streams=new Set();
  const masterLogo=fs.readFileSync(path.join(__dirname,'assets/marquee-b2be-logo.png')),masterLogoTag='\"'+crypto.createHash('sha256').update(masterLogo).digest('hex')+'\"';
  const html=Buffer.from(buildPortal());
  const compressed=zlib.gzipSync(html);
  const hashes=[...html.toString().matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>`'sha256-${crypto.createHash('sha256').update(m[1]).digest('base64')}'`);
  const csp=`default-src 'self'; script-src ${hashes.join(' ')}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' blob:; media-src 'self' data: blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`;
  const cookieName=production?'__Host-marquee_session':'marquee_session';
  const cookie=(token,age=43200)=>`${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${production?'; Secure':''}`;
  const attempts=new Map();let hashing=0;let lastBackupError=null;
  function rateLimit(key,max=10) {
    const previous=attempts.get(key);const entry=previous&&previous.until>Date.now()?previous:{count:0,until:Date.now()+15*60000};
    if(++entry.count>max)fail(429,'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.');attempts.set(key,entry);
    if(attempts.size>5000){for(const [k,v]of attempts)if(v.until<Date.now())attempts.delete(k);while(attempts.size>5000)attempts.delete(attempts.keys().next().value);}
  }
  async function hashTask(fn){if(hashing>=4)fail(429,'Hay varios accesos en curso. Vuelve a intentarlo en unos segundos.');hashing++;try{return await fn();}finally{hashing--;}}
  function makeBackup(reason){try{const result=recovery.make(reason,reason==='manual'||reason==='antes de importar');lastBackupError=null;void recovery.external();return result;}catch(error){lastBackupError=now();console.error('No se pudo completar la copia de recuperación:',error.code||error.name);throw error;}}
  if(!options.noAutomaticBackup)makeBackup('arranque');
  const backupTimer=options.noAutomaticBackup?null:setInterval(()=>{try{makeBackup('automática horaria');recovery.prune();}catch{}try{recovery.report();}catch{}},3600000);
  backupTimer?.unref();
  const mailTimer=options.noAutomaticMail?null:setInterval(()=>void mailer.flush(),30000);mailTimer?.unref();
  const server=http.createServer((req,res)=>reliability.context.run({route:req.method+' '+req.url,key:/^\/api\/(events|drafts|clients|resources|organizations|views)(\/|$)/.test(req.url)?req.headers['idempotency-key']:null},async()=> {
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('Content-Security-Policy',csp);
    if(production)res.setHeader('Strict-Transport-Security','max-age=31536000');
    const send=(status,body,type='application/json; charset=utf-8')=>{const bytes=Buffer.isBuffer(body)?body:Buffer.from(type.startsWith('application/json')?JSON.stringify(body):String(body));res.writeHead(status,{'Content-Type':type,'Content-Length':bytes.length});res.end(req.method==='HEAD'?undefined:bytes);};
    try {
      if(req.headers['idempotency-key']&&!/^[a-zA-Z0-9_-]{16,100}$/.test(req.headers['idempotency-key']))fail(400,'Identificador de envío no válido.');
      const clientIp=reliability.clientAddress(req,env);
      const url=new URL(req.url,origin),route=url.pathname;
      if(route==='/health'&&['GET','HEAD'].includes(req.method)) {store.read();return send(200,{status:'ok',version:'4.5.2-portal',mode:demo?'demo':'portal',storage:store.db.kind==='postgres'?'postgresql':demo&&!env.RAILWAY_VOLUME_MOUNT_PATH?'demo-instance':'persistent',backupStatus:lastBackupError?'error':'ok'});}
      if(route==='/brand/b2be-logo.png'&&['GET','HEAD'].includes(req.method)){res.setHeader('Cache-Control','public, max-age=0, must-revalidate');res.setHeader('ETag',masterLogoTag);return send(req.headers['if-none-match']===masterLogoTag?304:200,req.headers['if-none-match']===masterLogoTag?Buffer.alloc(0):masterLogo,'image/png');}
      if(['/','/index.html'].includes(route)&&['GET','HEAD'].includes(req.method)) {
        const gzip=/\bgzip\b/.test(req.headers['accept-encoding']||'');res.setHeader('Vary','Accept-Encoding');if(gzip)res.setHeader('Content-Encoding','gzip');return send(200,gzip?compressed:html,'text/html; charset=utf-8');
      }
      if(['/viewer','/viewer.js','/viewer.css'].includes(route)&&req.method==='GET'){
        const filename=route==='/viewer'?'viewer.html':route.slice(1);res.setHeader('X-Frame-Options','SAMEORIGIN');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; worker-src 'self'; connect-src 'self' blob:; font-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; object-src 'none'; frame-ancestors 'self'; base-uri 'none'");return send(200,fs.readFileSync(path.join(__dirname,filename)),route==='/viewer'?'text/html; charset=utf-8':route.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8');
      }
      if(/^\/pdfjs\/(build\/(pdf|pdf.worker)\.mjs|standard_fonts\/[a-zA-Z0-9_.-]+|cmaps\/[a-zA-Z0-9_.-]+)$/.test(route)&&req.method==='GET'){
        const filename=path.join(__dirname,'../node_modules/pdfjs-dist',route.slice(7));if(!fs.existsSync(filename))fail(404,'Recurso no encontrado.');return send(200,fs.readFileSync(filename),route.endsWith('.mjs')?'text/javascript; charset=utf-8':'application/octet-stream');
      }
      if(route==='/robots.txt'&&req.method==='GET')return send(200,'User-agent: *\nDisallow: /\n','text/plain');
      const calendarMatch=route.match(/^\/calendar\/([A-Za-z0-9_-]{43})\.ics$/);
      if(calendarMatch&&req.method==='GET'){const user=operations.calendarUser(store,calendarMatch[1]);if(!user)fail(404,'Suscripción no disponible.');return send(200,operations.calendar(store,user),'text/calendar; charset=utf-8');}
      if(!route.startsWith('/api/'))fail(404,'No encontrado.');
      if(!['GET','POST','PATCH'].includes(req.method))fail(405,'Método no permitido.');
      const write=req.method!=='GET';
      if(write && (req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site'))fail(403,'Origen de la petición no permitido.');
      const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
      const session=store.session(token);
      if(route==='/api/session'&&req.method==='GET')return send(200,{user:session?publicUser(session.user):null,csrf:session?.csrf||null,demo:demo?require('./demo-cleanup').publicDemo(store):null,setupRequired:store.read().users.length===0,setupEmail:store.read().users.length===0?PROTECTED_ADMIN_EMAIL:undefined});
      if(route==='/api/bootstrap'&&req.method==='POST') {
        rateLimit('setup:'+clientIp,5);const data=await readJson(req);
        if(store.read().users.length || !equal(data.token,env.BOOTSTRAP_TOKEN))fail(403,'El enlace de activación no es válido o ya se ha utilizado.');
        if(email(data.email)!==PROTECTED_ADMIN_EMAIL)fail(400,'La cuenta inicial debe ser la de administración protegida.');
        const hash=await hashTask(()=>passwordHash(data.password));
        const user=store.transaction(null,'ADMIN_BOOTSTRAPPED',state=>{if(state.users.length)fail(409,'La cuenta inicial ya existe.');const user={id:id(),firstName:text(data.firstName,100,true),lastName:text(data.lastName,150),email:email(data.email),passwordHash:hash,role:'ADMIN',venueId:null,active:true,protectedAccount:true,mustChangePassword:false,createdAt:now()};state.users.push(user);return user;});
        const created=store.newSession(user);res.setHeader('Set-Cookie',cookie(created.token));return send(201,{user:created.user,csrf:created.csrf});
      }
      if(route==='/api/login'&&req.method==='POST') {
        const data=await readJson(req);const normalized=String(data.email||'').trim().toLowerCase().slice(0,254);
        rateLimit('login:'+clientIp,40);rateLimit('email:'+normalized,10);
        const state=store.read(),user=state.users.find(u=>u.email===normalized);
        const dummy='00000000000000000000000000000000:'+ '00'.repeat(64);
        const valid=await hashTask(()=>verifyPassword(data.password,user?.passwordHash||dummy));
        if(!valid||!user?.active||(user.role==='VENUE_USER'&&!state.venues.some(v=>require('./store').canVenue(user,v.id)&&v.state==='ACTIVE')))fail(401,'Email o contraseña incorrectos, o cuenta desactivada.');
        if(user.mfaSecret){if(!data.code)fail(401,'Introduce también el código de tu autenticador.');store.transaction(user,'MFA_LOGIN',state=>security.verifyMfa(state,user,data.code));}
        attempts.delete('email:'+normalized);const created=store.newSession(user);res.setHeader('Set-Cookie',cookie(created.token));return send(200,{user:created.user,csrf:created.csrf});
      }
      if(demo&&['/api/password/forgot','/api/password/reset'].includes(route))fail(403,'Las credenciales de demostración están disponibles en el acceso.');
      if(route==='/api/password/forgot'&&req.method==='POST'){rateLimit('reset:'+clientIp,10);const data=await readJson(req);rateLimit('reset-email:'+String(data.email||'').slice(0,254).toLowerCase(),3);security.requestReset(data.email,mailer.configured);return send(200,{ok:true,message:'Si la cuenta está activa, recibirás un enlace de recuperación.'});}
      if(route==='/api/password/reset'&&req.method==='POST'){rateLimit('reset-use:'+clientIp,10);const result=await hashTask(async()=>security.reset(await readJson(req)));return send(200,result);}
      if(!session)fail(401,'Inicia sesión para continuar.');
      if(write&&!equal(req.headers['x-csrf-token'],session.csrf))fail(403,'La sesión de seguridad ha cambiado. Vuelve a entrar.');
      const user=session.user;
      if(demo&&user.demoAccount&&write&&(route==='/api/password'||route.startsWith('/api/mfa/')))fail(403,'Las credenciales de los tres perfiles demo se mantienen para que todos puedan probarlos.');
      if(demo&&write&&route.startsWith('/api/import/'))fail(403,'La demostración utiliza muestras. La importación de datos anteriores está disponible en el portal privado.');
      if(demo&&req.method==='PATCH'&&route.startsWith('/api/users/')&&store.read().demo.accountIds.includes(route.split('/').at(-1)))fail(403,'Los tres perfiles de demostración mantienen su cuenta y permisos.');
      if(route==='/api/logout'&&req.method==='POST'){store.db.prepare('DELETE FROM sessions WHERE token=?').run(session.token);res.setHeader('Set-Cookie',cookie('',0));return send(200,{ok:true});}
      const brandingMatch=route.match(/^\/api\/venues\/([^/]+)\/(branding|logo|branding-preview\.pdf)$/);
      if(brandingMatch){
        const venue=branding.scoped(store,user,brandingMatch[1],req.method!=='GET');
        if(brandingMatch[2]==='logo'&&req.method==='GET'){const logo=venue.branding?.logo;if(!logo)fail(404,'El espacio no tiene logotipo.');return send(200,Buffer.from(logo.base64,'base64'),logo.mimeType);}
        if(brandingMatch[2]==='branding'&&req.method==='PATCH'){const result=branding.save(store,user,venue.id,await readJson(req,1500*1024));return send(200,{result,data:store.view(user)});}
        if(brandingMatch[2]==='branding-preview.pdf'&&['GET','POST'].includes(req.method)){
          const branded=req.method==='POST'?{...venue,branding:branding.values(venue,await readJson(req,1500*1024))}:venue;
          res.setHeader('Content-Disposition','inline; filename="identidad-espacio.pdf"');
          return send(200,await require('./pdf-design').brandingPreview(branded,demo),'application/pdf');
        }
      }
      if(route==='/api/password'&&req.method==='POST') {
        rateLimit('password:'+user.id,10);const data=await readJson(req);
        if(!await hashTask(()=>verifyPassword(data.currentPassword,user.passwordHash)))fail(400,'La contraseña actual no es correcta.');
        if(equal(data.currentPassword,data.password))fail(400,'Elige una contraseña diferente de la temporal.');
        const hash=await hashTask(()=>passwordHash(data.password));
        const updated=store.transaction(user,'PASSWORD_CHANGED',state=>{const current=state.users.find(u=>u.id===user.id);current.passwordHash=hash;current.mustChangePassword=false;store.revoke(user.id);return current;});
        const created=store.newSession(updated);res.setHeader('Set-Cookie',cookie(created.token));return send(200,{user:created.user,csrf:created.csrf});
      }
      if(user.mustChangePassword)fail(403,'Cambia la contraseña temporal antes de continuar.');
      if(route==='/api/changes'&&req.method==='GET'){
        if(streams.size>=100)fail(429,'Demasiadas conexiones activas.');
        res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});
        const emitter=store.changeEmitter();let last=-1;
        const update=()=>{if(!store.session(token)){res.end();return;}const revision=store.read().revision;if(revision!==last){res.write('data: '+JSON.stringify({revision})+'\n\n');last=revision;}};
        const heartbeat=setInterval(()=>{update();if(!res.writableEnded)res.write(': conectado\n\n');},10000);heartbeat.unref();emitter.on('change',update);streams.add(res);res.on('close',()=>{clearInterval(heartbeat);emitter.off('change',update);streams.delete(res);});update();return;
      }
      if(route==='/api/demo/cleanup'&&['GET','POST'].includes(req.method)){
        admin(user);if(!demo)fail(404,'La limpieza solo está disponible en demostración.');
        const cleanup=require('./demo-cleanup');
        if(req.method==='GET')return send(200,cleanup.review(store,user));
        const result=cleanup.clean(store,user,await readJson(req),recovery);
        return send(200,{result,data:store.view(user),demo:cleanup.publicDemo(store)});
      }
      if(route==='/api/daily-summary'&&req.method==='GET')return send(200,operations.dailySummary(store,user));
      if(route==='/api/calendar'&&req.method==='GET'){res.setHeader('Content-Disposition','attachment; filename=marquee-eventos.ics');return send(200,operations.calendar(store,user),'text/calendar; charset=utf-8');}
      if(route==='/api/calendar/subscription'&&req.method==='POST'){await readJson(req);const token=operations.createCalendarToken(store,user);return send(201,{url:new URL('/calendar/'+token+'.ics',origin).href});}
      if(route==='/api/calendar/revoke'&&req.method==='POST'){await readJson(req);store.transaction(user,'CALENDAR_SUBSCRIPTION_REVOKED',state=>{delete state.users.find(u=>u.id===user.id).calendarTokenHash;});return send(200,{ok:true});}
      if(route==='/api/operations/rules'&&req.method==='GET'){admin(user);return send(200,{rules:operations.rules(store.read())});}
      if(route==='/api/operations/rules'&&req.method==='PATCH')return send(200,{result:store.saveRules(user,await readJson(req)),data:store.view(user)});
      if(route==='/api/services'&&req.method==='GET'){admin(user);return send(200,{recovery:recovery.status(),mail:mailer.status(),documents:objectStorage.status()});}
      if(route==='/api/continuity'&&req.method==='GET'){admin(user);return send(200,continuity.status());}
      if(route==='/api/continuity/drill'&&req.method==='POST'){admin(user);const result=await continuity.drill(user,await readJson(req));return send(200,{result,data:store.view(user)});}
      if(route==='/api/state'&&req.method==='GET')return send(200,{data:store.view(user)});
      const productionMatch=route.match(/^\/api\/events\/([^/]+)\/production(?:\/(draft|publish|acknowledge|check|incidents)(?:\/([^/]+))?)?$/);
      if(productionMatch){
        const eventId=productionMatch[1],action=productionMatch[2];
        if(!action&&req.method==='GET')return send(200,productionWork.getProduction(store,user,eventId));
        const handlers={draft:'productionDraft',publish:'productionPublish',acknowledge:'productionAcknowledge',check:'productionCheck',incidents:'productionIncident'};
        if(handlers[action]&&req.method==='POST'){
          const data=await readJson(req),result=action==='incidents'?store.productionIncident(user,eventId,productionMatch[3],data):store[handlers[action]](user,eventId,data);
          return send(200,{result,data:store.view(user)});
        }
        fail(404,'Acción de producción no encontrada.');
      }
      const orderPdf=route.match(/^\/api\/events\/([^/]+)\/production\/releases\/([^/]+)\.pdf$/);
      if(orderPdf&&req.method==='GET'){
        const bytes=await productionWork.productionPdf(store,user,orderPdf[1],orderPdf[2],demo);
        res.setHeader('Content-Disposition','inline; filename="orden-produccion.pdf"');return send(200,bytes,'application/pdf');
      }
      const changeMatch=route.match(/^\/api\/events\/([^/]+)\/change-requests(?:\/([^/]+))?$/);
      if(changeMatch&&req.method==='POST'){
        const data=await readJson(req),result=changeMatch[2]?store.decideChange(user,changeMatch[1],changeMatch[2],data):store.proposeChange(user,changeMatch[1],data);
        return send(200,{result,data:store.view(user)});
      }
      if(route==='/api/backups'&&req.method==='GET'){admin(user);return send(200,{backups:store.backups(),lastBackupError,recovery:recovery.status()});}
      if(route==='/api/backups'&&req.method==='POST'){admin(user);await readJson(req);return send(201,{backup:makeBackup('manual')});}
      if(route==='/api/export'&&req.method==='GET') {
        admin(user);const status=url.searchParams.get('status');if(status&&!STATUSES.includes(status))fail(400,'Categoría no válida.');
        const payload=store.exportArchive(user,status,Object.fromEntries(url.searchParams));const serialized=JSON.stringify(payload);const sha256=crypto.createHash('sha256').update(serialized).digest('hex');
        res.setHeader('Content-Disposition',`attachment; filename="marquee-${status||'completo'}-${now().slice(0,10)}.json"`);return send(200,{sha256,payload});
      }
      const fileMatch=route.match(/^\/api\/files\/([a-z0-9-]+)$/i);
      if(fileMatch&&req.method==='GET') {
        const {metadata,bytes}=store.file(user,fileMatch[1]);
        const disposition=url.searchParams.get('download')==='1'||!['application/pdf','image/png','image/jpeg'].includes(metadata.mimeType)?'attachment':'inline';
        res.setHeader('Content-Disposition',`${disposition}; filename*=UTF-8''${encodeURIComponent(metadata.originalName).replaceAll("'",'%27')}`);return send(200,bytes,metadata.mimeType);
      }
      if(route==='/api/documents/replicas/review'&&req.method==='GET')return send(200,objectStorage.review(user));
      if(route==='/api/documents/replicas/copy'&&req.method==='POST'){const result=await objectStorage.copyReviewed(user,await readJson(req));return send(200,{result,data:store.view(user)});}
      if(route==='/api/integrations'&&req.method==='GET')return send(200,integrations.status());
      const integrationMatch=route.match(/^\/api\/events\/([^/]+)\/integrations\/(odoo|whatsapp|assistant)$/);
      if(integrationMatch&&req.method==='POST'){rateLimit('integration:'+user.id,20);const result=await integrations.run(user,integrationMatch[1],integrationMatch[2],await readJson(req),req.headers['idempotency-key']);return send(200,{result,data:store.view(user)});}
      const generatedMatch=route.match(/^\/api\/events\/([^/]+)\/generate-budget$/);
      if(generatedMatch&&req.method==='POST'){const result=await require('./commercial').generate(store,user,generatedMatch[1],await readJson(req),demo);return send(200,{result,data:store.view(user)});}
      const scheduleMatch=route.match(/^\/api\/events\/([^/]+)\/availability$/);
      if(scheduleMatch&&req.method==='GET'){if(!['ADMIN','COMMERCIAL'].includes(user.role))fail(403,'Solo Marquee consulta recursos.');return send(200,{conflicts:scheduleConflicts(store.read(),store.event(store.read(),user,scheduleMatch[1]))});}
      const reservationMatch=route.match(/^\/api\/events\/([^/]+)\/reservations(?:\/([^/]+))?$/);
      if(reservationMatch&&req.method==='POST'){
        const data=await readJson(req);
        const result=reservationMatch[2]?store.changeReservation(user,reservationMatch[1],reservationMatch[2],data):store.reserveEvent(user,reservationMatch[1],data);
        return send(200,{result,data:store.view(user)});
      }
      let result;
      if(route==='/api/import/preview'&&req.method==='POST'){admin(user);const data=await readJson(req,65*1024*1024);return send(200,require('./import').preview(store,user,data.archive));}
      else if(route==='/api/import/confirm'&&req.method==='POST'){admin(user);result=require('./import').commit(store,user,await readJson(req,65*1024*1024),recovery);}
      else if(route==='/api/mfa/setup'&&req.method==='POST'){rateLimit('mfa:'+user.id,10);const data=await readJson(req);result=await hashTask(()=>security.setup(user,data.currentPassword));}
      else if(route==='/api/mfa/enable'&&req.method==='POST'){rateLimit('mfa:'+user.id,10);const data=await readJson(req);result=security.enable(user,data.code);const created=store.newSession(store.read().users.find(u=>u.id===user.id));res.setHeader('Set-Cookie',cookie(created.token));result.csrf=created.csrf;}
      else if(route==='/api/mfa/disable'&&req.method==='POST'){rateLimit('mfa:'+user.id,10);await hashTask(async()=>security.disable(user,await readJson(req)));res.setHeader('Set-Cookie',cookie('',0));return send(200,{ok:true});}
      else if(route.match(/^\/api\/venues\/[^/]+\/technical$/)&&req.method==='PATCH'){const data=await readJson(req);const venueId=route.split('/')[3];result=store.transaction(user,'TECHNICAL_PROFILE_UPDATED',state=>{const venue=state.venues.find(v=>v.id===venueId);if(!venue||!require('./store').canVenue(user,venueId))fail(404,'Espacio no encontrado.');const values=store.venueValues({...venue,technicalProfile:data.technicalProfile});venue.technicalProfile=values.technicalProfile;venue.technicalUpdatedAt=now();return venue;});}
      else if(route==='/api/preferences'&&req.method==='PATCH')result=store.preferences(user,await readJson(req));
      else if(route==='/api/drafts'&&req.method==='POST')result=store.saveDraft(user,null,await readJson(req));
      else if(route.match(/^\/api\/drafts\/[^/]+$/)&&req.method==='PATCH')result=store.saveDraft(user,route.split('/').at(-1),await readJson(req));
      else if(route.match(/^\/api\/events\/[^/]+\/message-draft$/)&&req.method==='POST')result=store.messageDraft(user,route.split('/')[3],await readJson(req));
      else if(route.match(/^\/api\/events\/[^/]+\/budgets\/[^/]+\/decision$/)&&req.method==='POST'){result=store.budgetDecision(user,route.split('/')[3],route.split('/')[5],await readJson(req));if(result.decision==='REJECTED'){try{makeBackup('evento archivado');}catch{}}}
      else if(route==='/api/clients/merge'&&req.method==='POST')result=store.mergeClients(user,await readJson(req));
      else if(route==='/api/clients'&&req.method==='POST')result=store.saveClient(user,null,await readJson(req));
      else if(route.match(/^\/api\/clients\/[^/]+$/)&&req.method==='PATCH')result=store.saveClient(user,route.split('/').at(-1),await readJson(req));
      else if(route==='/api/organizations'&&req.method==='POST')result=store.saveOrganization(user,null,await readJson(req));
      else if(route.match(/^\/api\/organizations\/[^/]+$/)&&req.method==='PATCH')result=store.saveOrganization(user,route.split('/').at(-1),await readJson(req));
      else if(route==='/api/resources'&&req.method==='POST')result=store.saveResource(user,null,await readJson(req));
      else if(route.match(/^\/api\/resources\/[^/]+$/)&&req.method==='PATCH')result=store.saveResource(user,route.split('/').at(-1),await readJson(req));
      else if(route==='/api/views'&&req.method==='POST')result=store.saveView(user,await readJson(req));
      else if(route==='/api/venues-with-user'&&req.method==='POST'){admin(user);result=await hashTask(async()=>store.createVenueWithUser(user,await readJson(req)));}
      else if(route==='/api/users'&&req.method==='POST'){admin(user);result=await hashTask(async()=>store.createUser(user,await readJson(req)));}
      else if(route.match(/^\/api\/users\/[^/]+$/)&&req.method==='PATCH'){admin(user);result=await hashTask(async()=>store.updateUser(user,route.split('/').at(-1),await readJson(req)));}
      else if(route==='/api/venues'&&req.method==='POST')result=store.saveVenue(user,null,await readJson(req));
      else if(route.match(/^\/api\/venues\/[^/]+$/)&&req.method==='PATCH'){const data=await readJson(req);if(demo&&data.state==='INACTIVE'&&store.read().demo.venueIds.includes(route.split('/').at(-1)))fail(403,'Este espacio se mantiene activo para el acceso de demostración.');result=store.saveVenue(user,route.split('/').at(-1),data);}
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
      if(!res.headersSent){let details=error.details;if(status===409){const match=req.url.match(/^\/api\/events\/([^/?]+)/);const cookieToken=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);const currentSession=store.session(cookieToken);if(match&&currentSession){const current=store.view(currentSession.user).events.find(e=>e.id===match[1]);if(current)details={...details,current};}}send(status,{error:status===500?'No se pudo completar la operación. No se ha confirmado el guardado; vuelve a intentarlo.':error.message,details});}else res.destroy();
    }
  }));
  server.requestTimeout=45000;server.headersTimeout=15000;server.maxRequestsPerSocket=1000;
  server.on('close',()=>{if(automationTimer)clearInterval(automationTimer);if(backupTimer)clearInterval(backupTimer);if(mailTimer)clearInterval(mailTimer);store.close();});
  return {server,store,origin,recovery,mailer,security,automation,integrations,objectStorage,continuity,closeStreams:()=>{for(const response of streams)response.end();}};
}
function start() {
  const port=Number(process.env.PORT||3000);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT no válido.');
  if(process.env.PORTAL_REDIRECT_URL){const destination=new URL(process.env.PORTAL_REDIRECT_URL);if(destination.protocol!=='https:')throw new Error('La redirección debe ser HTTPS.');const server=http.createServer((req,res)=>{if(req.url==='/health'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({status:'ok',version:'4.3.0-redirect'}));}res.writeHead(307,{Location:new URL(new URL(req.url,'http://secondary.invalid').pathname+new URL(req.url,'http://secondary.invalid').search,destination).href,'Cache-Control':'no-store'});res.end();});server.listen(port,'0.0.0.0');return;}
  const {server,closeStreams}=createPortal();server.listen(port,process.env.HOST||'0.0.0.0',()=>console.log('Marquee Audiovisuales: cuentas y datos persistentes, puerto '+port));
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{closeStreams();server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),5000).unref();});
}
module.exports={createPortal,start,parseFile};
