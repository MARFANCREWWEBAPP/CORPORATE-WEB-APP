'use strict';
const nodemailer=require('nodemailer');
const {admin,id,now,text,fail}=require('./store');
const {sha,context}=require('./reliability');
const DEFAULT_FROM='info@marquee.es',WHATSAPP_NUMBER='34645252250';
const address=value=>{const v=text(value,254,true).toLowerCase();if(!/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(v))fail(400,'Introduce una dirección de correo válida, sin nombres ni varios destinatarios.');return v;};
const line=(value,max)=>{const v=text(value,max,true);if(/[\r\n\x00-\x1f\x7f]/.test(v))fail(400,'Este campo debe ocupar una sola línea.');return v;};
const phone=value=>{let v=String(value||'').replace(/[\s().-]/g,'').replace(/^\+/,'').replace(/^00/,'');if(/^[6789]\d{8}$/.test(v))v='34'+v;if(!/^[1-9]\d{7,14}$/.test(v))fail(400,'Introduce un teléfono con prefijo internacional.');return v;};
function createCustomerCommunications(store,env,security,options={}){
  const demo=env.DEMO_MODE==='1',fetcher=options.fetch||fetch,transport=options.transport||nodemailer.createTransport;
  const mailFetch=options.mailFetch||fetcher;
  function configuration(){return store.read().communicationSettings||{revision:0};}
  function smtp(c){return transport({host:'smtp.ionos.es',port:465,secure:true,auth:{user:c.from,pass:security.decrypt(c.secret)},tls:{minVersion:'TLSv1.2',rejectUnauthorized:true},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000,disableFileAccess:true,disableUrlAccess:true,logger:false,debug:false});}
  function status(user){admin(user);const c=configuration(),mail=c.mail||{};return {demo,revision:c.revision||0,mail:{provider:mail.provider||'RESEND',from:mail.from||DEFAULT_FROM,name:mail.name||'Marquee · B2BE',configured:!demo&&Boolean(mail.enabled&&mail.secret&&mail.verifiedAt),hasPassword:Boolean(mail.secret),verifiedAt:mail.verifiedAt||null},whatsapp:{number:'+'+WHATSAPP_NUMBER,mode:'external',available:!demo,configured:false}};}
  function commitSettings(user,data,key,value){return store.transaction(user,'CUSTOMER_CHANNEL_CONFIGURED',s=>{const c=s.communicationSettings||{revision:0};if(data.revision!==c.revision)fail(409,'La configuración ha cambiado. Actualiza antes de guardarla.');c[key]=value;c.revision++;s.communicationSettings=c;});}
  async function saveMail(user,data){
    admin(user);if(demo)fail(403,'El correo real se configura en el portal privado.');
    const old=configuration().mail||{},provider=data.provider||old.provider||'IONOS',from=address(data.from||DEFAULT_FROM),name=line(data.name||'Marquee · B2BE',100);
    if(data.enabled===false){commitSettings(user,data,'mail',{...old,enabled:false});return status(user);}
    if(!['IONOS','RESEND'].includes(provider))fail(400,'Selecciona el servicio de correo.');
    if(data.password!==undefined&&(typeof data.password!=='string'||data.password.length>1024))fail(400,'Revisa la contraseña del correo.');
    const secret=data.password?security.encrypt(data.password):old.from===from&&(old.provider||'IONOS')===provider?old.secret:null;
    if(!secret)fail(400,provider==='IONOS'?'Introduce la contraseña del buzón de correo.':'Introduce la clave de Resend para verificar el dominio y enviar.');
    const candidate={provider,from,name,secret,enabled:true};let connection;
    if(provider==='RESEND'){
      let domains;try{const response=await mailFetch('https://api.resend.com/domains?limit=100',{headers:{Authorization:'Bearer '+security.decrypt(secret)},signal:AbortSignal.timeout(15000),redirect:'error'});if(!response.ok)fail(400,'Resend no ha aceptado la clave o no permite verificar el dominio.');domains=await response.json();}catch(error){if(error.status)throw error;fail(400,'No se pudo comprobar la conexión con Resend.');}
      const domain=domains.data?.find(d=>d.name===from.split('@')[1]);if(domain?.status!=='verified'||domain.capabilities?.sending==='disabled')fail(400,'Verifica primero el dominio del remitente en Resend.');
      commitSettings(user,data,'mail',{...candidate,domainId:domain.id,verifiedAt:now()});return status(user);
    }
    try{connection=smtp(candidate);await connection.verify();}catch(error){fail(400,error.code==='EAUTH'?'IONOS no ha aceptado el usuario o la contraseña del correo.':'No se pudo conectar con el correo de IONOS. Revisa la conexión del servidor; el envío SMTP en Railway requiere un plan compatible.');}finally{connection?.close();}
    commitSettings(user,data,'mail',{...candidate,verifiedAt:now()});return status(user);
  }
  async function saveWhatsApp(user){admin(user);fail(410,'WhatsApp se abre en tu aplicación. No necesita conexión con Meta.');}
  function preview(user,eventId){
    admin(user);const state=store.read(),event=state.events.find(e=>e.id===eventId&&!e.deletedAt);if(!event)fail(404,'Evento no encontrado.');
    const venue=state.venues.find(v=>v.id===event.venueId);if(!venue)fail(400,'El evento necesita un espacio de eventos.');
    const config=status(user),budget=event.budgets.find(b=>b.isCurrent&&['SENT','FINAL'].includes(b.status));
    let whatsappPhone='',whatsappError='';try{whatsappPhone=phone(event.phone);}catch{whatsappError='Completa un teléfono válido con prefijo internacional en la ficha del evento.';}
    const result={eventId,contactName:[event.contactFirstName,event.contactLastName].filter(Boolean).join(' '),whatsappPhone,whatsappError,eventName:event.eventName,venueName:venue.name,from:config.mail.from,to:event.email||'',cc:venue.email||'',phone:event.phone||'',subject:'Marquee · '+event.eventName,body:'Hola'+(event.contactFirstName?' '+event.contactFirstName:'')+',\n\nTe escribimos sobre '+event.eventName+'.\n\n'+(event.nextAction||'')+'\n\nUn saludo,\nMarquee Audiovisuales',budget:budget?{id:budget.id,name:budget.displayName||budget.originalName,sha256:budget.sha256,sizeBytes:budget.sizeBytes}:null,configured:{mail:config.mail.configured,whatsapp:config.whatsapp.configured},whatsappNumber:config.whatsapp.number};
    result.digest=sha(JSON.stringify({eventId,revision:event.revision,venueId:venue.id,venueEmail:venue.email,configRevision:config.revision,result}));return result;
  }
  function list(user,eventId){admin(user);if(eventId)preview(user,eventId);return (store.read().customerMessages||[]).filter(m=>!eventId||m.eventId===eventId).slice().reverse().map(({key,digest,...m})=>m);}
  function begin(user,eventId,channel,data,snapshot){
    const key=text(data.operationId,100,true);if(!/^[A-Za-z0-9_-]{16,100}$/.test(key))fail(400,'Falta el identificador del envío.');
    const digest=sha(JSON.stringify({eventId,channel,data}));const operation=context.getStore();if(operation)operation.used=true;
    return store.transaction(user,'CUSTOMER_MESSAGE_REQUESTED',s=>{
      const previous=(s.customerMessages||[]).find(m=>m.key===key&&m.actorId===user.id);
      if(previous){if(previous.digest!==digest)fail(409,'El identificador ya corresponde a otro mensaje.');return {previous};}
      if(data.digest!==preview(user,eventId).digest)fail(409,'Los datos han cambiado. Revisa el mensaje antes de enviarlo.');
      if(data.confirm!==true)fail(400,'Revisa los destinatarios y confirma el envío.');
      if((s.customerMessages||[]).filter(m=>m.actorId===user.id&&m.createdAt.startsWith(now().slice(0,10))).length>=100)fail(429,'Has alcanzado el límite diario de comunicaciones.');
      const message={id:id(),key,digest,eventId,channel,actorId:user.id,createdAt:now(),status:'STARTED',...snapshot};(s.customerMessages||=[]).push(message);return {message};
    });
  }
  function completed(user,message,result){
    store.transaction(null,'CUSTOMER_MESSAGE_RESULT',s=>{const current=s.customerMessages.find(m=>m.id===message.id);Object.assign(current,result,{completedAt:now()});const event=s.events.find(e=>e.id===message.eventId);if(event)store.history(event,user,(message.channel==='EMAIL'?'Correo a cliente':'WhatsApp a cliente')+' · '+({SUBMITTED:'aceptado por el proveedor',PARTIAL:'aceptación parcial',FAILED:'rechazado',REQUIRES_REVIEW:'resultado por comprobar',PREPARED:'borrador preparado'}[result.status]||result.status),'CUSTOMER_MESSAGE',true);});
    return list(user,message.eventId).find(m=>m.id===message.id);
  }
  function replay(previous){const {key,digest,...safe}=previous;if(previous.status==='STARTED')return {...safe,status:'REQUIRES_REVIEW',notice:'El envío ya se inició. Comprueba el registro antes de repetirlo.'};return safe;}
  async function sendEmail(user,eventId,data){
    admin(user);const existing=(store.read().customerMessages||[]).find(m=>m.key===data.operationId&&m.actorId===user.id);
    if(existing){if(existing.digest!==sha(JSON.stringify({eventId,channel:'EMAIL',data})))fail(409,'El identificador ya corresponde a otro mensaje.');return replay(existing);}
    const p=preview(user,eventId);if(demo||!p.configured.mail)fail(503,'Conecta primero el servicio de correo desde administración.');if(data.digest!==p.digest)fail(409,'Los datos del evento, destinatarios o presupuesto han cambiado. Abre de nuevo el correo.');
    const to=address(data.to),cc=address(p.cc),subject=line(data.subject,200),body=text(data.body,20000,true);
    if(data.cc!==undefined&&data.cc!==cc)fail(400,'La copia al espacio de eventos se añade automáticamente y no puede cambiarse aquí.');
    if(data.from!==undefined&&data.from!==p.from)fail(400,'El remitente se configura desde administración.');
    const attachments=[];let attachment=null;
    if(data.attachBudget===true){if(!p.budget)fail(400,'No hay un presupuesto vigente publicado.');const state=store.read(),budget=state.events.find(e=>e.id===eventId).budgets.find(b=>b.id===p.budget.id),file=store.file(user,budget.fileKey);if(file.bytes.length>20*1024*1024||sha(file.bytes)!==p.budget.sha256)fail(400,'El presupuesto no ha superado la comprobación de integridad.');attachment=p.budget;attachments.push({filename:p.budget.name,content:file.bytes,contentType:budget.mimeType||'application/pdf'});}
    const c=configuration().mail,{message,previous}=begin(user,eventId,'EMAIL',data,{from:c.from,to,cc,subject,body,attachment,provider:c.provider||'IONOS'});if(previous)return replay(previous);let connection;
    try{
      if(c.provider==='RESEND'){
        const response=await mailFetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+security.decrypt(c.secret),'Content-Type':'application/json','Idempotency-Key':'marquee/customer/'+message.id},body:JSON.stringify({from:'"'+c.name.replace(/["\\]/g,'')+'" <'+c.from+'>',reply_to:c.from,to:[to],cc:[cc],subject,text:body,attachments:attachments.map(a=>({filename:a.filename,content:a.content.toString('base64'),content_type:a.contentType}))}),signal:AbortSignal.timeout(20000),redirect:'error'});
        if(!response.ok)return completed(user,message,{status:response.status<500?'FAILED':'REQUIRES_REVIEW',notice:'Resend no ha confirmado el envío. Revisa la cuenta y el resultado antes de repetir.'});
        const sent=await response.json();if(!sent.id)throw new Error('Unconfirmed');return completed(user,message,{status:'SUBMITTED',providerId:sent.id,accepted:[...new Set([to,cc])],rejected:[],notice:'Resend ha aceptado el correo para el cliente y el espacio. La entrega final aún no está confirmada.'});
      }
      connection=smtp(c);const sent=await connection.sendMail({from:{name:c.name,address:c.from},replyTo:c.from,to:[to],cc:[cc],envelope:{from:c.from,to:[...new Set([to,cc])]},subject,text:body,attachments,messageId:'<'+message.id+'@'+c.from.split('@')[1]+'>',disableFileAccess:true,disableUrlAccess:true});
      const accepted=(sent.accepted||[]).map(v=>String(v).toLowerCase()),rejected=(sent.rejected||[]).map(v=>String(v).toLowerCase());const complete=[to,cc].every(v=>accepted.includes(v))&&!rejected.length;
      return completed(user,message,{status:complete?'SUBMITTED':accepted.length?'PARTIAL':'REQUIRES_REVIEW',providerId:sent.messageId||null,accepted,rejected,notice:complete?'IONOS ha aceptado el correo para el cliente y el espacio. La entrega final aún no está confirmada.':'IONOS no ha confirmado todos los destinatarios. Revisa el resultado antes de repetir para evitar duplicados.'});
    }catch(error){return completed(user,message,{status:['EAUTH','EENVELOPE','EMESSAGE'].includes(error.code)?'FAILED':'REQUIRES_REVIEW',notice:'No se ha podido confirmar el envío completo. Comprueba el buzón y los destinatarios antes de preparar otro envío.'});}finally{connection?.close();}
  }
  async function sendWhatsApp(user){admin(user);fail(410,'El envío se confirma en WhatsApp. Abre el contacto desde el evento.');}
  function prepareWhatsApp(user,eventId,data){
    admin(user);const p=preview(user,eventId);if(data.digest!==p.digest)fail(409,'Los datos del evento han cambiado. Revisa el mensaje.');if(demo)fail(403,'La demo no abre conversaciones reales.');
    const to=phone(p.phone);if(data.to!==undefined&&phone(data.to)!==to)fail(400,'Usa el teléfono de la persona de contacto guardado en el evento.');const body=text(data.body,4000,true),encoded=encodeURIComponent(body);
    return {to,appUrl:'whatsapp://send?phone='+to+'&text='+encoded,url:'https://wa.me/'+to+'?text='+encoded,notice:'Confirma el envío en tu aplicación de WhatsApp. B2BE no registra el borrador como enviado.'};
  }
  return {status,saveMail,saveWhatsApp,preview,list,sendEmail,sendWhatsApp,prepareWhatsApp};
}
module.exports={createCustomerCommunications,address,phone};
