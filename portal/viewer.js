import {getDocument,GlobalWorkerOptions} from '/pdfjs/build/pdf.mjs';
GlobalWorkerOptions.workerSrc='/pdfjs/build/pdf.worker.mjs';
const status=document.getElementById('status'),canvas=document.getElementById('document');
let pdf,pageNumber=1,zoom=1,rendering=false,pending=false;
async function render(){if(!pdf)return;if(rendering){pending=true;return;}rendering=true;try{const page=await pdf.getPage(pageNumber),initial=page.getViewport({scale:1}),scale=Math.max(.3,(innerWidth-40)/initial.width)*zoom,viewport=page.getViewport({scale}),ratio=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(viewport.width*ratio);canvas.height=Math.round(viewport.height*ratio);canvas.style.width=Math.round(viewport.width)+'px';canvas.style.height=Math.round(viewport.height)+'px';await page.render({canvasContext:canvas.getContext('2d'),viewport,transform:ratio===1?undefined:[ratio,0,0,ratio,0,0]}).promise;canvas.setAttribute('aria-label','Página '+pageNumber+' de '+pdf.numPages);document.getElementById('pages').textContent=pageNumber+' / '+pdf.numPages;document.getElementById('previous').disabled=pageNumber===1;document.getElementById('next').disabled=pageNumber===pdf.numPages;status.hidden=true;}catch{status.hidden=false;status.textContent='No se pudo mostrar esta página. Puedes descargar el archivo original.';}finally{rendering=false;if(pending){pending=false;void render();}}}
document.getElementById('previous').onclick=()=>{pageNumber=Math.max(1,pageNumber-1);void render();};
document.getElementById('next').onclick=()=>{pageNumber=Math.min(pdf?.numPages||1,pageNumber+1);void render();};
document.getElementById('zoom-in').onclick=()=>{zoom=Math.min(3,zoom+.25);void render();};
document.getElementById('zoom-out').onclick=()=>{zoom=Math.max(.5,zoom-.25);void render();};
let resizing;addEventListener('resize',()=>{clearTimeout(resizing);resizing=setTimeout(()=>void render(),150);});
try{
  const params=new URLSearchParams(location.search),file=params.get('file'),venue=params.get('venue'),preview=params.get('preview');let source;
  if(file&&/^[a-zA-Z0-9-]+$/.test(file))source='/api/files/'+file;
  else if(venue&&/^[a-zA-Z0-9-]+$/.test(venue))source='/api/venues/'+venue+'/branding-preview.pdf';
  else if(preview&&preview.startsWith('blob:'+location.origin+'/'))source=preview;
  else throw new Error('Archivo no válido.');
  const response=await fetch(source,{credentials:'same-origin'});if(!response.ok)throw new Error('El archivo no está disponible o tu sesión ha caducado.');
  const download=document.getElementById('download');download.href=file?source+'?download=1':source;download.download=preview||venue?'identidad-espacio.pdf':'';download.hidden=false;
  pdf=await getDocument({data:new Uint8Array(await response.arrayBuffer()),isEvalSupported:false,useWasm:false,cMapUrl:'/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/pdfjs/standard_fonts/'}).promise;await render();
}catch(error){status.textContent=error.message||'No se pudo abrir el documento.';canvas.hidden=true;}
