'use strict';
const {EventEmitter}=require('node:events');
const crypto=require('node:crypto');
const {id,now,text,fail,admin,ops,canVenue,CLOSED,STATUSES}=require('./store');
const defaults={
  NEW_REQUEST:{nextAction:'Revisar nueva petición',waitingOn:'MARQUEE'},
  PENDING_REVIEW:{nextAction:'Revisar expediente',waitingOn:'MARQUEE'},
  INFORMATION_PENDING:{nextAction:'Aportar la información solicitada',waitingOn:'VENUE'},
  PREPARING_BUDGET:{nextAction:'Preparar presupuesto',waitingOn:'MARQUEE'},
  BUDGET_SENT:{nextAction:'Revisar presupuesto vigente',waitingOn:'VENUE'},
  PENDING_RESPONSE:{nextAction:'Responder al presupuesto',waitingOn:'VENUE'},
  NEGOTIATION:{nextAction:'Revisar cambios solicitados',waitingOn:'MARQUEE'},
  CONFIRMED:{nextAction:'Preparar montaje y coordinación',waitingOn:'MARQUEE'}
};
const day=at=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).format(at);
function rules(state){return Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,{...value,days:1,...state.settings.workflowRules?.[key]}]));}
function install(Store){
  if(Store.prototype.operationalInstalled)return;Store.prototype.operationalInstalled=true;
  const transaction=Store.prototype.transaction;
  Store.prototype.transaction=function(actor,action,fn){
    const result=transaction.call(this,actor,action,state=>{
      const previous=new Map(state.events.map(e=>[e.id,{status:e.status,nextAction:e.nextAction,nextActionDue:e.nextActionDue,waitingOn:e.waitingOn}]));
      const value=fn(state),configured=rules(state);
      for(const event of state.events){
        if(CLOSED.includes(event.status))continue;
        const before=previous.get(event.id),rule=configured[event.status]||defaults.NEW_REQUEST;
        const responsible=state.users.find(u=>u.id===event.assignedCommercialId&&u.active&&ops(u));
        if(!responsible){const replacement=state.users.find(u=>u.active&&u.role==='COMMERCIAL')||state.users.find(u=>u.active&&u.role==='ADMIN');if(replacement){event.assignedCommercialId=replacement.id;if(before)this.history(event,actor||replacement,'Se asignó una persona responsable para mantener el seguimiento','RESPONSIBLE_ASSIGNED');}}
        if(!event.nextAction||(before&&before.status!==event.status&&before.nextAction===event.nextAction))event.nextAction=rule.nextAction;
        if(!event.waitingOn||event.waitingOn==='NONE'||(before&&before.status!==event.status&&before.waitingOn===event.waitingOn))event.waitingOn=rule.waitingOn;
        if(!event.nextActionDue||!before||(before.status!==event.status&&before.nextActionDue===event.nextActionDue))event.nextActionDue=day(new Date(Date.now()+(rule.days||1)*86400000));
      }
      return value;
    });
    if(this.changes)queueMicrotask(()=>this.changes.emit('change'));
    return result;
  };
  Store.prototype.changeEmitter=function(){if(!this.changes){this.changes=new EventEmitter();this.changes.setMaxListeners(200);}return this.changes;};
  Store.prototype.saveRules=function(user,data){admin(user);return this.transaction(user,'WORKFLOW_RULES_UPDATED',state=>{const result={};for(const [key,value]of Object.entries(data.rules||{})){if(!defaults[key])fail(400,'Estado no válido.');const days=Number(value.days);if(!Number.isInteger(days)||days<1||days>30)fail(400,'El plazo debe estar entre 1 y 30 días.');if(!['MARQUEE','VENUE','AGENCY','CLIENT'].includes(value.waitingOn))fail(400,'Indica quién debe responder.');result[key]={nextAction:text(value.nextAction,500,true),waitingOn:value.waitingOn,days};}state.settings.workflowRules={...state.settings.workflowRules,...result};return rules(state);});};
}
function dailySummary(store,user,at=new Date()){
  const state=store.view(user),today=day(at),events=state.events.filter(e=>!CLOSED.includes(e.status));
  const mine=events.filter(e=>ops(user)?e.assignedCommercialId===user.id&&e.waitingOn==='MARQUEE':e.waitingOn==='VENUE');
  return {date:today,open:events.length,mine:mine.map(e=>({id:e.id,eventName:e.eventName,nextAction:e.nextAction,due:e.nextActionDue})),overdue:events.filter(e=>e.nextActionDue&&e.nextActionDue<today).map(e=>({id:e.id,eventName:e.eventName,nextAction:e.nextAction})),unread:state.notifications.filter(n=>!n.readAt).length};
}
function createAutomation(store){
  function run(at=new Date()){
    const today=day(at),hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Madrid',hour:'2-digit',hourCycle:'h23'}).format(at));
    const source=store.read(),items=[];
    for(const event of source.events.filter(e=>!CLOSED.includes(e.status))){
      const old=Date.parse(event.updatedAt)<at.getTime()-(source.settings.staleDays||5)*86400000;
      const overdue=event.nextActionDue&&event.nextActionDue<today;
      if(!old&&!overdue)continue;
      const recipients=event.waitingOn==='VENUE'?source.users.filter(u=>u.active&&u.role==='VENUE_USER'&&canVenue(u,event.venueId)):source.users.filter(u=>u.active&&u.id===event.assignedCommercialId);
      for(const user of recipients){const key=today+':'+event.id+':'+user.id+':'+(overdue?'due':'stale');if(source.notifications.some(n=>n.automationKey===key))continue;items.push({id:id(),recipientId:user.id,eventId:event.id,type:'REMINDER',title:overdue?'Próxima acción vencida':'Evento sin actividad',body:event.eventName+' · '+event.nextAction,createdAt:at.toISOString(),readAt:null,automationKey:key});}
    }
    const digests=[];
    if(hour>=9)for(const user of source.users.filter(u=>u.active&&u.preferences?.dailySummary!==false)){
      const key='digest:'+today+':'+user.id;if(source.outbox.some(n=>n.automationKey===key))continue;
      const summary=dailySummary(store,user,at);if(!summary.open)continue;
      digests.push({id:id(),recipientId:user.id,type:'notification',subject:'Marquee Audiovisuales · Resumen del día',body:summary.mine.length+' acciones pendientes de ti. '+summary.overdue.length+' acciones vencidas.\n'+summary.mine.slice(0,20).map(e=>e.eventName+': '+e.nextAction).join('\n'),createdAt:at.toISOString(),attempts:0,nextAttemptAt:at.toISOString(),automationKey:key});
    }
    if(items.length||digests.length)store.transaction(null,'AUTOMATIC_FOLLOW_UP',state=>{
      for(const item of items)if(!state.notifications.some(n=>n.automationKey===item.automationKey)){state.notifications.unshift(item);const user=state.users.find(u=>u.id===item.recipientId);if(user?.preferences?.reminders!==false)state.outbox.push({id:item.id,recipientId:item.recipientId,eventId:item.eventId,type:'notification',subject:'Marquee Audiovisuales · '+item.title,body:item.body,createdAt:item.createdAt,attempts:0,nextAttemptAt:item.createdAt,automationKey:item.automationKey});}
      for(const digest of digests)if(!state.outbox.some(n=>n.automationKey===digest.automationKey))state.outbox.push(digest);
    });
    return {reminders:items.length,digests:digests.length};
  }
  return {run};
}
function madridUtc(date,time){const [year,month,d]=date.split('-').map(Number),[hour,minute]=time.split(':').map(Number),nominal=Date.UTC(year,month-1,d,hour,minute);let candidate=nominal;for(let i=0;i<3;i++){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(candidate).map(p=>[p.type,p.value]));const displayed=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute));candidate+=nominal-displayed;}return new Date(candidate).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');}
const escapeIcs=value=>String(value||'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
const fold=line=>{const lines=[];let current='',size=0;for(const char of line){const n=Buffer.byteLength(char);if(size+n>73){lines.push(current);current=' ';size=1;}current+=char;size+=n;}lines.push(current);return lines.join('\r\n');};
function calendar(store,user){
  const state=store.view(user),lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Marquee Audiovisuales//Eventos//ES','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:Marquee Audiovisuales'];
  for(const event of state.events){const venue=state.venues.find(v=>v.id===event.venueId);lines.push('BEGIN:VEVENT','UID:'+event.id+'@marquee-events','DTSTAMP:'+new Date(event.updatedAt).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''),'SEQUENCE:'+(event.revision||0),'SUMMARY:'+escapeIcs(event.eventName),'LOCATION:'+escapeIcs(venue?.name));
    if(event.estimatedStartTime&&event.estimatedEndTime){const endDate=event.estimatedEndTime<=event.estimatedStartTime?new Date(Date.parse(event.eventDate)+86400000).toISOString().slice(0,10):event.eventDate;lines.push('DTSTART:'+madridUtc(event.eventDate,event.estimatedStartTime),'DTEND:'+madridUtc(endDate,event.estimatedEndTime));}
    else lines.push('DTSTART;VALUE=DATE:'+event.eventDate.replaceAll('-',''),'DTEND;VALUE=DATE:'+new Date(Date.parse(event.eventDate)+86400000).toISOString().slice(0,10).replaceAll('-',''));
    lines.push('STATUS:'+(['CANCELLED','NOT_ACCEPTED'].includes(event.status)?'CANCELLED':['CONFIRMED','COMPLETED'].includes(event.status)?'CONFIRMED':'TENTATIVE'),'END:VEVENT');
  }
  lines.push('END:VCALENDAR');return lines.map(fold).join('\r\n')+'\r\n';
}
function createCalendarToken(store,user){const token=crypto.randomBytes(32).toString('base64url');store.transaction(user,'CALENDAR_SUBSCRIPTION_CREATED',state=>{const current=state.users.find(u=>u.id===user.id);current.calendarTokenHash=crypto.createHash('sha256').update(token).digest('hex');});return token;}
function calendarUser(store,token){if(!/^[A-Za-z0-9_-]{43}$/.test(token))return null;const hash=crypto.createHash('sha256').update(token).digest('hex');const state=store.read();return state.users.find(u=>u.active&&u.calendarTokenHash===hash&&(ops(u)||state.venues.some(v=>v.state==='ACTIVE'&&canVenue(u,v.id))))||null;}
module.exports={install,rules,dailySummary,createAutomation,calendar,createCalendarToken,calendarUser};
