'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {createPortal}=require('../portal/server'),{accounts,password}=require('../portal/demo');
const {quoteValues,quotePdf}=require('../portal/commercial'),{validateLogo}=require('../portal/branding');
const {inventory}=require('../portal/continuity'),{verifyRecovery}=require('../portal/reliability');
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAE0lEQVR4nGMU0bBhgAEmOAsvBwAYTACA+VkgCQAAAABJRU5ErkJggg==','base64');
async function fixture(t){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'b2be-branding-')),portal=createPortal({env:{DEMO_MODE:'1',APP_ORIGIN:'http://demo.test',DATA_DIR:directory},noAutomaticBackup:true,noAutomaticMail:true});
  await new Promise(resolve=>portal.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+portal.server.address().port;
  t.after(async()=>{portal.closeStreams();await new Promise(resolve=>portal.server.close(resolve));fs.rmSync(directory,{recursive:true,force:true});});
  const clients=[];
  for(const a of accounts){const login=await fetch(base+'/api/login',{method:'POST',headers:{Origin:'http://demo.test','Content-Type':'application/json'},body:JSON.stringify({email:a.email,password})}),session=await login.json(),cookie=login.headers.get('set-cookie').split(';')[0];assert.equal(login.status,200);
    clients.push(async(route,method='GET',body)=>{const response=await fetch(base+'/api'+route,{method,headers:{Origin:'http://demo.test','Content-Type':'application/json',Cookie:cookie,'X-CSRF-Token':session.csrf},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:response.headers.get('content-type').includes('json')?await response.json():Buffer.from(await response.arrayBuffer())};});
  }
  const [admin,commercial,venue]=clients;return {directory,portal,base,admin,commercial,venue};
}
async function pdfText(bytes){const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const pdf=await getDocument({data:new Uint8Array(bytes),useSystemFonts:true,isEvalSupported:false,useWasm:false}).promise;try{const pages=[];for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i),text=await p.getTextContent();pages.push(text.items.map(item=>item.str).join(' '));}return pages;}finally{await pdf.loadingTask.destroy();}}
test('Branding is scoped, revision checked, previewed without saving, and logos survive recovery/export',async t=>{
  const f=await fixture(t),[first,second]=f.portal.store.read().venues,route='/venues/'+first.id;
  const logo={name:'identidad.png',base64:PNG.toString('base64')};
  const data={revision:0,displayName:'Alameda Eventos',tagline:'Encuentros con personalidad',footer:'Madrid · eventos@example.test',accent:'#17675e',logo};
  assert.equal((await f.commercial(route+'/branding','PATCH',data)).status,403);
  assert.equal((await f.venue('/venues/'+second.id+'/branding','PATCH',data)).status,404);
  assert.equal((await f.venue('/venues/'+second.id+'/branding-preview.pdf')).status,404);
  assert.equal((await fetch(f.base+'/api'+route+'/logo')).status,401);
  const preview=await f.venue(route+'/branding-preview.pdf','POST',data);assert.equal(preview.status,200,JSON.stringify(preview.data));assert.equal(f.portal.store.read().venues[0].branding,undefined);
  const previewText=(await pdfText(preview.data)).join(' ');assert.match(previewText,/Alameda Eventos/);assert.match(previewText,/Sin validez comercial/);
  const saved=await f.venue(route+'/branding','PATCH',data);assert.equal(saved.status,200,JSON.stringify(saved.data));assert.equal(saved.data.result.revision,1);assert.equal(saved.data.result.logo.base64,undefined);
  assert.deepEqual((await f.venue(route+'/logo')).data,PNG);assert.equal((await f.venue('/venues/'+second.id+'/logo')).status,404);
  assert.equal((await f.admin(route+'/branding','PATCH',data)).status,409);
  assert.equal((await f.admin(route+'/branding','PATCH',{revision:1,accent:'red; background:url(x)'})).status,400);
  assert.equal((await f.admin(route+'/branding','PATCH',{revision:1,logo:{name:'bad.png',base64:PNG.subarray(0,20).toString('base64')}})).status,400);
  const actor=f.portal.store.read().users[0],archive=f.portal.store.exportArchive(actor);assert.equal(archive.venues[0].branding.logo.base64,logo.base64);
  const backup=f.portal.store.backup('branding test'),source=path.join(f.directory,'backups',backup.filename),restored=path.join(f.directory,'restored');const before=inventory(source);verifyRecovery(source,restored,backup.sha256);assert.equal(inventory(path.join(restored,'marquee.sqlite')).businessSha256,before.businessSha256);
  const state=f.portal.store.read();state.venues[0].branding.logo.base64=Buffer.from('changed').toString('base64');f.portal.store.db.prepare('UPDATE state SET value=? WHERE id=1').run(JSON.stringify(state));const damaged=f.portal.store.backup('invalid logo');assert.throws(()=>inventory(path.join(f.directory,'backups',damaged.filename)),/logotipo/);
});
test('Logo rejects invalid formats, CRC corruption, excess size, dimensions and decompression bombs',()=>{
  assert.equal(validateLogo({base64:PNG.toString('base64')}).mimeType,'image/png');
  for(const bytes of [Buffer.from('<svg onload="alert(1)"></svg>'),Buffer.alloc(1024*1024+1),PNG.subarray(0,32)])assert.throws(()=>validateLogo({base64:bytes.toString('base64')}));
  const bad=Buffer.from(PNG);bad[45]^=255;assert.throws(()=>validateLogo({base64:bad.toString('base64')}));
  const huge=Buffer.from(PNG);huge.writeUInt32BE(90000,16);assert.throws(()=>validateLogo({base64:huge.toString('base64')}));
});
test('Published orders keep their venue identity and emitted budget bytes after rebranding',async t=>{
  const f=await fixture(t),state=f.portal.store.read(),venue=state.venues[0],event=state.events.find(e=>e.venueId===venue.id&&e.status==='CONFIRMED');
  const oldBudget=Buffer.from(f.portal.store.file(state.users[0],event.budgets[0].fileKey).bytes);
  assert.equal((await f.admin('/venues/'+venue.id+'/branding','PATCH',{revision:0,displayName:'Primera identidad',accent:'#21574b',logo:{base64:PNG.toString('base64')}})).status,200);
  let p=(await f.admin('/events/'+event.id+'/production')).data;
  p.draft.requiredUserIds=p.people.filter(u=>u.role!=='COMMERCIAL').map(u=>u.id);p.draft.steps.forEach((step,i)=>{step.time=String(10+i).padStart(2,'0')+':00';step.ownerId=p.people[0].id;});
  const fresh=()=>f.portal.store.read().events.find(e=>e.id===event.id);
  assert.equal((await f.admin('/events/'+event.id+'/production/draft','POST',{revision:fresh().revision,draft:p.draft})).status,200);
  const release=(await f.admin('/events/'+event.id+'/production/publish','POST',{revision:fresh().revision,confirm:true})).data.result;assert.ok(release);
  const hash=release.sha256;assert.equal((await f.admin('/venues/'+venue.id+'/branding','PATCH',{revision:1,displayName:'Segunda identidad',accent:'#884122',removeLogo:true})).status,200);
  const pdf=await f.venue('/events/'+event.id+'/production/releases/'+release.id+'.pdf');assert.equal(pdf.status,200);const content=(await pdfText(pdf.data)).join(' ');assert.match(content,/Primera identidad/);assert.doesNotMatch(content,/Segunda identidad/);
  assert.equal(fresh().production.releases[0].sha256,hash);assert.equal(crypto.createHash('sha256').update(JSON.stringify(fresh().production.releases[0].snapshot)).digest('hex'),hash);
  assert.deepEqual(f.portal.store.file(state.users[0],event.budgets[0].fileKey).bytes,oldBudget);
});
test('Long budgets preserve all concepts, exact totals, repeated headers and page numbers',async()=>{
  const lines=Array.from({length:60},(_,i)=>({description:'Servicio '+String(i+1).padStart(3,'0')+' · Coordinación audiovisual, montaje, pruebas de sonido y atención técnica durante el evento. '+(i===35?'Observaciones extensas. '.repeat(15):''),quantity:2,unitPrice:123.45}));
  const quote=quoteValues({lines,taxRate:21,notes:'Condiciones finales verificables: el material se recogerá tras finalizar el evento.'}),venue={name:'Espacio de prueba',branding:{displayName:'Alameda Eventos',accent:'#ffffff',footer:'Contacto del espacio · Documento de prueba'}},pdf=await quotePdf(quote,{id:'example',eventName:'Encuentro anual de clientes',eventDate:'2028-03-18',finalClient:'Empresa Horizonte'},venue,true);
  const pages=await pdfText(pdf),all=pages.join(' ');assert.ok(pages.length>=4);for(let i=1;i<=60;i++)assert.match(all,new RegExp('Servicio '+String(i).padStart(3,'0')));
  assert.match(all,/17.924,94/);assert.match(all,/Condiciones finales verificables/);pages.forEach((page,i)=>{assert.match(page,/Alameda Eventos/);assert.ok(page.includes((i+1)+' / '+pages.length));});
});
