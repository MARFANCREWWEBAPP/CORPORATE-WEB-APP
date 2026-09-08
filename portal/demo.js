'use strict';
const crypto=require('node:crypto');
const {id,now,CLOSED}=require('./store');
// Public sample credentials, exclusively for the isolated demo database.
const password='MarqueeDemo2026!';
const accounts=[
  {email:'admin@demo.test',role:'ADMIN',label:'Administrador',description:'Gestiona cuentas, espacios y todos los eventos.'},
  {email:'comercial@demo.test',role:'COMMERCIAL',label:'Comercial',description:'Gestiona peticiones, presupuestos y comunicación.'},
  {email:'espacio@demo.test',role:'VENUE_USER',label:'Espacio de eventos',description:'Solicita presupuestos y consulta sus propios eventos.'}
];
function samplePdf(){
  const stream='BT /F1 18 Tf 50 770 Td (MARQUEE AUDIOVISUALES) Tj 0 -35 Td /F1 12 Tf (Presupuesto de demostracion) Tj 0 -25 Td (Datos ficticios. Sin validez comercial.) Tj 0 -40 Td (Sonido, iluminacion y asistencia tecnica.) Tj ET';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'\nendstream'];
  let pdf='%PDF-1.4\n';const offsets=[0];objects.forEach((body,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=(i+1)+' 0 obj\n'+body+'\nendobj\n';});const offset=Buffer.byteLength(pdf);pdf+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+offset+'\n%%EOF';return Buffer.from(pdf);
}
function seedDemo(store){
  const existing=store.read();
  if(existing.demo?.version===1)return;
  if(existing.users.length||existing.events.length||existing.venues.length||existing.revision||store.db.prepare('SELECT COUNT(*) AS n FROM files').get().n)throw new Error('El modo demo requiere una base independiente y vacía. Los datos existentes se conservan.');
  const at=now(),date=days=>new Date(Date.now()+days*86400000).toISOString().slice(0,10);
  const hashes=accounts.map(()=>{const salt=crypto.randomBytes(16).toString('hex');return salt+':'+crypto.scryptSync(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024}).toString('hex');});
  const bytes=samplePdf();
  store.transaction(null,'DEMO_INITIALIZED',state=>{
    const venues=['Espacio Alameda · demo','Espacio Mirador · demo'].map(name=>({id:id(),...store.venueValues({name,municipality:'Madrid',province:'Madrid',observations:'Espacio ficticio para la demostración.',technicalProfile:{spaces:'Salón principal y terraza',loadingAccess:'Acceso de carga en planta baja',loadingHours:'08:00–12:00',power:'63 A trifásica',soundRestrictions:'Finalización a las 23:00',ceilingHeight:'4,5 m',wifi:'Red para producción',stage:'6 × 4 m'}}),createdAt:at}));
    state.venues.push(...venues);
    const users=accounts.map((a,i)=>({id:id(),email:a.email,role:a.role,firstName:a.label,lastName:'Demo',passwordHash:hashes[i],active:true,mustChangePassword:false,demoAccount:true,venueId:i===2?venues[0].id:null,venueIds:i===2?[venues[0].id]:[],createdAt:at}));
    state.users.push(...users);
    state.demo={version:1,createdAt:at,accountIds:users.map(u=>u.id),venueIds:venues.map(v=>v.id)};
    const examples=[
      ['Encuentro de equipo','NEW_REQUEST',7,0,'Empresa Horizonte',null],
      ['Presentación de producto','BUDGET_SENT',14,0,'Grupo Aurora',185000],
      ['Cena de empresa','CONFIRMED',21,0,'Empresa Horizonte',340000],
      ['Convención anual','COMPLETED',-14,0,'Empresa Horizonte',420000],
      ['Jornada de formación','CANCELLED',-7,0,'Grupo Aurora',95000],
      ['Gala de reconocimiento','CONFIRMED',28,1,'Empresa Mirador',280000]
    ];
    for(const [name,status,days,space,client,amount]of examples){
      const event={id:id(),venueId:venues[space].id,...store.eventValues({eventName:name+' · demo',eventType:'CONVENTION',eventDate:date(days),estimatedStartTime:'18:00',estimatedEndTime:'22:00',numberOfPeople:120,contactFirstName:'Contacto',contactLastName:'Demo',agency:'',finalClient:client,email:'contacto@demo.test',phone:'',audiovisualRequest:'Sonido, iluminación y asistencia técnica.',technicalRequirements:'Comprobación técnica antes de abrir puertas.',observations:'Datos ficticios para probar la aplicación.'}),status,priority:'NORMAL',createdById:space===0?users[2].id:users[0].id,assignedCommercialId:users[1].id,createdAt:at,updatedAt:at,revision:0,deletedAt:null,archivedAt:CLOSED.includes(status)?at:null,budgets:[],documents:[],comments:[],internalNotes:[],history:[],tasks:[],infoRequests:[],readBy:[],operationalTimes:{},waitingOn:status==='BUDGET_SENT'?'VENUE':status==='NEW_REQUEST'?'MARQUEE':'NONE',nextAction:status==='BUDGET_SENT'?'Revisar propuesta':status==='NEW_REQUEST'?'Preparar presupuesto':'Consultar expediente',nextActionDue:date(days),room:'Salón principal',resourceIds:[]};
      store.applyEventExtras(state,users[0],event,{finalClient:client});
      store.history(event,users[0],'Expediente ficticio creado para la demostración','CREATED');
      event.comments.push({id:id(),authorId:users[1].id,body:'Este expediente es una muestra. Puedes probar aquí la comunicación del evento.',createdAt:at});
      if(amount!==null){const budget={id:id(),fileKey:id(),description:'Documento de ejemplo',originalName:'presupuesto-demo.pdf',displayName:'Propuesta de demostración · sin validez comercial',mimeType:'application/pdf',sizeBytes:bytes.length,size:bytes.length,status:'SENT',visibility:'SHARED',version:1,isCurrent:true,uploadedById:users[1].id,uploadedAt:at,createdAt:at,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),amountCents:amount,currency:'EUR',validUntil:date(Math.max(days,14)+7),decisions:[],viewedBy:[],downloadedBy:[]};event.budgets.push(budget);event.budgetSentAt=at;store.db.prepare('INSERT INTO files VALUES (?,?,?)').run(budget.fileKey,event.id,bytes);
        if(['CONFIRMED','COMPLETED'].includes(status)){event.acceptedAt=at;event.acceptedBudgetId=budget.id;event.acceptedAmountCents=amount;budget.decisions.push({id:id(),decision:'ACCEPTED',reason:'Aceptación ficticia de demostración',actorId:users[0].id,actorName:'Administrador Demo',actorEmail:users[0].email,createdAt:at,version:1,fileSha256:budget.sha256});}
      }
      if(status==='CANCELLED'){event.cancelledAt=at;event.closeReason='Cambio de fecha del cliente · ejemplo';}
      if(status==='COMPLETED')event.completedAt=at;
      state.events.push(event);
    }
    state.resources.push({id:id(),name:'Equipo de sonido · demo',kind:'EQUIPMENT',active:true,createdAt:at});
  });
}
module.exports={seedDemo,accounts,password};
