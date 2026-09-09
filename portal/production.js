'use strict';
const crypto = require('node:crypto');
const {id, now, text, date, choice, fail, ops, canVenue, CLOSED} = require('./store');

const CHANGE_FIELDS = ['eventName','eventDate','estimatedStartTime','estimatedEndTime','numberOfPeople','audiovisualRequest','technicalRequirements','room','setupMinutes','dismantleMinutes'];
const GUARDED_FIELDS = [...CHANGE_FIELDS, 'venueId'];
const STAGES = [['access','Llegada'],['setup','Montaje'],['technicalTest','Pruebas técnicas'],['doors','Apertura'],['eventStart','Inicio del evento'],['eventEnd','Fin del evento'],['dismantle','Desmontaje']];
const sha = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const person = user => ({id:user.id, name:[user.firstName,user.lastName].filter(Boolean).join(' '), role:user.role});
const eligible = (state,event) => state.users.filter(u => u.active && canVenue(u,event.venueId));
const approvalCore = event => Object.fromEntries(GUARDED_FIELDS.map(k => [k,event[k]??null]));
const core = event => ({...approvalCore(event),resourceIds:event.resourceIds||[],operationalTimes:event.operationalTimes||{}});
const basis = event => sha({core:core(event), acceptedBudgetId:event.acceptedBudgetId||null, acceptedAmountCents:event.acceptedAmountCents??null, currentBudgetId:event.budgets.find(b=>b.isCurrent&&b.status!=='DRAFT')?.id||null, applied:(event.changeRequests||[]).filter(c=>c.status==='APPLIED').map(c=>c.id)});
const money = value => {
  if (!/^-?\d+(\.\d{1,2})?$/.test(String(value))) fail(400,'Indica el suplemento con un máximo de dos decimales. Usa 0 si no tiene coste.');
  const cents = Math.round(Number(value)*100);
  if (!Number.isSafeInteger(cents)||Math.abs(cents)>1000000000) fail(400,'Importe no válido.');
  return cents;
};
function editable(event) { if(CLOSED.includes(event.status)) fail(409,'El evento está archivado. Se conserva la producción para consulta.'); }
function version(data) { if(!Number.isInteger(data.revision)) fail(400,'Falta la versión del evento.'); }
function ensure(event) {
  event.changeRequests ||= [];
  event.production ||= {draft:null,releases:[],checks:[],incidents:[]};
  return event.production;
}
function draftFor(state,event) {
  const ownerId=eligible(state,event).find(u=>u.id===event.assignedCommercialId)?.id || eligible(state,event).find(ops)?.id || '';
  return {instructions:'',material:event.audiovisualRequest||'',crew:'',contacts:'',planFileKeys:[],requiredUserIds:[],steps:STAGES.map(([key,label])=>({id:key,label,date:event.eventDate,time:/^\d{2}:\d{2}$/.test(event.operationalTimes?.[key]||'')?event.operationalTimes[key]:'',ownerId}))};
}
function validateDraft(state,event,input) {
  const users=eligible(state,event), allowed=new Set(users.map(u=>u.id));
  const result=Object.fromEntries(['instructions','material','crew','contacts'].map(k=>[k,text(input[k],15000)]));
  for(const key of ['planFileKeys','requiredUserIds']) {
    if(!Array.isArray(input[key])||input[key].length>100) fail(400,'Revisa documentos y personas de la orden.');
    result[key]=[...new Set(input[key])];
  }
  if(result.requiredUserIds.some(v=>!allowed.has(v))) fail(400,'Hay personas sin acceso a este evento.');
  if(result.planFileKeys.some(v=>!event.documents.some(f=>f.fileKey===v&&f.visibility==='SHARED'))) fail(400,'Los planos deben ser documentos compartidos de este evento.');
  if(!Array.isArray(input.steps)||input.steps.length<1||input.steps.length>50) fail(400,'Añade entre 1 y 50 pasos al horario.');
  const stepIds=new Set();
  result.steps=input.steps.map(step=>{
    const key=text(step.id,100,true);
    if(!/^[a-zA-Z0-9-]+$/.test(key)||stepIds.has(key)) fail(400,'Hay pasos repetidos o no válidos.');
    stepIds.add(key);
    if(!allowed.has(step.ownerId)) fail(400,'Cada paso debe tener una persona responsable con acceso al evento.');
    const time=text(step.time,5);
    if(time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) fail(400,'Revisa las horas del horario.');
    return {id:key,label:text(step.label,200,true),date:date(step.date,true),time,ownerId:step.ownerId};
  });
  return result;
}
function budgetSummary(budget) {
  return budget ? {id:budget.id,version:budget.version,fileKey:budget.fileKey,name:budget.displayName,sha256:budget.sha256,amountCents:budget.amountCents} : null;
}
function snapshot(state,event,draft) {
  const venue=state.venues.find(v=>v.id===event.venueId);
  const users=eligible(state,event);
  return {
    event:{...core(event),id:event.id,finalClient:event.finalClient||'',contact:[event.contactFirstName,event.contactLastName].filter(Boolean).join(' '),email:event.email||'',phone:event.phone||''},
    venue:{id:venue.id,name:venue.name,address:venue.address||'',branding:structuredClone(require('./branding').defaults(venue)),technicalProfile:venue.technicalProfile||{},technicalUpdatedAt:venue.technicalUpdatedAt||null},
    plan:{...structuredClone(draft),steps:draft.steps.map(s=>({...s,ownerName:users.some(u=>u.id===s.ownerId)?person(users.find(u=>u.id===s.ownerId)).name:'Sin acceso'})),plans:draft.planFileKeys.map(key=>{const f=event.documents.find(f=>f.fileKey===key);return {fileKey:key,name:f.displayName};})},
    participants:users.filter(u=>draft.requiredUserIds.includes(u.id)).map(person),
    acceptedBudget:budgetSummary(event.budgets.find(b=>b.id===event.acceptedBudgetId)),
    currentBudget:budgetSummary(event.budgets.find(b=>b.isCurrent&&['SENT','FINAL'].includes(b.status))),
    extras:(event.changeRequests||[]).filter(c=>c.status==='APPLIED').map(c=>({id:c.id,title:c.title,amountCents:c.quote.amountCents,approvedAt:c.decision.at})),
    basis:basis(event)
  };
}
function currentRelease(event) { return event.production?.releases.at(-1)||null; }
function stale(state,event,release) {
  if(!release)return false;
  const venue=state.venues.find(v=>v.id===event.venueId);
  return release.snapshot.basis!==basis(event)||sha(release.snapshot.venue.technicalProfile)!==sha(venue?.technicalProfile||{});
}
function install(Store) {
  if(Store.prototype.productionInstalled)return;
  Store.prototype.productionInstalled=true;
  // Guard the mutation inside its transaction, including callers outside HTTP.
  const values=Store.prototype.eventValues;
  const transaction=Store.prototype.transaction;
  Store.prototype.transaction=function(actor,action,fn){
    return transaction.call(this,actor,action,state=>{
      const guarded=action==='EVENT_UPDATED' ? new Map(state.events.filter(e=>e.acceptedAt||e.status==='CONFIRMED').map(e=>[e.id,sha(approvalCore(e))])) : null;
      const result=fn(state);
      if(guarded)for(const event of state.events)if(guarded.has(event.id)&&guarded.get(event.id)!==sha(approvalCore(event))) {
        throw Object.assign(new Error('Este evento ya está confirmado. Propón el cambio desde Producción para que el espacio apruebe su alcance y coste.'),{status:409,details:{kind:'approved-change'}});
      }
      return result;
    });
  };
  const view=Store.prototype.view;
  Store.prototype.view=function(user){
    const state=view.call(this,user);
    if(user.role!=='ADMIN'){delete state.settings.lastRecoveryDrill;delete state.settings.lastRecoveryDrillError;}
    for(const event of state.events){
      if(event.production){
        event.production.needsPublication=stale(state,event,currentRelease(event));
        if(!ops(user))event.production.draft=null;
      }
      for(const change of event.changeRequests||[])change.stale=['REQUESTED','QUOTED'].includes(change.status)&&change.basis!==basis(event);
    }
    return state;
  };
  Store.prototype.productionDraft=function(user,eventId,data){
    if(!ops(user))fail(403,'Marquee prepara la orden de producción.');version(data);
    return this.transaction(user,'PRODUCTION_DRAFT_SAVED',state=>{
      const event=this.event(state,user,eventId,data.revision);editable(event);
      const production=ensure(event);
      production.draft=validateDraft(state,event,data.draft);
      this.history(event,user,'Se guardó el borrador de producción','PRODUCTION_DRAFT_SAVED',true);
      return production.draft;
    });
  };
  Store.prototype.productionPublish=function(user,eventId,data){
    if(!ops(user))fail(403,'Marquee publica la orden de producción.');version(data);
    return this.transaction(user,'PRODUCTION_PUBLISHED',state=>{
      const event=this.event(state,user,eventId,data.revision);editable(event);
      if(event.status!=='CONFIRMED')fail(409,'Confirma el evento antes de publicar su orden de producción.');
      if(data.confirm!==true)fail(400,'Revisa la orden antes de publicarla.');
      const production=ensure(event);
      if(!production.draft)fail(400,'Prepara y guarda el borrador de producción.');
      const draft=validateDraft(state,event,production.draft);
      if(draft.steps.some(s=>!s.time))fail(400,'Completa la hora de cada paso antes de publicar.');
      const required=eligible(state,event).filter(u=>draft.requiredUserIds.includes(u.id));
      if(!required.some(ops)||!required.some(u=>u.role==='VENUE_USER'))fail(400,'Selecciona al menos una persona de Marquee y una del espacio para revisar la orden.');
      const content=snapshot(state,event,draft), hash=sha(content);
      if(currentRelease(event)?.sha256===hash)fail(409,'Esta orden ya está publicada.');
      const release={id:id(),version:production.releases.length+1,snapshot:content,sha256:hash,publishedAt:now(),publishedBy:person(user),acknowledgements:[]};
      production.releases.push(release);
      this.history(event,user,'Orden de producción V'+release.version+' publicada','PRODUCTION_PUBLISHED');
      productionNotify(state,event,user,'Nueva orden de producción','Revisa la versión '+release.version+' del evento.');
      return release;
    });
  };
  Store.prototype.productionAcknowledge=function(user,eventId,data){
    version(data);
    return this.transaction(user,'PRODUCTION_ACKNOWLEDGED',state=>{
      const event=this.event(state,user,eventId,data.revision);editable(event);
      const release=currentRelease(event);
      if(!release||release.id!==data.releaseId||release.sha256!==data.sha256||stale(state,event,release))fail(409,'La orden ha cambiado o necesita una nueva publicación. Abre la versión vigente.');
      if(data.confirm!==true)fail(400,'Confirma que has revisado esta versión.');
      let record=release.acknowledgements.find(a=>a.user.id===user.id);
      if(!record){record={user:person(user),at:now(),sha256:release.sha256};release.acknowledgements.push(record);this.history(event,user,'Ha revisado la orden de producción V'+release.version,'PRODUCTION_ACKNOWLEDGED');}
      return record;
    });
  };
  Store.prototype.productionCheck=function(user,eventId,data){
    version(data);
    return this.transaction(user,'PRODUCTION_STEP_UPDATED',state=>{
      const event=this.event(state,user,eventId,data.revision);editable(event);
      if(event.status!=='CONFIRMED')fail(409,'El evento debe estar confirmado.');
      const release=currentRelease(event);
      if(!release||release.id!==data.releaseId||stale(state,event,release))fail(409,'Revisa la orden vigente antes de actualizar el horario.');
      const step=release.snapshot.plan.steps.find(s=>s.id===data.stepId);
      if(!step)fail(404,'Paso no encontrado.');
      if(!ops(user)&&step.ownerId!==user.id)fail(403,'Solo la persona responsable o Marquee pueden actualizar este paso.');
      const status=choice(data.status,['PENDING','IN_PROGRESS','DONE','BLOCKED']);
      const note=text(data.note,3000,status==='BLOCKED');
      const checks=ensure(event).checks;
      let check=checks.find(c=>c.releaseId===release.id&&c.stepId===step.id);
      if(!check){check={id:id(),releaseId:release.id,stepId:step.id,history:[]};checks.push(check);}
      const entry={status,note,user:person(user),at:now()};check.history.push(entry);Object.assign(check,entry);
      this.history(event,user,step.label+': '+({PENDING:'pendiente',IN_PROGRESS:'en curso',DONE:'realizado',BLOCKED:'bloqueado'}[status]),'PRODUCTION_STEP_UPDATED');
      if(status==='BLOCKED')productionNotify(state,event,user,'Paso bloqueado',step.label+': '+note);
      return check;
    });
  };
  Store.prototype.productionIncident=function(user,eventId,incidentId,data){
    version(data);
    return this.transaction(user,'PRODUCTION_INCIDENT_UPDATED',state=>{
      const event=this.event(state,user,eventId,data.revision);editable(event);
      const production=ensure(event),users=eligible(state,event);
      let incident=production.incidents.find(i=>i.id===incidentId);
      if(incidentId&&!incident)fail(404,'Incidencia no encontrada.');
      if(incident&&!ops(user)&&incident.ownerId!==user.id&&incident.createdBy.id!==user.id)fail(403,'Solo la persona responsable, quien la creó o Marquee pueden actualizar esta incidencia.');
      if(!incident){
        if(!users.some(u=>u.id===data.ownerId))fail(400,'Asigna la incidencia a una persona con acceso al evento.');
        const photos=data.photoFileKeys||[];
        if(!Array.isArray(photos)||photos.length>10||photos.some(key=>!event.documents.some(f=>f.fileKey===key&&f.visibility==='SHARED'&&['image/jpeg','image/png'].includes(f.mimeType))))fail(400,'Selecciona fotografías compartidas de este evento.');
        incident={id:id(),title:text(data.title,200,true),detail:text(data.detail,5000,true),severity:choice(data.severity,['LOW','MEDIUM','HIGH','CRITICAL']),ownerId:data.ownerId,photoFileKeys:[...new Set(photos)],createdBy:person(user),createdAt:now(),status:'OPEN',history:[]};
        production.incidents.push(incident);
      }else{
        incident.status=choice(data.status,['OPEN','IN_PROGRESS','RESOLVED']);
        const note=text(data.note,3000,true);
        incident.history.push({status:incident.status,note,user:person(user),at:now()});
        incident.resolvedAt=incident.status==='RESOLVED'?now():null;
      }
      this.history(event,user,'Incidencia: '+incident.title,'PRODUCTION_INCIDENT_UPDATED');
      productionNotify(state,event,user,'Incidencia del evento',incident.title);
      return incident;
    });
  };
  Store.prototype.proposeChange=function(user,eventId,data){
    version(data);
    return this.transaction(user,'CHANGE_PROPOSED',state=>{
      const event=this.event(state,user,eventId,data.revision);editable(event);
      if(event.status!=='CONFIRMED')fail(409,'Los cambios con aprobación se utilizan en eventos confirmados.');
      const input=data.values;
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!CHANGE_FIELDS.includes(k)))fail(400,'Revisa los campos propuestos.');
      const changes=values.call(this,input);
      if('room'in input)changes.room=text(input.room,200);
      for(const key of ['setupMinutes','dismantleMinutes'])if(key in input){const n=Number(input[key]);if(!Number.isInteger(n)||n<0||n>10080)fail(400,'Revisa los minutos de montaje y desmontaje.');changes[key]=n;}
      for(const key of Object.keys(changes)){const fallback=['setupMinutes','dismantleMinutes'].includes(key)?0:key==='room'?'':null;if(JSON.stringify(changes[key]??fallback)===JSON.stringify(event[key]??fallback))delete changes[key];}
      const record={id:id(),title:text(data.title,200,true),reason:text(data.reason,5000,true),values:changes,before:Object.fromEntries(Object.keys(changes).map(k=>[k,event[k]??null])),basis:basis(event),createdBy:person(user),createdAt:now(),status:ops(user)?'QUOTED':'REQUESTED',quote:null,decision:null};
      if(ops(user))record.quote={amountCents:money(data.amount),notes:text(data.quoteNotes,5000,true),user:person(user),at:now()};
      ensure(event);event.changeRequests.push(record);
      this.history(event,user,'Cambio propuesto: '+record.title,'CHANGE_PROPOSED');
      productionNotify(state,event,user,ops(user)?'Cambio pendiente de aprobación':'Cambio pendiente de valoración',record.title);
      return record;
    });
  };
  Store.prototype.decideChange=function(user,eventId,changeId,data){
    version(data);
    return this.transaction(user,'CHANGE_REVIEWED',state=>{
      const event=this.event(state,user,eventId,data.revision);editable(event);
      if(event.status!=='CONFIRMED')fail(409,'El evento debe estar confirmado.');
      const record=(event.changeRequests||[]).find(c=>c.id===changeId);
      if(!record)fail(404,'Cambio no encontrado.');
      if(!['REQUESTED','QUOTED'].includes(record.status))fail(409,'Este cambio ya tiene una decisión definitiva.');
      const action=choice(data.action,['QUOTE','ACCEPT','REJECT','CANCEL']);
      if(action==='CANCEL'){
        if(!ops(user)&&record.createdBy.id!==user.id)fail(403,'Solo quien propuso el cambio o Marquee pueden retirarlo.');
        record.status='CANCELLED';record.decision={user:person(user),at:now(),note:text(data.note,3000,true)};
      }else if(action==='REJECT'){
        record.status='REJECTED';record.decision={user:person(user),at:now(),note:text(data.note,3000,true)};
      }else{
        if(record.basis!==basis(event))fail(409,'El evento cambió desde esta propuesta. Retírala y prepara una nueva con los datos actuales.');
        const candidate={...event,...record.values};
        if(action==='QUOTE'){
          if(!ops(user))fail(403,'Marquee debe valorar el cambio.');
          this.checkSchedule(state,candidate,data,user);
          record.quote={amountCents:money(data.amount),notes:text(data.quoteNotes,5000,true),user:person(user),at:now()};record.status='QUOTED';
        }else{
          if(user.role!=='VENUE_USER')fail(403,'La aprobación final corresponde a una cuenta del espacio de eventos.');
          if(record.status!=='QUOTED'||!record.quote)fail(409,'Marquee debe valorar el cambio antes de aprobarlo.');
          if(data.consent!==true)fail(400,'Confirma la aceptación del alcance y del importe.');
          this.checkSchedule(state,candidate,{},user);
          const extras=(event.changeRequests||[]).filter(c=>c.status==='APPLIED').reduce((sum,c)=>sum+c.quote.amountCents,0)+record.quote.amountCents;
          if(event.acceptedAmountCents!=null&&event.acceptedAmountCents+extras<0)fail(400,'El importe final no puede ser negativo.');
          Object.assign(event,record.values);
          record.status='APPLIED';record.decision={user:person(user),name:text(data.name,200,true),at:now(),consent:true,amountCents:record.quote.amountCents,sha256:sha({basis:record.basis,values:record.values,quote:record.quote})};
        }
      }
      this.history(event,user,record.title+': '+({QUOTED:'valorado',APPLIED:'aprobado y aplicado',REJECTED:'rechazado',CANCELLED:'retirado'}[record.status]),'CHANGE_REVIEWED');
      productionNotify(state,event,user,'Cambio actualizado',record.title);
      return record;
    });
  };
}
function productionNotify(state,event,user,title,body) {
  for(const recipient of eligible(state,event).filter(u=>u.id!==user.id))state.notifications.unshift({id:id(),recipientId:recipient.id,eventId:event.id,type:'PRODUCTION',title,body,createdAt:now(),readAt:null});
}
function getProduction(store,user,eventId) {
  const source=store.read(),event=store.event(source,user,eventId);
  const safe=store.view(user).events.find(e=>e.id===eventId);
  return {event:safe,people:eligible(source,event).map(person),draft:ops(user)?event.production?.draft||draftFor(source,event):null};
}
async function productionPdf(store,user,eventId,releaseId,demo) {
  const state=store.read(),event=store.event(state,user,eventId);
  const release=event.production?.releases.find(r=>r.id===releaseId);
  if(!release)fail(404,'Orden de producción no encontrada.');
  const {document,money,dateLabel}=require('./pdf-design'),s=release.snapshot;
  const pdf=document({venue:s.venue,title:'Orden de producción',reference:'ORDEN V'+release.version,demo});
  pdf.titleBlock(s.event.eventName,[['Espacio',s.venue.name],['Fecha',dateLabel(s.event.eventDate)],['Asistentes',s.event.numberOfPeople||'Por confirmar'],['Cliente',s.event.finalClient]]);
  if(CLOSED.includes(event.status))pdf.notice('EVENTO ARCHIVADO · Documento histórico');
  if(currentRelease(event)?.id!==release.id||stale(state,event,release))pdf.notice('VERSIÓN HISTÓRICA O PENDIENTE DE ACTUALIZACIÓN · Consulta el portal');
  if(s.venue.address)pdf.paragraph(s.venue.address,{size:9});
  pdf.paragraph('Contacto: '+([s.event.contact,s.event.phone,s.event.email].filter(Boolean).join(' · ')||'Por confirmar'),{size:9});
  pdf.section('Horario y responsables · hora de Madrid');
  pdf.table([{label:'Fecha / hora',width:100},{label:'Hito',width:pdf.width-260},{label:'Responsable',width:160}],s.plan.steps.map(step=>[dateLabel(step.date)+' · '+step.time,step.label,step.ownerName]));
  for(const [key,label]of [['instructions','Instrucciones de producción'],['material','Material y equipamiento'],['crew','Equipo técnico'],['contacts','Contactos de coordinación']]){pdf.section(label);pdf.paragraph(s.plan[key]);}
  pdf.section('Necesidades técnicas');pdf.paragraph(s.event.technicalRequirements);
  const labels={spaces:'Salas',loadingAccess:'Acceso de carga',loadingHours:'Horario de carga',power:'Potencia eléctrica',soundRestrictions:'Restricciones de sonido',ceilingHeight:'Altura',wifi:'Conexión',stage:'Escenario',parking:'Aparcamiento',plans:'Planos',contacts:'Contactos',restrictions:'Otras restricciones'};
  pdf.section('Ficha técnica del espacio');
  const technical=Object.entries(labels).filter(([key])=>s.venue.technicalProfile[key]);
  if(technical.length)for(const [key,label]of technical){pdf.paragraph(label,{bold:true,size:9,gap:3});pdf.paragraph(s.venue.technicalProfile[key]);}else pdf.paragraph('Ficha técnica pendiente de completar.');
  pdf.section('Documentos de referencia');
  pdf.paragraph(s.acceptedBudget?'Presupuesto aceptado V'+s.acceptedBudget.version+' · '+s.acceptedBudget.name:'Sin presupuesto aceptado adjunto');
  if(s.currentBudget&&s.currentBudget.id!==s.acceptedBudget?.id)pdf.paragraph('Último presupuesto publicado V'+s.currentBudget.version+' · Revisar su aceptación en el portal');
  for(const plan of s.plan.plans)pdf.paragraph('Plano/documento: '+plan.name);
  if(s.extras.length){pdf.section('Cambios aprobados');for(const extra of s.extras)pdf.paragraph(extra.title+' · '+money(extra.amountCents)+' (impuestos incluidos)');}
  pdf.section('Control de versión');pdf.paragraph('Publicada: '+release.publishedAt+' por '+release.publishedBy.name,{size:9});pdf.paragraph('Huella de la orden: '+release.sha256,{size:8});
  return pdf.finish();
}
module.exports={install,getProduction,productionPdf,CHANGE_FIELDS,STAGES,basis,sha,currentRelease};
