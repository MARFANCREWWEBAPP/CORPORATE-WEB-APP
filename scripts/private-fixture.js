'use strict';
require('../portal/server');
const crypto=require('node:crypto');
const {Store}=require('../portal/store');
const {generate}=require('../portal/commercial');
const {getProduction}=require('../portal/production');
const {save}=require('../portal/branding');
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAE0lEQVR4nGMU0bBhgAEmOAsvBwAYTACA+VkgCQAAAABJRU5ErkJggg==','base64');
async function privateFixture(directory,options={}){
  const store=new Store(directory,options),password='Test-'+crypto.randomBytes(24).toString('base64url');
  try{
    await store.provisionProtectedAdmin(password);
    const admin=store.read().users[0],venue=store.saveVenue(admin,null,{name:'Espacio de ensayo privado'});
    await store.createUser(admin,{firstName:'Comercial de ensayo',email:'comercial@stability.test',role:'COMMERCIAL',password});
    await store.createUser(admin,{firstName:'Espacio de ensayo',email:'espacio@stability.test',role:'VENUE_USER',venueId:venue.id,password});
    const user=store.read().users.find(u=>u.role==='VENUE_USER');
    save(store,admin,venue.id,{revision:0,displayName:'Identidad de ensayo',accent:'#21574b',logo:{base64:PNG.toString('base64')}});
    let event=store.createEvent(user,{eventName:'Recorrido privado completo',eventDate:'2028-11-01',estimatedStartTime:'18:00',estimatedEndTime:'20:00',numberOfPeople:100});
    const fresh=()=>store.read().events.find(e=>e.id===event.id);
    const budget=await generate(store,admin,event.id,{revision:event.revision,lines:[{description:'Servicio audiovisual de ensayo',quantity:1,unitPrice:1234.56}],taxRate:21,publish:true},false);
    store.budgetDecision(user,event.id,budget.id,{revision:fresh().revision,decision:'ACCEPTED',signature:{name:'Contacto de ensayo',consent:true}});
    const draft=getProduction(store,admin,event.id).draft;
    draft.requiredUserIds=[admin.id,user.id];draft.steps.forEach((step,i)=>{step.time=String(10+i).padStart(2,'0')+':00';step.ownerId=i?admin.id:user.id;});
    store.productionDraft(admin,event.id,{revision:fresh().revision,draft});
    const release=store.productionPublish(admin,event.id,{revision:fresh().revision,confirm:true});
    return {store,password,admin,user,venue,eventId:event.id,budget,release,fresh};
  }catch(error){store.close();throw error;}
}
module.exports={privateFixture};
