  // Temporary reservations use server deadlines and remain in the event history.
  let reservationQuery='',reservationHistory=false;
  const reservationLabels={ACTIVE:'Reserva activa',EXPIRED:'Caducada',RELEASED:'Liberada',CONFIRMED:'Evento confirmado'};
  const reservationStatus=hold=>hold.status==='ACTIVE'&&Date.parse(hold.expiresAt)<=Date.now()?'EXPIRED':hold.status;
  const reservationActive=event=>(event.reservations||[]).find(hold=>reservationStatus(hold)==='ACTIVE');
  const reservationEligible=()=>visibleEvents().filter(event=>!portalClosed.includes(event.status)&&event.status!=='CONFIRMED'&&!reservationActive(event));
  const reservationButton=(label,action,id='',holdId='')=>`<button type="button" class="btn btn-secondary" data-reservation-action="${action}" data-event="${id}" data-hold="${holdId}">${label}</button>`;
  const reservationDate=value=>new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
  const reservationSummary=(event,plan=event)=>`<p class="small">${escapeHtml(venueById(plan.venueId)?.name||'Espacio de eventos')} · ${formatDate(plan.eventDate)} · ${escapeHtml(plan.estimatedStartTime||'Inicio pendiente')}–${escapeHtml(plan.estimatedEndTime||'Fin pendiente')} · ${escapeHtml(plan.room||'Todas las salas del espacio')}</p><p class="small muted">Incluye ${Number(plan.setupMinutes)||0} min de montaje y ${Number(plan.dismantleMinutes)||0} min de desmontaje.${isOps()&&(plan.resourceIds||[]).length?' Recursos: '+plan.resourceIds.map(id=>escapeHtml(app.data.resources?.find(resource=>resource.id===id)?.name||'Recurso')).join(', ')+'.':''}</p>`;
  const reservationSafePage=safePage;
  safePage=(page,user)=>page==='reservations'?page:reservationSafePage(page,user);
  const reservationNav=v4NavGroups;
  v4NavGroups=user=>{const groups=reservationNav(user),group=groups.find(item=>item.label==='Planificación');if(group)group.items.unshift(['reservations','Reservas temporales','calendar']);else groups.push({label:'Planificación',items:[['reservations','Reservas temporales','calendar']]});return groups;};
  function reservationPage(){
    const all=visibleEvents().flatMap(event=>(event.reservations||[]).map(hold=>({event,hold,status:reservationStatus(hold)})));
    const active=all.filter(item=>item.status==='ACTIVE'),soon=active.filter(item=>Date.parse(item.hold.expiresAt)<=Date.now()+86400000);
    const query=reservationQuery.toLocaleLowerCase('es');
    const rows=all.filter(({event,status})=>(reservationHistory||status==='ACTIVE')&&[event.eventName,event.finalClient,venueById(event.venueId)?.name].some(value=>String(value||'').toLocaleLowerCase('es').includes(query))).sort((a,b)=>a.hold.expiresAt.localeCompare(b.hold.expiresAt));
    return `${v4PageHead('Reservas temporales','Aparta una fecha mientras se decide el presupuesto.',isOps()?reservationButton('Nueva reserva temporal','create'):'')}<div class="reservation-stats"><section class="card card-pad"><strong>${active.length}</strong><span>Reservas activas</span></section><section class="card card-pad"><strong>${soon.length}</strong><span>Caducan en 24 horas</span></section><section class="card card-pad"><strong>${all.filter(item=>item.status==='EXPIRED').length}</strong><span>Caducadas en el histórico</span></section></div><section class="card card-pad"><div class="reservation-filters"><div><label class="label" for="reservation-search">Buscar evento, cliente o espacio</label><input class="field" id="reservation-search" type="search" value="${escapeHtml(reservationQuery)}" placeholder="Nombre del evento"></div><label class="check-row"><input id="reservation-history" type="checkbox" ${reservationHistory?'checked':''}>Incluir histórico</label></div><p class="small muted">Las reservas bloquean la sala y los recursos asignados hasta su caducidad. Si no se indica sala, se reserva todo el espacio. Los plazos se muestran en hora de Madrid.${isOps()?'':' Marquee gestiona las reservas de tus eventos.'}</p></section><div class="reservation-list">${rows.map(({event,hold,status})=>`<article class="card card-pad"><div class="reservation-title"><h3>${escapeHtml(event.eventName)}</h3><span class="reservation-status ${status==='ACTIVE'?'is-active':''}">${reservationLabels[status]||status}</span></div>${reservationSummary(event,hold.schedule)}<p><strong>${status==='ACTIVE'?'Reservado hasta':'Caducidad prevista'}: ${reservationDate(hold.expiresAt)}</strong></p><p class="production-text">${escapeHtml(hold.reason)}</p>${hold.closeReason?`<p class="small">${escapeHtml(hold.closeReason)}${hold.closedAt?' · '+reservationDate(hold.closedAt):''}</p>`:''}<div class="portal-actions">${reservationButton('Ver expediente','event',event.id)}${status==='ACTIVE'&&isOps()?reservationButton('Ampliar plazo','extend',event.id,hold.id)+reservationButton('Liberar reserva','release',event.id,hold.id):''}</div><details><summary>Histórico de la reserva</summary><p class="small">Creada el ${reservationDate(hold.createdAt)}</p>${(hold.extensions||[]).map(extension=>`<p class="small">${reservationDate(extension.at)} · Ampliada hasta ${reservationDate(extension.expiresAt)} · ${escapeHtml(extension.reason)}</p>`).join('')}${status==='EXPIRED'?'<p class="small">El plazo terminó y ya no bloquea la disponibilidad. El expediente y sus documentos se conservan.</p>':''}</details></article>`).join('')||'<section class="card card-pad"><h3>No hay reservas en esta vista</h3><p>Una petición no bloquea la fecha hasta que Marquee registra su reserva temporal o confirma el evento.</p></section>'}</div>`;
  }
  const reservationRenderPage=renderPage;
  renderPage=function(){return app.page==='reservations'?reservationPage():reservationRenderPage();};
  function reservationFields(m){
    const event=eventById(m.eventId),hold=event?.reservations?.find(item=>item.id===m.holdId);
    const options=reservationEligible().map(item=>[item.id,item.eventName+' · '+formatDate(item.eventDate)+' · '+(venueById(item.venueId)?.name||'')]);
    return `${m.action==='create'?auditSelect('eventId','Evento pendiente de confirmar',options,m.eventId,'required'):`<div class="full"><h3>${escapeHtml(event.eventName)}</h3></div>`}<div class="full">${event?reservationSummary(event):''}${hold?`<p>Reserva vigente hasta <strong>${reservationDate(hold.expiresAt)}</strong></p>`:''}</div>${m.action!=='release'?auditField('durationHours',m.action==='extend'?'Horas adicionales':'Plazo de reserva (horas)',m.draft.durationHours,'number','required min="1" max="720" step="1"'):''}${auditArea('reason',m.action==='release'?'Motivo de liberación':m.action==='extend'?'Motivo de ampliación':'Motivo de la reserva',m.draft.reason,'required maxlength="2000"')}<div class="full portal-notice">${m.action==='release'?'Se liberará la disponibilidad. El evento, la reserva y todos sus datos seguirán guardados.':m.action==='extend'?'El plazo se añade a la caducidad actual. Máximo: 30 días desde hoy.':'Se comprobarán sala, horario, montaje, desmontaje y recursos antes de guardar. La reserva no acepta el presupuesto ni confirma el evento.'}</div>${m.conflicts?`<div class="full portal-notice" role="status">${m.conflicts.length?m.conflicts.map(item=>`${escapeHtml(item.eventName||item.message)}${item.date?' · '+formatDate(item.date):''}${item.kind==='TEMPORARY_HOLD'?' · Reserva hasta '+reservationDate(item.expiresAt):item.kind==='CONFIRMED'?' · Confirmado':''}`).join('<br>'):'Sin coincidencias ahora. Se volverá a comprobar al guardar.'}</div>`:''}`;
  }
  const reservationRenderShell=renderShell;
  renderShell=function(){reservationRenderShell();if(!currentUser())return;
    const event=eventById(app.selectedEventId);
    if(event){const drawer=document.querySelector('.drawer-body');if(drawer){const hold=reservationActive(event),count=(event.reservations||[]).length;if(hold||count||isOps()&&!portalClosed.includes(event.status)&&event.status!=='CONFIRMED')drawer.insertAdjacentHTML('afterbegin',`<div class="portal-notice">${hold?'Reserva activa hasta '+reservationDate(hold.expiresAt):'Sin reserva temporal activa'}<div class="portal-actions">${count?reservationButton('Ver reservas e histórico','show',event.id):''}${!hold&&isOps()&&!portalClosed.includes(event.status)&&event.status!=='CONFIRMED'?reservationButton('Reservar temporalmente','create',event.id):''}</div></div>`);}}
    const m=app.modal;if(m?.type!=='reservation')return;
    const title={create:'Nueva reserva temporal',extend:'Ampliar reserva',release:'Liberar reserva'}[m.action];
    document.getElementById('modal-root').innerHTML=modalFrame(title,'',`<form id="reservation-form" class="form-grid">${reservationFields(m)}</form>`,`<button class="btn btn-secondary" data-action="close-modal">Volver</button>${m.action!=='release'?reservationButton('Comprobar disponibilidad','availability',m.eventId):''}<button class="btn btn-primary" data-action="submit-external-form" data-form="reservation-form">${m.action==='release'?'Liberar y conservar histórico':m.action==='extend'?'Guardar ampliación':'Crear reserva temporal'}</button>`);
  };
  window.addEventListener('input',event=>{
    if(event.target.id==='reservation-search'){reservationQuery=event.target.value;const start=event.target.selectionStart;renderShell();const input=document.getElementById('reservation-search');input.focus();input.setSelectionRange(start,start);return;}
    if(event.target.closest?.('#reservation-form')&&app.modal?.type==='reservation'){Object.assign(app.modal.draft,formObject(event.target.form));portalDirty=true;}
  },true);
  window.addEventListener('change',event=>{
    if(event.target.id==='reservation-history'){reservationHistory=event.target.checked;renderShell();}
    if(event.target.closest?.('#reservation-form')&&event.target.name==='eventId'){const m=app.modal;m.eventId=event.target.value;m.revision=eventById(m.eventId)?.revision;m.conflicts=null;renderShell();}
  },true);
  window.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-reservation-action]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();if(portalBusy)return;
    const action=button.dataset.reservationAction,id=button.dataset.event,selected=eventById(id);
    if(action==='event'){app.selectedEventId=id;app.selectedEventTab='summary';renderShell();return;}
    if(action==='show'){reservationQuery=selected?.eventName||'';reservationHistory=true;app.selectedEventId=null;navigate('reservations');return;}
    if(action==='availability'){const m=app.modal;if(m?.type!=='reservation'||!m.eventId)return;portalRun(async()=>{const result=await portalApi('/events/'+m.eventId+'/availability');m.conflicts=result.conflicts;renderShell();});return;}
    if(!isOps())return;
    const target=selected||reservationEligible()[0];if(!target){toast('No hay eventos disponibles','Crea una petición pendiente de confirmar con su fecha y horario.');return;}
    app.modal={type:'reservation',action,eventId:target.id,holdId:button.dataset.hold,revision:target.revision,draft:{durationHours:48,reason:''}};renderShell();
  },true);
  window.addEventListener('submit',event=>{
    const form=event.target;if(form.id!=='reservation-form')return;event.preventDefault();event.stopImmediatePropagation();const m=app.modal;if(m?.type!=='reservation')return;
    Object.assign(m.draft,formObject(form));
    portalRun(async()=>{
      try{await portalMutation('/events/'+m.eventId+'/reservations'+(m.holdId?'/'+m.holdId:''),'POST',{revision:m.revision,reason:m.draft.reason,durationHours:m.draft.durationHours,...m.action==='create'?{}:{action:m.action==='extend'?'EXTEND':'RELEASE'}});app.modal=null;renderShell();}
      catch(error){if(error.details?.conflicts){m.conflicts=error.details.conflicts;renderShell();}throw error;}
    },m.action==='release'?'Reserva liberada; histórico conservado':'Reserva guardada');
  },true);
  setInterval(()=>{if(currentUser()&&app.page==='reservations'&&!document.hidden&&!portalBusy&&!app.modal&&!app.selectedEventId&&document.activeElement?.id!=='reservation-search')renderShell();},30000);
