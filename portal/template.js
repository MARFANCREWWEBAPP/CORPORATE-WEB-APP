'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
function buildPortal() {
  let html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  if(crypto.createHash('sha256').update(html).digest('hex')!=='e7b2f81b2a26010b8c96d3450349f5b4caa2b7430e2732be93ca8cf4c1e93472')throw new Error('La plantilla V4 original ha cambiado.');
  // The approved source stays byte-for-byte intact. Only the authenticated response is adapted.
  const replace=(pattern,value,count)=>{const matches=[...html.matchAll(new RegExp(pattern.source,pattern.flags.includes('g')?pattern.flags:pattern.flags+'g'))];if(matches.length!==count)throw new Error('Punto de integración V4 inesperado: '+pattern);html=html.replace(pattern,value);};
  replace(/  function loadData\(\) \{[\s\S]*?\n  \}/g,'  function loadData() { return {version:7,revision:0,users:[],venues:[],events:[],notifications:[],audit:[],settings:{showCommercialToVenue:true,staleDays:5,budgetResponseDays:4,automaticBackups:false}}; }',1);
  replace(/  function loadSession\(\) \{[\s\S]*?\n  \}/g,'  function loadSession() { return null; }',1);
  replace(/  function saveData\(\) \{[\s\S]*?\n  \}/g,'  function saveData() { /* Mutations are confirmed by the authenticated API. */ }',2);
  replace(/  function saveSession\(userId\) \{[\s\S]*?\n  \}/g,'  function saveSession() {}',1);
  replace(/  loadBackupCache\(false\);/g,'',1);
  html=html.replaceAll('localStorage','portalMemoryStorage');
  const memory='const portalMemoryValues = new Map(); const portalMemoryStorage = {getItem: key => portalMemoryValues.get(key) || null, setItem: (key,value) => portalMemoryValues.set(key,value), removeItem: key => portalMemoryValues.delete(key)};\n';
  html=html.replace(/const LOGO_DARK = [^;]+;/,"const LOGO_DARK = '/brand/b2be-logo.png';").replace(/const LOGO_WHITE = [^;]+;/,"const LOGO_WHITE = '/brand/b2be-logo.png';");
  // Place the storage facade in the same lexical scope as the original application.
  replace(/  function loadData\(\)/g,memory+'  function loadData()',1);
  let bridge=fs.readFileSync(path.join(__dirname,'client.js'),'utf8');
  bridge=bridge.replace('  portalBoot();',fs.readFileSync(path.join(__dirname,'client-workflows.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'client-operations.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'client-production.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'client-branding.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'client-reservations.js'),'utf8')+'\n  portalBoot();');
  replace(/  const initialPage = location.hash.replace/g,bridge+'\n  const initialPage = location.hash.replace',1);
  const styles=fs.readFileSync(path.join(__dirname,'portal.css'),'utf8');
  replace(/<\/style>/g,styles+'\n</style>',1);
  // Terminology is applied only to the live portal, preserving the approved historical source.
  const terms=[
    ['Nueva finca o espacio','Nuevo espacio de eventos'],['Nueva finca','Nuevo espacio de eventos'],['nueva finca','nuevo espacio de eventos'],
    ['Todas las fincas','Todos los espacios de eventos'],['todas las fincas','todos los espacios de eventos'],
    ['Las fincas','Los espacios de eventos'],['las fincas','los espacios de eventos'],
    ['La finca','El espacio de eventos'],['la finca','el espacio de eventos'],['Una finca','Un espacio de eventos'],['una finca','un espacio de eventos'],
    ['esta finca','este espacio de eventos'],['Cada finca','Cada espacio de eventos'],['cada finca','cada espacio de eventos'],
    ['Mi finca','Mi espacio de eventos'],['mis fincas','mis espacios de eventos'],
    ['Usuario finca','Usuario de espacio de eventos'],['usuario finca','usuario de espacio de eventos'],
    ['Finca creada','Espacio de eventos creado'],['Finca actualizada','Espacio de eventos actualizado'],['Finca guardada','Espacio de eventos guardado'],
    ['finca asignada','espacio de eventos asignado'],['finca asociada','espacio de eventos asociado'],
    ['FICHA TÉCNICA DE FINCA','FICHA TÉCNICA DEL ESPACIO DE EVENTOS'],
    ['FINCAS','ESPACIOS DE EVENTOS'],['FINCA','ESPACIO DE EVENTOS'],['Fincas','Espacios de eventos'],['fincas','espacios de eventos'],['Finca','Espacio de eventos'],['finca','espacio de eventos']
  ];
  for(const [from,to]of terms)html=html.replaceAll(from,to);
  html=html.replace(/\bMarquee Flow(?: V4)?\b/gi,'Marquee Audiovisuales').replaceAll('FLOW V4 · DEMO','DEMO').replaceAll('FLOW V4','ESPACIO DE EVENTOS');
  html=html.replaceAll('Borrador guardado automáticamente','Borrador en esta pestaña · envía para guardarlo');
  html=html.replaceAll('Un formulario guiado, con guardado automático y posibilidad de completar información más adelante.','La petición se guarda en el sistema al enviarla. Puedes completar después la información que falte.');
  html=html.replaceAll('Próximos y realizados','Confirmados actualmente');
  html=html.replaceAll('Espacio de eventos o espacio','Espacio de eventos').replaceAll('espacio de eventos o espacio','espacio de eventos').replaceAll('espacios de eventos o espacios','espacios de eventos');
  for(const [from,to]of [['de el espacio','del espacio'],['a el espacio','al espacio'],['misma espacio','mismo espacio'],['tu espacio de eventos','tu espacio de eventos'],['espacio de eventos activa','espacio de eventos activo'],['espacio de eventos obligatoria','espacio de eventos obligatorio'],['la primera espacio','el primer espacio']])html=html.replaceAll(from,to);
  html=html.replaceAll('app.data.venues.filter(v => v.id === user.venueId)','app.data.venues.filter(v => auditAllowedVenue(user,v.id))');
  html=html.replaceAll('d.estimatedStartTime || \"18:00\"','d.estimatedStartTime || \"\"').replaceAll('d.estimatedEndTime || \"23:30\"','d.estimatedEndTime || \"\"');
  html=html.replaceAll('Con estos datos la petición ya aparecerá en el calendario.','Elige la fecha del evento. La petición aparecerá en el calendario cuando la envíes.');
  html=html.replace(/<title>[^<]+<\/title>/,'<title>Marquee · B2BE</title>').replaceAll('alt="Marquee Audiovisuales"','alt="Marquee B2BE"');
  html=html.replaceAll('Corporate Event Workspace','Gestión de eventos entre empresas').replaceAll('<strong>Marquee Audiovisuales</strong>','<strong>Marquee B2BE</strong>').replaceAll('Marquee Audiovisuales organiza automáticamente','B2BE organiza automáticamente');
  return html;
}
module.exports={buildPortal};
