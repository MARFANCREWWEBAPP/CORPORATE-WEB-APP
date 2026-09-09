'use strict';
const {fail,text,date,ops}=require('./store');
function quoteValues(data){
  if(!Array.isArray(data.lines)||!data.lines.length||data.lines.length>100)fail(400,'Añade entre 1 y 100 conceptos.');
  const lines=data.lines.map(line=>{const quantity=Number(line.quantity),unitCents=Math.round(Number(line.unitPrice)*100);if(!Number.isFinite(quantity)||quantity<=0||quantity>100000||!Number.isSafeInteger(unitCents)||unitCents<0||unitCents>100000000)fail(400,'Revisa las cantidades y precios.');return {description:text(line.description,500,true),quantity,unitCents,totalCents:Math.round(quantity*unitCents)};});
  const taxRate=Number(data.taxRate??21);if(!Number.isFinite(taxRate)||taxRate<0||taxRate>100)fail(400,'Revisa el porcentaje de impuestos.');
  const subtotalCents=lines.reduce((sum,l)=>sum+l.totalCents,0),taxCents=Math.round(subtotalCents*taxRate/100),totalCents=subtotalCents+taxCents;if(!Number.isSafeInteger(totalCents)||totalCents>10000000000)fail(400,'El importe supera el máximo permitido.');
  return {lines,subtotalCents,taxRate,taxCents,totalCents,validUntil:date(data.validUntil),notes:text(data.notes,5000)};
}
async function quotePdf(quote,event,venue,demo){
  const {document,money,dateLabel}=require('./pdf-design');
  const pdf=document({venue,title:'Presupuesto audiovisual',reference:event.id?'Evento '+event.id.slice(0,8):'',demo});
  pdf.titleBlock(event.eventName,[['Cliente',event.finalClient],['Espacio',venue.name],['Fecha del evento',dateLabel(event.eventDate)],...(quote.validUntil?[['Válido hasta',dateLabel(quote.validUntil)]]:[])]);
  pdf.paragraph('Propuesta elaborada por Marquee Audiovisuales para este espacio.',{size:9,color:'#596474'});
  pdf.section('Servicios incluidos');
  pdf.table([{label:'Concepto',width:pdf.width-210},{label:'Cantidad',width:60,align:'right'},{label:'Precio / ud.',width:75,align:'right'},{label:'Importe',width:75,align:'right'}],quote.lines.map(l=>[l.description,String(l.quantity),money(l.unitCents),money(l.totalCents)]));
  pdf.totals(quote);
  if(quote.notes){pdf.section('Condiciones y observaciones');pdf.paragraph(quote.notes);}
  pdf.paragraph('Puedes consultar y responder a esta propuesta desde el expediente del evento en B2BE.',{size:9,color:'#596474'});
  return pdf.finish();
}
async function generate(store,user,eventId,data,demo){
  if(!ops(user))fail(403,'Solo Marquee puede elaborar presupuestos.');
  const state=store.read(),event=store.event(state,user,eventId,data.revision),venue=state.venues.find(v=>v.id===event.venueId),quote=quoteValues(data);
  const bytes=await quotePdf(quote,event,venue,demo);
  return store.addFile(user,eventId,{kind:'budgets',revision:data.revision,status:data.publish===true?'SENT':'DRAFT',originalName:'presupuesto.pdf',displayName:demo?'Presupuesto de demostración · sin validez comercial':'Presupuesto · '+event.eventName,mimeType:'application/pdf',amount:quote.totalCents/100,validUntil:quote.validUntil,generatedQuote:data},bytes);
}
module.exports={quoteValues,quotePdf,generate};
