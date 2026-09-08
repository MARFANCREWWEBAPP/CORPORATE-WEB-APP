'use strict';
const {now,canVenue}=require('./store');
function createMail(store,env,security,fetcher=fetch){
  const configured=Boolean(env.RESEND_API_KEY&&env.MAIL_FROM&&env.APP_ORIGIN);
  let busy=false,lastError=null;
  async function flush(){if(busy||!configured)return;busy=true;try{
    const due=store.read().outbox.filter(n=>!n.sentAt&&!n.cancelledAt&&Date.parse(n.nextAttemptAt)<=Date.now()&&n.attempts<8).slice(0,20);
    for(const item of due){const state=store.read(),user=state.users.find(u=>u.id===item.recipientId&&u.active);const event=item.eventId?state.events.find(e=>e.id===item.eventId):null;
      if(!user||(item.eventId&&(!event||!canVenue(user,event.venueId)))||(item.expiresAt&&item.expiresAt<Date.now())){store.transaction(null,'EMAIL_CANCELLED',s=>{s.outbox.find(n=>n.id===item.id).cancelledAt=now();});continue;}
      try{
        const payload={from:env.MAIL_FROM,to:[user.email],subject:item.subject,text:item.secretBody?security.decrypt(item.secretBody):item.body+'\n'+new URL('/#notifications',env.APP_ORIGIN).href,...(env.MAIL_REPLY_TO?{reply_to:env.MAIL_REPLY_TO}:{})};
        const response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'marquee/'+item.id},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
        if(!response.ok)throw new Error('El proveedor rechazó el envío ('+response.status+').');const sent=await response.json();
        store.transaction(null,'EMAIL_SENT',s=>{const n=s.outbox.find(n=>n.id===item.id);n.sentAt=now();n.providerId=sent.id;delete n.secretBody;});lastError=null;
      }catch(error){lastError={at:now(),message:error.message};store.transaction(null,'EMAIL_RETRY',s=>{const n=s.outbox.find(n=>n.id===item.id);n.attempts++;n.lastError='No se pudo entregar al proveedor';n.nextAttemptAt=new Date(Date.now()+Math.min(3600000,60000*2**n.attempts)).toISOString();});}
    }
  }finally{busy=false;}}
  function status(){const queue=store.read().outbox;return {configured,provider:configured?'Resend':null,pending:queue.filter(n=>!n.sentAt&&!n.cancelledAt&&n.attempts<8).length,failed:queue.filter(n=>!n.sentAt&&!n.cancelledAt&&n.attempts>=8).length,sent:queue.filter(n=>n.sentAt).length,lastError};}
  return {configured,flush,status};
}
module.exports={createMail};
