'use strict';
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const PDFDocument=require('pdfkit');
const {fail,text,canVenue,now}=require('./store');
const MAX_LOGO=1024*1024, MAX_PIXELS=4000000;
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function crc(bytes){let result=0xffffffff;for(const value of bytes){result^=value;for(let bit=0;bit<8;bit++)result=(result>>>1)^((result&1)?0xedb88320:0);}return (result^0xffffffff)>>>0;}
function validateLogo(input){
  if(!input||typeof input.base64!=='string'||input.base64.length>Math.ceil(MAX_LOGO/3)*4)fail(400,'El logotipo debe ser PNG o JPG y ocupar como máximo 1 MB.');
  if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.base64))fail(400,'El archivo no es válido.');
  const bytes=Buffer.from(input.base64,'base64');
  if(!bytes.length||bytes.length>MAX_LOGO)fail(400,'El logotipo debe ocupar como máximo 1 MB.');
  let mimeType,width,height;
  try{
    if(bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))){
      if(bytes.length<45||bytes.readUInt32BE(8)!==13||bytes.toString('ascii',12,16)!=='IHDR')throw Error();
      width=bytes.readUInt32BE(16);height=bytes.readUInt32BE(20);
      if(!width||!height||width>4096||height>4096||width*height>MAX_PIXELS)throw Error();
      // Bound decompression before PDFKit sees the image, including forged PNG headers.
      const pieces=[];let offset=8,ended=false;
      while(offset+12<=bytes.length){const length=bytes.readUInt32BE(offset),kind=bytes.toString('ascii',offset+4,offset+8);if(offset+12+length>bytes.length||kind==='acTL'||(kind==='IHDR'&&offset!==8))throw Error();if(crc(bytes.subarray(offset+4,offset+8+length))!==bytes.readUInt32BE(offset+8+length))throw Error();if(kind==='IDAT')pieces.push(bytes.subarray(offset+8,offset+8+length));offset+=12+length;if(kind==='IEND'){ended=true;break;}}
      if(!ended||offset!==bytes.length||!pieces.length)throw Error();
      const bits=bytes[24],channels={0:1,2:3,3:1,4:2,6:4}[bytes[25]];
      if(!channels||![1,2,4,8,16].includes(bits)||bytes[26]||bytes[27]||bytes[28])throw Error();
      const rowSize=Math.ceil(width*bits*channels/8)+1,raw=zlib.inflateSync(Buffer.concat(pieces),{maxOutputLength:rowSize*height});
      if(raw.length!==rowSize*height)throw Error();for(let row=0;row<height;row++)if(raw[row*rowSize]>4)throw Error();
      mimeType='image/png';
    }else if(bytes[0]===255&&bytes[1]===216&&bytes.at(-2)===255&&bytes.at(-1)===217){mimeType='image/jpeg';}
    else throw Error();
    const doc=new PDFDocument({autoFirstPage:false}),image=doc.openImage(bytes);
    width=image.width;height=image.height;doc.resume();doc.end();
    if(!width||!height||width>4096||height>4096||width*height>MAX_PIXELS)throw Error();
  }catch{fail(400,'No se puede leer el logotipo. Usa un PNG o JPG válido, de hasta 4096 píxeles por lado y 4 megapíxeles.');}
  return {base64:bytes.toString('base64'),mimeType,width,height,sizeBytes:bytes.length,sha256:hash(bytes),name:text(input.name||'logotipo',160)};
}
function defaults(venue){return {revision:0,displayName:venue.name,accent:'#49317f',tagline:'',footer:'',logoBackground:'white',logo:null,...venue.branding};}
function values(venue,data){
  const previous=defaults(venue),accent=String(data.accent??previous.accent);
  if(!/^#[0-9a-fA-F]{6}$/.test(accent))fail(400,'Selecciona un color corporativo válido.');
  const logoBackground=data.logoBackground??previous.logoBackground;
  if(!['white','dark','accent'].includes(logoBackground))fail(400,'Elige un fondo válido para el logotipo.');
  const logo=data.removeLogo===true?null:data.logo?validateLogo(data.logo):previous.logo;
  return {...previous,displayName:text(data.displayName??previous.displayName,100,true),tagline:text(data.tagline??previous.tagline,140),footer:text(data.footer??previous.footer,240),accent:accent.toLowerCase(),logoBackground,logo};
}
function scoped(store,user,venueId,edit=false){
  const venue=store.read().venues.find(v=>v.id===venueId);
  if(!venue||!canVenue(user,venueId))fail(404,'Espacio no encontrado.');
  if(edit&&user.role!=='ADMIN'&&user.role!=='VENUE_USER')fail(403,'La identidad la modifica administración o el propio espacio.');
  return venue;
}
function safe(branding){const b=structuredClone(branding);if(b?.logo)delete b.logo.base64;return b;}
function save(store,user,venueId,data){
  const venue=scoped(store,user,venueId,true),next=values(venue,data);
  if(!Number.isInteger(data.revision))fail(400,'Falta la versión de la identidad. Abre de nuevo el formulario.');
  return store.transaction(user,'VENUE_BRANDING_UPDATED',state=>{
    const current=state.venues.find(v=>v.id===venueId);
    if(!current||!canVenue(user,venueId))fail(404,'Espacio no encontrado.');
    if((current.branding?.revision||0)!==data.revision)fail(409,'Otra persona ha cambiado la identidad del espacio. Cierra y vuelve a abrir el formulario para revisar su versión.');
    current.branding={...next,revision:data.revision+1,updatedAt:now(),updatedBy:user.id};
    return safe(current.branding);
  });
}
function install(Store){
  if(Store.prototype.brandingInstalled)return;Store.prototype.brandingInstalled=true;
  const view=Store.prototype.view;
  Store.prototype.view=function(user){const state=view.call(this,user);state.venues.forEach(v=>{if(v.branding)v.branding=safe(v.branding);});return state;};
  // Portable exports, like database backups, retain the actual logo bytes.
  const archive=Store.prototype.exportArchive;
  if(archive)Store.prototype.exportArchive=function(...args){const result=archive.apply(this,args),state=this.read();result.venues.forEach(v=>{const source=state.venues.find(s=>s.id===v.id);if(source?.branding)v.branding=structuredClone(source.branding);});return result;};
}
module.exports={validateLogo,defaults,values,scoped,save,safe,install,hash};
