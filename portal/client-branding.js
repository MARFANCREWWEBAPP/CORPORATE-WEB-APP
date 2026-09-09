  // Identity belongs to the venue and is edited with the same scoped session as its events.
  let brandingPreviewUrl=null;
  const brandingCanEdit=()=>isAdmin()||currentUser()?.role==='VENUE_USER';
  const brandingLogo=venue=>venue.branding?.logo?`<img class="venue-brand-logo" style="background:${venue.branding.logoBackground==='dark'?'#202938':venue.branding.logoBackground==='accent'?escapeHtml(venue.branding.accent):'#fff'}" src="/api/venues/${encodeURIComponent(venue.id)}/logo?v=${venue.branding.logo.sha256}" alt="Logotipo de ${escapeHtml(venue.name)}">`:'<span class="venue-brand-placeholder" aria-hidden="true">'+escapeHtml(venue.name.slice(0,2).toLocaleUpperCase('es'))+'</span>';
  const brandingButton=venue=>`<button type="button" class="btn btn-secondary" data-branding-id="${venue.id}">${brandingCanEdit()?'Identidad y PDF':'Ver diseño PDF'}</button>`;
  const brandingVenues=renderVenues;
  renderVenues=function(){let html=brandingVenues();for(const venue of app.data.venues){const button=auditButton('Ficha técnica','technical',`data-id="${venue.id}"`);html=html.replace(button,button+brandingButton(venue));html=html.replace(`<strong>${escapeHtml(venue.name)}</strong>`,`${brandingLogo(venue)}<strong>${escapeHtml(venue.name)}</strong>`);}return html;};
  function brandingRevoke(){if(brandingPreviewUrl)URL.revokeObjectURL(brandingPreviewUrl);brandingPreviewUrl=null;}
  function brandingFields(m){const b=m.draft,venue=venueById(m.venueId);return `<div class="full branding-intro"><div><span class="eyebrow">IDENTIDAD DEL ESPACIO</span><h3>${escapeHtml(venue.name)}</h3><p>Tu logotipo y color en los nuevos presupuestos y órdenes de producción.</p></div>${brandingLogo(venue)}</div>${auditField('displayName','Nombre en los documentos',b.displayName,'text','required maxlength="100"')}${auditField('accent','Color corporativo',b.accent,'color','required')}${auditSelect('logoBackground','Fondo del logotipo',[['white','Blanco'],['dark','Oscuro'],['accent','Color corporativo']],b.logoBackground||'white')}${auditField('tagline','Descripción breve (opcional)',b.tagline,'text','maxlength="140"')}<div class="full"><label class="label" for="branding-logo">Logotipo del espacio</label><input id="branding-logo" name="logoFile" type="file" accept="image/png,image/jpeg"><p class="small muted" id="branding-file-status">${escapeHtml(b.logo?.name||(!b.removeLogo&&venue.branding?.logo?.name)||'Sin logotipo personalizado')} · PNG o JPG, hasta 1 MB y 4 megapíxeles.</p>${venue.branding?.logo||b.logo?'<button type="button" class="btn btn-secondary" data-branding-remove>Quitar logotipo</button>':''}</div>${auditArea('footer','Pie de página (contacto, web o dirección)',b.footer,'maxlength="240"')}<p class="full small muted">Guardar actualiza los documentos nuevos. Los presupuestos emitidos y la identidad de las órdenes ya publicadas se conservan.</p><div class="full" id="branding-preview"></div>`;}
  const brandingRender=renderShell;
  renderShell=function(){brandingRender();
    document.querySelectorAll('img[src="/brand/b2be-logo.png"]').forEach(img=>{img.classList.add('b2be-logo');img.alt='B2BE by Marquee';});
    if(!currentUser()){brandingRevoke();return;}
    if(app.page==='my-venue')document.querySelector('main')?.insertAdjacentHTML('beforeend',`<section class="card card-pad"><h3>Identidad y documentos de mis espacios</h3><p>Cada espacio puede mostrar su logotipo y su color corporativo.</p>${app.data.venues.map(v=>`<div class="portal-rank"><div class="venue-brand-summary">${brandingLogo(v)}<strong>${escapeHtml(v.name)}</strong></div>${brandingButton(v)}</div>`).join('')}</section>`);
    const m=app.modal;if(m?.type!=='branding'){brandingRevoke();return;}
    document.getElementById('modal-root').innerHTML=modalFrame('Identidad y PDF','',`<form id="branding-form" class="form-grid">${brandingFields(m)}</form>`,`<button class="btn btn-secondary" data-action="close-modal">Volver</button><button type="button" class="btn btn-secondary" data-branding-preview>Vista previa PDF</button><button class="btn btn-primary" data-action="submit-external-form" data-form="branding-form">Guardar identidad</button>`);
    document.getElementById('branding-form').closest('[role="dialog"]')?.classList.add('branding-dialog');
  };
  function brandingRead(form){const d=formObject(form);return {...app.modal.draft,displayName:d.displayName,accent:d.accent,logoBackground:d.logoBackground,tagline:d.tagline,footer:d.footer};}
  window.addEventListener('input',event=>{if(event.target.closest?.('#branding-form')&&app.modal?.type==='branding'){app.modal.draft=brandingRead(event.target.closest('form'));portalDirty=true;document.getElementById('branding-preview')?.replaceChildren();brandingRevoke();}},true);
  window.addEventListener('change',event=>{if(event.target.id!=='branding-logo')return;const file=event.target.files[0],m=app.modal;if(!file||m?.type!=='branding')return;
    if(file.size>1024*1024||!['image/png','image/jpeg'].includes(file.type)){event.target.value='';toast('Revisa el logotipo','Usa un PNG o JPG de hasta 1 MB.','error');return;}
    m.logoLoading=true;const reader=new FileReader();reader.onload=()=>{if(app.modal!==m)return;m.logoLoading=false;m.draft={...brandingRead(event.target.form),logo:{name:file.name,base64:String(reader.result).split(',')[1]},removeLogo:false};document.getElementById('branding-file-status').textContent=file.name+' · Pendiente de guardar';portalDirty=true;};reader.onerror=()=>{m.logoLoading=false;toast('No se pudo leer','Vuelve a seleccionar el archivo.','error');};reader.readAsDataURL(file);
  },true);
  window.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-branding-id],[data-branding-preview],[data-branding-remove]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();if(portalBusy)return;
    if(button.dataset.brandingId){const venue=venueById(button.dataset.brandingId);if(!venue)return;
      if(!brandingCanEdit()){window.open('/viewer?venue='+encodeURIComponent(venue.id),'_blank','noopener');return;}
      const b=venue.branding||{};app.modal={type:'branding',venueId:venue.id,draft:{revision:b.revision||0,displayName:b.displayName||venue.name,accent:b.accent||'#49317f',logoBackground:b.logoBackground||'white',tagline:b.tagline||'',footer:b.footer||''}};renderShell();return;
    }
    const m=app.modal,form=document.getElementById('branding-form');if(m?.type!=='branding'||!form)return;
    if(button.hasAttribute('data-branding-remove')){m.draft={...brandingRead(form),logo:null,removeLogo:true};brandingRevoke();renderShell();portalDirty=true;return;}
    if(m.logoLoading){toast('Cargando logotipo','Espera a que termine la lectura del archivo.');return;}if(!form.reportValidity())return;m.draft=brandingRead(form);
    portalRun(async()=>{
      const response=await fetch('/api/venues/'+encodeURIComponent(m.venueId)+'/branding-preview.pdf',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':portalCsrf},body:JSON.stringify(m.draft)});
      if(!response.ok){const error=await response.json();throw new Error(error.error||'No se pudo preparar el PDF.');}
      const blob=await response.blob();if(app.modal!==m)return;brandingRevoke();brandingPreviewUrl=URL.createObjectURL(blob);
      document.getElementById('branding-preview').innerHTML=`<p class="small">Vista previa del borrador · todavía sin guardar</p><iframe class="branding-pdf-frame" title="Vista previa del PDF del espacio" src="/viewer?preview=${encodeURIComponent(brandingPreviewUrl)}"></iframe>`;
    }).then(()=>{if(app.modal===m)portalDirty=true;});
  },true);
  window.addEventListener('submit',event=>{const form=event.target;if(form.id!=='branding-form')return;event.preventDefault();event.stopImmediatePropagation();const m=app.modal;if(m.logoLoading){toast('Cargando logotipo','Espera a que termine la lectura del archivo.');return;}m.draft=brandingRead(form);
    portalRun(async()=>{await portalMutation('/venues/'+m.venueId+'/branding','PATCH',m.draft);brandingRevoke();app.modal=null;renderShell();},'Identidad del espacio guardada');
  },true);
