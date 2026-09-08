'use strict';
const PDFDocument=require('pdfkit');
const {fail,text,date,ops}=require('./store');
function quoteValues(data){
  if(!Array.isArray(data.lines)||!data.lines.length||data.lines.length>100)fail(400,'Añade entre 1 y 100 conceptos.');
  const lines=data.lines.map(line=>{const quantity=Number(line.quantity),unitCents=Math.round(Number(line.unitPrice)*100);if(!Number.isFinite(quantity)||quantity<=0||quantity>100000||!Number.isSafeInteger(unitCents)||unitCents<0||unitCents>100000000)fail(400,'Revisa las cantidades y precios.');return {description:text(line.description,500,true),quantity,unitCents,totalCents:Math.round(quantity*unitCents)};});
  const taxRate=Number(data.taxRate??21);if(!Number.isFinite(taxRate)||taxRate<0||taxRate>100)fail(400,'Revisa el porcentaje de impuestos.');
  const subtotalCents=lines.reduce((sum,l)=>sum+l.totalCents,0),taxCents=Math.round(subtotalCents*taxRate/100),totalCents=subtotalCents+taxCents;if(!Number.isSafeInteger(totalCents)||totalCents>10000000000)fail(400,'El importe supera el máximo permitido.');
  return {lines,subtotalCents,taxRate,taxCents,totalCents,validUntil:date(data.validUntil),notes:text(data.notes,5000)};
}
async function quotePdf(quote,event,venue,demo){
  const doc=new PDFDocument({size:'A4',margin:45,info:{Title:'Presupuesto · '+event.eventName,Author:'Marquee Audiovisuales'}}),chunks=[];
  const result=new Promise((resolve,reject)=>{doc.on('data',chunk=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
  const money=cents=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(cents/100);
  doc.fillColor('#49317f').font('Helvetica-Bold').fontSize(22).text('MARQUEE AUDIOVISUALES');doc.moveDown(.6).fontSize(17).fillColor('#222222').text('Presupuesto');
  if(demo)doc.moveDown(.4).fontSize(10).fillColor('#8a5f00').text('DEMO · Datos ficticios · Sin validez comercial');
  doc.moveDown().fillColor('#222222').font('Helvetica-Bold').fontSize(12).text(event.eventName);doc.font('Helvetica').fontSize(10).text('Cliente: '+(event.finalClient||'Por confirmar')).text('Espacio: '+venue.name).text('Fecha del evento: '+event.eventDate);if(quote.validUntil)doc.text('Propuesta válida hasta: '+quote.validUntil);doc.moveDown();
  doc.table({columnStyles:[260,55,90,100],data:[[{text:'Concepto',options:{font:{family:'Helvetica-Bold'}}},'Cantidad','Precio unitario','Importe'],...quote.lines.map(l=>[l.description,String(l.quantity),money(l.unitCents),money(l.totalCents)])]});
  doc.moveDown().fontSize(11).text('Base: '+money(quote.subtotalCents),{align:'right'}).text('Impuestos ('+quote.taxRate+'%): '+money(quote.taxCents),{align:'right'}).font('Helvetica-Bold').fontSize(14).text('TOTAL: '+money(quote.totalCents),{align:'right'});
  if(quote.notes)doc.moveDown().font('Helvetica').fontSize(10).text(quote.notes);doc.end();return result;
}
async function generate(store,user,eventId,data,demo){
  if(!ops(user))fail(403,'Solo Marquee puede elaborar presupuestos.');
  const state=store.read(),event=store.event(state,user,eventId,data.revision),venue=state.venues.find(v=>v.id===event.venueId),quote=quoteValues(data);
  const bytes=await quotePdf(quote,event,venue,demo);
  return store.addFile(user,eventId,{kind:'budgets',revision:data.revision,status:data.publish===true?'SENT':'DRAFT',originalName:'presupuesto.pdf',displayName:demo?'Presupuesto de demostración · sin validez comercial':'Presupuesto · '+event.eventName,mimeType:'application/pdf',amount:quote.totalCents/100,validUntil:quote.validUntil,generatedQuote:data},bytes);
}
module.exports={quoteValues,quotePdf,generate};
