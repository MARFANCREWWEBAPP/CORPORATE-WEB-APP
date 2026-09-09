'use strict';
const PDFDocument=require('pdfkit');
const path=require('node:path');
const {defaults}=require('./branding');
const INK='#202938',MUTED='#596474',PAPER='#f3f5f8';
const money=cents=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(cents/100);
const dateLabel=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')?value.split('-').reverse().join('/'):String(value||'Por confirmar');
const plain=value=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'');
function document({venue,title,reference='',demo=false}){
  const brand=defaults(venue),doc=new PDFDocument({size:'A4',margins:{top:118,left:44,right:44,bottom:80},bufferPages:true,info:{Title:title,Author:'B2BE · Marquee Audiovisuales'}}),chunks=[];
  const result=new Promise((resolve,reject)=>{doc.on('data',b=>chunks.push(b));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
  const rgb=brand.accent.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  const accentText=(rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722)>.183?INK:brand.accent;
  const width=doc.page.width-88,bottom=doc.page.height-80;
  const font=(size=10,bold=false,color=INK)=>doc.font(bold?'Helvetica-Bold':'Helvetica').fontSize(size).fillColor(color);
  function header(){
    doc.save().rect(0,0,doc.page.width,6).fill(brand.accent).restore();
    if(brand.logo?.base64&&brand.logoBackground!=='white')doc.roundedRect(40,25,174,60,5).fill(brand.logoBackground==='accent'?brand.accent:INK);
    if(brand.logo?.base64)doc.image(Buffer.from(brand.logo.base64,'base64'),44,29,{fit:[166,52],align:'left',valign:'center'});
    else font(16,true).text(plain(brand.displayName),44,34,{width:260,height:43,ellipsis:true});
    doc.image(path.join(__dirname,'assets/b2be-logo.png'),doc.page.width-166,30,{fit:[122,43],align:'right'});
    font(8,false,MUTED).text(plain(brand.logo?brand.displayName:brand.tagline),44,87,{width:width-140,height:12,ellipsis:true});
    font(8,false,MUTED).text(plain(reference),doc.page.width-210,87,{width:166,align:'right',height:12,ellipsis:true});
    doc.moveTo(44,105).lineTo(doc.page.width-44,105).strokeColor('#dfe4ea').lineWidth(.7).stroke();doc.x=44;doc.y=118;
  }
  doc.on('pageAdded',header);header();
  function ensure(height){if(doc.y+height>bottom)doc.addPage();}
  function paragraph(value,{size=10,bold=false,color=INK,gap=8}={}){font(size,bold,color);doc.text(plain(value||'Sin especificar'),44,doc.y,{width,lineGap:3});doc.y+=gap;}
  function section(label){ensure(62);doc.y+=10;font(11,true,INK).text(plain(label),44,doc.y,{width});doc.y+=8;}
  function notice(label){const lines=wrap(label,width-24,9,true);ensure(lines.length*13+25);const y=doc.y,h=lines.length*13+16;doc.roundedRect(44,y,width,h,5).fill(PAPER);font(9,true,MUTED).text(lines.join('\n'),56,y+8,{width:width-24,lineGap:3});doc.y=y+h+10;}
  function wrap(value,w,size,bold=false){
    font(size,bold);const lines=[];
    for(const paragraph of plain(value).split('\n')){let line='';for(const word of paragraph.split(/\s+/)){if(!word)continue;if(doc.widthOfString((line?line+' ':'')+word)<=w){line+=(line?' ':'')+word;continue;}if(line)lines.push(line);line='';for(const char of word){if(doc.widthOfString(line+char)>w&&line){lines.push(line);line='';}line+=char;}}lines.push(line);}
    return lines.length?lines:[''];
  }
  function table(columns,rows){
    const rowFont=9,lineHeight=13,padding=9;
    function top(){ensure(54);const y=doc.y,h=32;doc.rect(44,y,width,h).fill(INK);let x=44;for(const c of columns){font(8,true,'#ffffff').text(c.label,x+padding,y+10,{width:c.width-2*padding,height:18,align:c.align||'left'});x+=c.width;}doc.y=y+h;}
    top();
    rows.forEach((row,index)=>{
      const cells=columns.map((c,i)=>wrap(row[i],c.width-2*padding,rowFont));let offset=0;const total=Math.max(...cells.map(c=>c.length));
      if(total*lineHeight+2*padding>bottom-doc.y&&total*lineHeight+2*padding<bottom-150){doc.addPage();top();}
      while(offset<total){
        let count=Math.floor((bottom-doc.y-2*padding)/lineHeight);
        if(count<1){doc.addPage();top();count=Math.floor((bottom-doc.y-2*padding)/lineHeight);}
        count=Math.min(count,total-offset);const h=count*lineHeight+2*padding,y=doc.y;
        doc.rect(44,y,width,h).fill(index%2===0?PAPER:'#ffffff');let x=44;
        for(let i=0;i<columns.length;i++){const c=columns[i];font(rowFont,false).text(cells[i].slice(offset,offset+count).join('\n'),x+padding,y+padding,{width:c.width-2*padding,lineGap:2,align:c.align||'left'});x+=c.width;}
        doc.y=y+h;offset+=count;
      }
    });doc.y+=12;
  }
  function titleBlock(subtitle,details=[]){
    font(9,true,accentText).text(plain(title).toLocaleUpperCase('es'),44,doc.y,{width});doc.y+=10;
    paragraph(subtitle,{size:23,bold:true,gap:13});
    if(brand.tagline&&brand.logo)paragraph(brand.tagline,{size:9,color:MUTED});
    if(demo)notice('DEMOSTRACIÓN · Datos ficticios · Sin validez comercial');
    for(const [label,value]of details)paragraph(label+': '+(value||'Por confirmar'),{size:10,gap:4});doc.y+=8;
  }
  function totals(quote){
    ensure(115);const x=doc.page.width-294,y=doc.y,w=250;
    doc.roundedRect(x,y,w,103,7).fill(PAPER);
    font(10,false,MUTED).text('Base imponible',x+16,y+14,{width:125});font(10).text(money(quote.subtotalCents),x+132,y+14,{width:102,align:'right'});
    font(10,false,MUTED).text('Impuestos ('+quote.taxRate+'%)',x+16,y+36,{width:125});font(10).text(money(quote.taxCents),x+132,y+36,{width:102,align:'right'});
    doc.moveTo(x+16,y+57).lineTo(x+w-16,y+57).strokeColor('#d7dee8').stroke();font(12,true).text('TOTAL',x+16,y+73,{width:65});font(16,true).text(money(quote.totalCents),x+81,y+69,{width:153,align:'right'});doc.y=y+116;
  }
  function finish(){
    const range=doc.bufferedPageRange();
    for(let i=range.start;i<range.start+range.count;i++){
      doc.switchToPage(i);const savedBottom=doc.page.margins.bottom;doc.page.margins.bottom=0;const y=doc.page.height-61;doc.moveTo(44,y-8).lineTo(doc.page.width-44,y-8).strokeColor('#dfe4ea').lineWidth(.7).stroke();
      font(8,false,MUTED).text(plain(brand.footer||brand.displayName),44,y,{width:width-85,height:25,lineGap:2,ellipsis:true});
      font(8,false,MUTED).text((i-range.start+1)+' / '+range.count,doc.page.width-110,y,{width:66,lineBreak:false,align:'right'});
      font(7,false,MUTED).text('B2BE by Marquee · Gestión y producción de eventos',44,doc.page.height-24,{lineBreak:false});doc.page.margins.bottom=savedBottom;
    }
    doc.end();return result;
  }
  return {doc,width,brand,ensure,paragraph,section,notice,table,titleBlock,totals,finish};
}
async function brandingPreview(venue,demo){
  const pdf=document({venue,title:'Vista previa de identidad',reference:'MUESTRA · No se guarda como presupuesto',demo});
  pdf.titleBlock('Tu próximo evento,\ncon tu propia identidad.',[['Espacio',venue.name],['Documento','Ejemplo de diseño · No válido como presupuesto']]);
  pdf.section('Una propuesta clara, de principio a fin');
  pdf.paragraph('Este diseño se aplica a los nuevos presupuestos y a las órdenes de producción del espacio. Los documentos ya emitidos conservan su contenido.');
  pdf.table([{label:'Concepto',width:pdf.width-210},{label:'Unidades',width:60,align:'right'},{label:'Precio',width:75,align:'right'},{label:'Importe',width:75,align:'right'}],[['Servicio audiovisual de ejemplo','1','1.000,00 €','1.000,00 €'],['Coordinación técnica de ejemplo','1','250,00 €','250,00 €']]);
  pdf.totals({subtotalCents:125000,taxCents:26250,totalCents:151250,taxRate:21});
  pdf.section('Coordinación y cuidado del detalle');pdf.paragraph('Logotipo proporcionado por el espacio. Servicios audiovisuales elaborados y coordinados por Marquee.');
  return pdf.finish();
}
module.exports={document,brandingPreview,money,dateLabel};
