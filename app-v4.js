'use strict';

(() => {
  const STORAGE_KEY = 'marquee-flow-v4-staging-state';
  const SESSION_KEY = 'marquee-flow-v4-staging-session';
  const DEMO_PASSWORD = 'MarqueeDemo2026!';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const uid = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const nowIso = () => new Date().toISOString();
  const esc = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const normalize = (value = '') => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  const USERS = [
    { id: 'u_admin', name: 'Germán Marquee', email: 'admin@marquee.demo', role: 'ADMIN', initials: 'GM' },
    { id: 'u_commercial', name: 'Laura Comercial', email: 'comercial@marquee.demo', role: 'COMMERCIAL', initials: 'LC' },
    { id: 'u_venue_1', name: 'María · Hacienda del Sol', email: 'hacienda-sol@marquee.demo', role: 'VENUE_USER', venueId: 'v1', initials: 'HS' }
  ];

  const STATUS = {
    NEW: ['Nueva petición', 'new'],
    REVIEW: ['Pendiente de revisión', 'review'],
    INFO: ['Información pendiente', 'info'],
    PREPARING: ['Preparando presupuesto', 'budget'],
    SENT: ['Presupuesto enviado', 'sent'],
    RESPONSE: ['Pendiente de respuesta', 'review'],
    NEGOTIATION: ['En negociación', 'budget'],
    CONFIRMED: ['Confirmado', 'confirmed'],
    REJECTED: ['No aceptado', 'cancelled'],
    CANCELLED: ['Cancelado', 'cancelled'],
    DONE: ['Realizado', 'confirmed']
  };
  const PRIORITY = { LOW: ['Baja', 'normal'], NORMAL: ['Normal', 'normal'], HIGH: ['Alta', 'high'], URGENT: ['Urgente', 'urgent'], VERY_URGENT: ['Muy urgente', 'urgent'] };
  const WAITING = { MARQUEE: 'Marquee', VENUE: 'la finca', CLIENT: 'el cliente', AGENCY: 'la agencia', NONE: 'nadie' };

  const seed = () => ({
    version: 4,
    venues: [
      { id: 'v1', name: 'Hacienda del Sol', municipality: 'Marbella', province: 'Málaga', contact: 'María López', phone: '600 123 401', email: 'eventos@haciendadelsol.demo', active: true, notes: 'Acceso técnico por puerta norte. Potencia trifásica disponible.', power: '63 A trifásica', loading: 'Acceso de 08:00 a 16:00', sound: 'Limitador 95 dB' },
      { id: 'v2', name: 'Palacio del Mar', municipality: 'Málaga', province: 'Málaga', contact: 'Álvaro Ruiz', phone: '600 123 402', email: 'corporativos@palaciodelmar.demo', active: true, notes: 'Montaje por muelle de carga. Ascensor técnico 2,20 × 1,60 m.', power: '125 A trifásica', loading: 'Muelle lateral', sound: 'Sin limitador interior' },
      { id: 'v3', name: 'Cortijo de la Luna', municipality: 'Mijas', province: 'Málaga', contact: 'Elena Martín', phone: '600 123 403', email: 'eventos@cortijoluna.demo', active: true, notes: 'Exterior con plan B en salón principal.', power: '32 A trifásica', loading: 'Acceso directo', sound: 'Exterior hasta 00:00' }
    ],
    events: [
      { id: 'e1', venueId: 'v1', name: 'Cena de gala Fundación Horizonte', date: '2026-09-18', start: '19:00', end: '02:00', client: 'Fundación Horizonte', agency: 'Nexo Events', contact: 'Ana Beltrán', email: 'ana@horizonte.demo', phone: '600 410 111', people: 280, audiovisual: 'Pantalla LED 6 × 3, sonido para gala, iluminación ambiente, 4 micrófonos inalámbricos y técnico durante todo el evento.', technical: 'Escenario 8 × 4 m. Vídeo de apertura y entrega de premios.', observations: 'Pendiente confirmar tiempos del guion.', status: 'SENT', priority: 'HIGH', waiting: 'CLIENT', commercialId: 'u_commercial', nextAction: 'Llamar a la agencia para confirmar aceptación', dueDate: '2026-09-10', completion: 88, updatedAt: '2026-09-08T09:35:00Z', createdAt: '2026-09-02T10:15:00Z', unread: 2,
        messages: [{ id: 'm1', userId: 'u_venue_1', text: 'El cliente solicita que la pantalla sea visible también desde la zona lateral.', at: '2026-09-07T11:20:00Z' }, { id: 'm2', userId: 'u_commercial', text: 'Incluido en la versión V2. Hemos planteado dos repetidores laterales.', at: '2026-09-07T12:05:00Z' }],
        tasks: [{ id: 't1', text: 'Confirmar guion definitivo', owner: 'CLIENT', due: '2026-09-10', done: false }, { id: 't2', text: 'Revisar rider de vídeo', owner: 'MARQUEE', due: '2026-09-11', done: true }],
        history: [{ at: '2026-09-08T09:35:00Z', text: 'Presupuesto V2 publicado para la finca' }, { at: '2026-09-07T12:05:00Z', text: 'Nuevo mensaje de Laura Comercial' }, { at: '2026-09-03T10:40:00Z', text: 'Prioridad cambiada de Normal a Alta' }, { at: '2026-09-02T10:15:00Z', text: 'Petición creada por Hacienda del Sol' }] },
      { id: 'e2', venueId: 'v2', name: 'Presentación nueva gama Aurora', date: '2026-09-23', start: '09:30', end: '15:00', client: 'Aurora Mobility', agency: 'Métrica Comunicación', contact: 'Javier Soler', email: 'javier@aurora.demo', phone: '600 410 222', people: 165, audiovisual: 'Escenario, pantalla LED, realización multicámara, sonido, iluminación y streaming privado.', technical: 'Entrada de vehículo al escenario. Señal 4K y grabación máster.', observations: '', status: 'PREPARING', priority: 'URGENT', waiting: 'MARQUEE', commercialId: 'u_commercial', nextAction: 'Cerrar valoración de realización y streaming', dueDate: '2026-09-09', completion: 72, updatedAt: '2026-09-08T08:10:00Z', createdAt: '2026-09-04T09:00:00Z', unread: 0, messages: [], tasks: [{ id: 't3', text: 'Validar ancho del acceso de vehículo', owner: 'VENUE', due: '2026-09-09', done: false }], history: [{ at: '2026-09-08T08:10:00Z', text: 'Estado cambiado a Preparando presupuesto' }, { at: '2026-09-04T09:00:00Z', text: 'Petición creada por Palacio del Mar' }] },
      { id: 'e3', venueId: 'v1', name: 'Convención anual Grupo Norte', date: '2026-10-02', start: '08:00', end: '19:00', client: 'Grupo Norte', agency: 'Directo con cliente', contact: 'Sara Molina', email: 'sara@gruponorte.demo', phone: '600 410 333', people: 420, audiovisual: 'Sonido, iluminación de escenario, dos pantallas LED, microfonía, monitores de retorno y asistencia técnica.', technical: 'Presentaciones en 16:9 y sistema de votación.', observations: 'Falta agenda de ponentes.', status: 'INFO', priority: 'NORMAL', waiting: 'CLIENT', commercialId: 'u_admin', nextAction: 'Solicitar agenda y presentaciones', dueDate: '2026-09-12', completion: 54, updatedAt: '2026-09-07T16:45:00Z', createdAt: '2026-09-01T12:00:00Z', unread: 1, messages: [], tasks: [{ id: 't4', text: 'Subir agenda de ponentes', owner: 'CLIENT', due: '2026-09-12', done: false }], history: [{ at: '2026-09-07T16:45:00Z', text: 'Información pendiente marcada' }] },
      { id: 'e4', venueId: 'v3', name: 'Fiesta corporativa Atlas', date: '2026-10-10', start: '20:30', end: '03:00', client: 'Atlas Tech', agency: 'Tempo Producciones', contact: 'Mario Díaz', email: 'mario@atlas.demo', phone: '600 410 444', people: 350, audiovisual: 'DJ, sonido, iluminación dinámica, cabina, efectos y pantalla para contenido corporativo.', technical: 'Montaje exterior con plan de lluvia.', observations: '', status: 'CONFIRMED', priority: 'NORMAL', waiting: 'NONE', commercialId: 'u_commercial', nextAction: 'Preparar reunión técnica de producción', dueDate: '2026-09-28', completion: 96, updatedAt: '2026-09-06T11:30:00Z', createdAt: '2026-08-20T09:00:00Z', unread: 0, messages: [], tasks: [{ id: 't5', text: 'Reunión técnica final', owner: 'MARQUEE', due: '2026-09-28', done: false }], history: [{ at: '2026-09-06T11:30:00Z', text: 'Evento confirmado' }] },
      { id: 'e5', venueId: 'v2', name: 'Desayuno empresarial Costa Business', date: '2026-09-14', start: '08:30', end: '12:30', client: 'Costa Business', agency: 'Directo con cliente', contact: 'Lucía Ramos', email: 'lucia@costabusiness.demo', phone: '600 410 555', people: 95, audiovisual: 'Pantalla, sonido, microfonía y atril.', technical: '', observations: '', status: 'REVIEW', priority: 'LOW', waiting: 'MARQUEE', commercialId: '', nextAction: 'Revisar petición y asignar comercial', dueDate: '2026-09-09', completion: 61, updatedAt: '2026-09-08T10:02:00Z', createdAt: '2026-09-08T10:02:00Z', unread: 0, messages: [], tasks: [], history: [{ at: '2026-09-08T10:02:00Z', text: 'Nueva petición recibida' }] },
      { id: 'e6', venueId: 'v1', name: 'Jornada de formación Biomed', date: '2026-10-21', start: '09:00', end: '18:00', client: 'Biomed Iberia', agency: 'Métrica Comunicación', contact: 'Clara Puig', email: 'clara@biomed.demo', phone: '600 410 666', people: 140, audiovisual: 'Proyección, sonido, microfonía y grabación de ponencias.', technical: 'Sala divisible en dos durante la tarde.', observations: '', status: 'NEW', priority: 'NORMAL', waiting: 'MARQUEE', commercialId: 'u_admin', nextAction: 'Realizar primera revisión', dueDate: '2026-09-11', completion: 68, updatedAt: '2026-09-08T07:50:00Z', createdAt: '2026-09-08T07:50:00Z', unread: 0, messages: [], tasks: [], history: [{ at: '2026-09-08T07:50:00Z', text: 'Petición creada por Hacienda del Sol' }] }
    ],
    budgets: [
      { id: 'b1', eventId: 'e1', fileName: 'Presupuesto_Gala_Horizonte_V1.pdf', version: 1, status: 'Sustituido', amount: 11840, uploadedBy: 'u_commercial', uploadedAt: '2026-09-04T13:00:00Z' },
      { id: 'b2', eventId: 'e1', fileName: 'Presupuesto_Gala_Horizonte_V2_FINAL.pdf', version: 2, status: 'Vigente', amount: 12650, uploadedBy: 'u_commercial', uploadedAt: '2026-09-08T09:35:00Z' },
      { id: 'b3', eventId: 'e4', fileName: 'Presupuesto_Fiesta_Atlas_FINAL.pdf', version: 1, status: 'Vigente', amount: 8750, uploadedBy: 'u_admin', uploadedAt: '2026-09-05T10:00:00Z' }
    ],
    documents: [
      { id: 'd1', eventId: 'e1', fileName: 'Plano_salon_gala.png', category: 'Plano', uploadedBy: 'u_venue_1', uploadedAt: '2026-09-03T09:20:00Z' },
      { id: 'd2', eventId: 'e2', fileName: 'Rider_streaming.pdf', category: 'Rider', uploadedBy: 'u_commercial', uploadedAt: '2026-09-06T14:00:00Z' }
    ],
    snapshots: [],
    activity: [
      { id: 'a1', at: '2026-09-08T10:02:00Z', text: 'Nueva petición recibida', detail: 'Desayuno empresarial Costa Business' },
      { id: 'a2', at: '2026-09-08T09:35:00Z', text: 'Presupuesto V2 publicado', detail: 'Cena de gala Fundación Horizonte' },
      { id: 'a3', at: '2026-09-08T08:10:00Z', text: 'Evento en preparación', detail: 'Presentación nueva gama Aurora' }
    ]
  });

  let state = loadState();
  let currentUser = null;
  let activeRoute = 'dashboard';
  let activeEventId = null;
  let activeEventTab = 'summary';
  let pendingBudgetEventId = null;
  let newEventStep = 1;

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (parsed && parsed.version === 4 && Array.isArray(parsed.events)) return parsed;
    } catch {}
    const initial = seed();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }

  function saveState(message = 'Cambios guardados') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const sync = $('#syncText');
    if (sync) sync.textContent = 'Actualizado ahora';
    if (message) toast(message);
  }

  function venue(id) { return state.venues.find((item) => item.id === id); }
  function user(id) { return USERS.find((item) => item.id === id); }
  function eventById(id) { return state.events.find((item) => item.id === id); }
  function visibleEvents() {
    return currentUser?.role === 'VENUE_USER' ? state.events.filter((item) => item.venueId === currentUser.venueId) : state.events;
  }
  function canSeeEvent(item) { return Boolean(item && (currentUser?.role !== 'VENUE_USER' || item.venueId === currentUser.venueId)); }
  function canManage() { return currentUser && currentUser.role !== 'VENUE_USER'; }
  function budgetsFor(eventId) { return state.budgets.filter((item) => item.eventId === eventId).sort((a, b) => b.version - a.version); }
  function docsFor(eventId) { return state.documents.filter((item) => item.eventId === eventId); }
  function currentBudget(eventId) { return budgetsFor(eventId).find((item) => item.status === 'Vigente') || budgetsFor(eventId)[0]; }
  function fmtDate(value, short = false) {
    if (!value) return 'Sin fecha';
    const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    return new Intl.DateTimeFormat('es-ES', short ? { day: '2-digit', month: 'short' } : { day: '2-digit', month: 'long', year: 'numeric' }).format(date);
  }
  function fmtDateTime(value) {
    if (!value) return '';
    return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  }
  function initials(name) { return String(name).split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase(); }
  function statusBadge(code) { const item = STATUS[code] || STATUS.NEW; return `<span class="badge ${item[1]}">${esc(item[0])}</span>`; }
  function priorityBadge(code) { const item = PRIORITY[code] || PRIORITY.NORMAL; return `<span class="badge ${item[1]}">${esc(item[0])}</span>`; }
  function waitingLabel(code) { const key = String(code || 'NONE').toLowerCase(); return `<span class="waiting ${key}"><i></i>Esperando a ${esc(WAITING[code] || 'nadie')}</span>`; }
  function roleName(role) { return ({ ADMIN: 'Administrador', COMMERCIAL: 'Comercial', VENUE_USER: 'Usuario finca' })[role] || role; }
  function routeTitle(route) { return ({ dashboard: 'Dashboard', pending: 'Pendiente de mí', events: 'Eventos', calendar: 'Calendario', files: 'Archivos', venues: 'Fincas', contacts: 'Contactos', backups: 'Copias de seguridad', settings: 'Configuración' })[route] || 'Marquee Flow'; }

  const navForRole = () => {
    const common = [
      ['dashboard', '⌂', 'Dashboard'],
      ['pending', '✓', 'Pendiente de mí'],
      ['events', '▦', currentUser.role === 'VENUE_USER' ? 'Mis eventos' : 'Eventos'],
      ['calendar', '□', 'Calendario'],
      ['files', '⇩', 'Archivos']
    ];
    if (currentUser.role !== 'VENUE_USER') common.push(['venues', '◇', 'Fincas'], ['contacts', '○', 'Contactos']);
    if (currentUser.role === 'ADMIN') common.push(['backups', '↻', 'Copias'], ['settings', '⚙', 'Configuración']);
    if (currentUser.role === 'VENUE_USER') common.push(['venues', '◇', 'Mi finca']);
    return common;
  };

  function boot() {
    bindStaticEvents();
    const sessionId = sessionStorage.getItem(SESSION_KEY);
    if (sessionId) currentUser = USERS.find((item) => item.id === sessionId) || null;
    if (currentUser) showApp(); else showLogin();
  }

  function bindStaticEvents() {
    $('#loginForm').addEventListener('submit', login);
    $('#quickProfiles').addEventListener('click', (event) => {
      const button = event.target.closest('[data-login]');
      if (!button) return;
      $('#loginEmail').value = button.dataset.login;
      $('#loginPassword').value = DEMO_PASSWORD;
      $('#loginForm').requestSubmit();
    });
    $('#logoutButton').addEventListener('click', logout);
    $('#profileButton').addEventListener('click', logout);
    $('#menuButton').addEventListener('click', () => { $('#sidebar').classList.add('open'); showBackdrop(); });
    $('#backdrop').addEventListener('click', closeOverlays);
    $('#quickAddButton').addEventListener('click', openNewEvent);
    $('#globalSearchButton').addEventListener('click', openSearch);
    $('#notificationButton').addEventListener('click', openNotifications);
    $('#budgetFileInput').addEventListener('change', handleBudgetUpload);
    $('#backupFileInput').addEventListener('change', importBackup);
    window.addEventListener('hashchange', renderRoute);
    document.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); }
      if (event.key === 'Escape') closeOverlays();
    });
    document.addEventListener('click', globalClick);
    document.addEventListener('submit', globalSubmit);
    document.addEventListener('change', globalChange);
  }

  function login(event) {
    event.preventDefault();
    const email = normalize($('#loginEmail').value.trim());
    const password = $('#loginPassword').value;
    const found = USERS.find((item) => normalize(item.email) === email);
    if (!found || password !== DEMO_PASSWORD) {
      $('#loginError').textContent = 'Credenciales incorrectas. Utiliza uno de los perfiles de demostración.';
      return;
    }
    $('#loginError').textContent = '';
    currentUser = found;
    sessionStorage.setItem(SESSION_KEY, found.id);
    activeRoute = found.role === 'VENUE_USER' ? 'dashboard' : 'pending';
    history.replaceState(null, '', `#${activeRoute}`);
    showApp();
    toast(`Bienvenido, ${found.name.split(' ')[0]}`);
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    currentUser = null;
    closeOverlays();
    showLogin();
  }

  function showLogin() {
    $('#appView').hidden = true;
    $('#loginView').hidden = false;
    document.title = 'Acceso · Marquee Flow V4';
  }

  function showApp() {
    $('#loginView').hidden = true;
    $('#appView').hidden = false;
    for (const id of ['sideName', 'topName']) $(`#${id}`).textContent = currentUser.name;
    for (const id of ['sideRole', 'topRole']) $(`#${id}`).textContent = roleName(currentUser.role);
    for (const id of ['sideAvatar', 'topAvatar']) $(`#${id}`).textContent = currentUser.initials;
    renderNavigation();
    if (!location.hash) location.hash = currentUser.role === 'VENUE_USER' ? 'dashboard' : 'pending';
    renderRoute();
  }

  function renderNavigation() {
    const items = navForRole();
    const pendingCount = pendingEvents().length;
    $('#mainNav').innerHTML = items.map(([route, icon, label]) => `<button class="nav-item" data-route="${route}"><span class="nav-icon">${icon}</span><span>${esc(label)}</span>${route === 'pending' && pendingCount ? `<span class="nav-count">${pendingCount}</span>` : ''}</button>`).join('');
    const mobileItems = items.slice(0, 5);
    $('#mobileNav').innerHTML = mobileItems.map(([route, icon, label]) => `<button data-route="${route}"><span>${icon}</span>${esc(label.replace('Pendiente de mí', 'Pendientes'))}</button>`).join('');
    $('#notificationCount').textContent = String(Math.max(1, visibleEvents().reduce((sum, item) => sum + (item.unread || 0), 0)));
  }

  function renderRoute() {
    if (!currentUser) return;
    const requested = location.hash.replace('#', '') || 'dashboard';
    const allowed = navForRole().map((item) => item[0]);
    activeRoute = allowed.includes(requested) ? requested : 'dashboard';
    $$('.nav-item, .mobile-nav button').forEach((button) => button.classList.toggle('active', button.dataset.route === activeRoute));
    $('#sidebar').classList.remove('open');
    hideBackdropIfIdle();
    document.title = `${routeTitle(activeRoute)} · Marquee Flow V4`;
    const renderers = { dashboard: renderDashboard, pending: renderPending, events: renderEvents, calendar: renderCalendar, files: renderFiles, venues: renderVenues, contacts: renderContacts, backups: renderBackups, settings: renderSettings };
    (renderers[activeRoute] || renderDashboard)();
    $('#mainContent').focus({ preventScroll: true });
  }

  function pageHead(title, description, actions = '') {
    return `<div class="page-head"><div><div class="eyebrow">MARQUEE FLOW V4</div><h1>${esc(title)}</h1><p>${esc(description)}</p></div><div class="head-actions">${actions}</div></div>`;
  }

  function pendingEvents() {
    const source = visibleEvents();
    if (currentUser.role === 'VENUE_USER') return source.filter((item) => item.waiting === 'VENUE' || item.unread > 0 || item.status === 'INFO');
    return source.filter((item) => item.waiting === 'MARQUEE' || !item.commercialId || ['URGENT', 'VERY_URGENT'].includes(item.priority) || ['NEW', 'REVIEW', 'PREPARING'].includes(item.status));
  }

  function renderDashboard() {
    const events = visibleEvents();
    const confirmed = events.filter((item) => item.status === 'CONFIRMED').length;
    const urgent = events.filter((item) => ['URGENT', 'VERY_URGENT'].includes(item.priority)).length;
    const budgets = state.budgets.filter((item) => events.some((event) => event.id === item.eventId) && item.status === 'Vigente').length;
    const actions = pendingEvents().slice(0, 5);
    const title = currentUser.role === 'VENUE_USER' ? `Hola, ${currentUser.name.split(' ')[0]}` : 'Centro operativo';
    const description = currentUser.role === 'VENUE_USER' ? `Todo lo relacionado con ${venue(currentUser.venueId).name}, explicado de forma clara.` : 'Lo importante primero: próximos pasos, bloqueos y respuestas pendientes.';
    const banner = currentUser.role === 'VENUE_USER' ? `<div class="status-banner"><div><b>Tu finca está conectada con Marquee</b><p>Los mensajes, presupuestos y documentos quedan vinculados a cada evento.</p></div><button class="primary-button" data-action="new-event">Nueva petición</button></div>` : '';
    $('#mainContent').innerHTML = `${pageHead(title, description, `<button class="secondary-button" data-route="calendar">Ver calendario</button><button class="primary-button" data-action="new-event">${currentUser.role === 'VENUE_USER' ? 'Nueva petición' : 'Nuevo evento'}</button>`)}${banner}
      <section class="grid metrics-grid">
        ${metric('Peticiones activas', events.filter((item) => !['DONE', 'CANCELLED', 'REJECTED'].includes(item.status)).length, 'Expedientes en curso', true)}
        ${metric('Pendiente de mí', pendingEvents().length, 'Acciones que requieren atención')}
        ${metric('Presupuestos vigentes', budgets, 'Accesibles desde cada evento')}
        ${metric('Confirmados', confirmed, urgent ? `${urgent} eventos urgentes` : 'Sin urgencias')}
      </section>
      <section class="grid dashboard-grid">
        <div class="panel"><div class="panel-head"><div><h2>${currentUser.role === 'VENUE_USER' ? 'Lo que necesita tu atención' : 'Prioridad operativa'}</h2><p>Ordenado por urgencia y fecha límite</p></div><button class="link-button" data-route="pending">Ver todo →</button></div><div class="action-list">${actions.length ? actions.map(actionRow).join('') : emptyInline('Todo al día', 'No tienes acciones pendientes en este momento.')}</div></div>
        <div class="grid">
          <div class="panel"><div class="panel-head"><div><h3>Acciones rápidas</h3><p>Sin navegar por múltiples pantallas</p></div></div><div class="panel-body grid quick-grid">
            <button class="quick-card" data-action="new-event"><span>＋</span><b>${currentUser.role === 'VENUE_USER' ? 'Nueva petición' : 'Crear evento'}</b><small>Formulario guiado</small></button>
            <button class="quick-card" data-route="calendar"><span>□</span><b>Abrir calendario</b><small>Todos los eventos</small></button>
            <button class="quick-card" data-route="files"><span>⇩</span><b>Localizar archivo</b><small>Presupuestos y documentos</small></button>
            <button class="quick-card" data-action="search"><span>⌕</span><b>Buscar</b><small>⌘ K desde cualquier lugar</small></button>
          </div></div>
          <div class="panel"><div class="panel-head"><div><h3>Actividad reciente</h3><p>Últimos movimientos relevantes</p></div></div><div class="panel-body activity-list">${state.activity.slice(0, 4).map((item, index) => `<div class="activity-item"><span class="activity-dot ${index === 0 ? 'accent' : ''}"></span><div><b>${esc(item.text)}</b><p>${esc(item.detail)}</p><time>${fmtDateTime(item.at)}</time></div></div>`).join('')}</div></div>
        </div>
      </section>`;
  }

  function metric(label, value, detail, dark = false) {
    return `<article class="metric-card ${dark ? 'dark' : ''}"><small>${esc(label)}</small><div class="metric-value"><b>${value}</b><span class="metric-trend">${esc(detail)}</span></div></article>`;
  }

  function actionRow(item) {
    const urgent = ['URGENT', 'VERY_URGENT'].includes(item.priority);
    return `<article class="action-row" data-open-event="${item.id}"><span class="action-mark ${urgent ? 'urgent' : ''}">${urgent ? '!' : '→'}</span><div class="action-copy"><b>${esc(item.nextAction || item.name)}</b><small>${esc(item.name)} · ${esc(venue(item.venueId)?.name || '')}</small></div><div class="action-meta"><b>${fmtDate(item.dueDate, true)}</b><small>${waitingLabel(item.waiting)}</small></div></article>`;
  }

  function emptyInline(title, text) { return `<div class="empty-state"><div><span>✓</span><h3>${esc(title)}</h3><p>${esc(text)}</p></div></div>`; }

  function renderPending() {
    const events = pendingEvents();
    $('#mainContent').innerHTML = `${pageHead('Pendiente de mí', 'Una bandeja personal para saber qué hacer, para cuándo y de quién depende.', `<button class="primary-button" data-action="new-event">Nuevo evento</button>`)}
      <div class="panel"><div class="panel-head"><div><h2>${events.length} acciones activas</h2><p>Cada petición debe tener responsable, próxima acción y fecha límite</p></div></div>${events.length ? `<div class="action-list">${events.map(actionRow).join('')}</div>` : emptyInline('Todo al día', 'No hay asuntos pendientes para este usuario.')}</div>`;
  }

  function renderEvents() {
    const events = filteredEventsFromControls();
    $('#mainContent').innerHTML = `${pageHead(currentUser.role === 'VENUE_USER' ? 'Mis eventos' : 'Eventos', 'Busca, filtra y abre cualquier expediente en segundos.', `<button class="secondary-button" data-action="export-csv">Exportar CSV</button><button class="primary-button" data-action="new-event">${currentUser.role === 'VENUE_USER' ? 'Nueva petición' : 'Nuevo evento'}</button>`)}
      <div class="toolbar"><div class="filters"><input id="eventSearch" type="search" placeholder="Buscar evento o cliente…" value="${esc(window.__eventSearch || '')}"><select id="statusFilter"><option value="">Todos los estados</option>${Object.entries(STATUS).map(([code, item]) => `<option value="${code}" ${window.__statusFilter === code ? 'selected' : ''}>${esc(item[0])}</option>`).join('')}</select>${currentUser.role !== 'VENUE_USER' ? `<select id="venueFilter"><option value="">Todas las fincas</option>${state.venues.map((item) => `<option value="${item.id}" ${window.__venueFilter === item.id ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select>` : ''}</div><span class="muted">${events.length} resultados</span></div>
      <div class="panel">${events.length ? eventTable(events) : emptyInline('Sin resultados', 'Prueba a retirar alguno de los filtros.')}</div>`;
  }

  function filteredEventsFromControls() {
    const query = normalize(window.__eventSearch || '');
    return visibleEvents().filter((item) => {
      const haystack = normalize([item.name, item.client, item.agency, item.contact, venue(item.venueId)?.name].join(' '));
      return (!query || haystack.includes(query)) && (!window.__statusFilter || item.status === window.__statusFilter) && (!window.__venueFilter || item.venueId === window.__venueFilter);
    }).sort((a, b) => a.date.localeCompare(b.date));
  }

  function eventTable(events) {
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Fecha</th><th>Evento</th><th>Finca</th><th>Estado</th><th>Prioridad</th><th>Esperando a</th><th>Presupuesto</th><th>Avance</th></tr></thead><tbody>${events.map((item) => {
      const budget = currentBudget(item.id);
      return `<tr data-open-event="${item.id}"><td><b>${fmtDate(item.date, true)}</b><br><span class="muted">${esc(item.start)}–${esc(item.end)}</span></td><td class="event-cell"><b>${esc(item.name)}</b><small>${esc(item.client)} · ${item.people} pax</small></td><td>${esc(venue(item.venueId)?.name || '')}</td><td>${statusBadge(item.status)}</td><td>${priorityBadge(item.priority)}</td><td>${waitingLabel(item.waiting)}</td><td>${budget ? `<b>V${budget.version}</b><br><span class="muted">${esc(budget.status)}</span>` : '<span class="muted">Sin presupuesto</span>'}</td><td><span class="completion"><progress max="100" value="${item.completion}"></progress><span>${item.completion}%</span></span></td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  function renderCalendar() {
    const events = visibleEvents();
    const base = new Date('2026-09-01T12:00:00');
    const first = (base.getDay() + 6) % 7;
    const start = new Date(base); start.setDate(1 - first);
    const cells = Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; });
    $('#mainContent').innerHTML = `${pageHead('Calendario', currentUser.role === 'VENUE_USER' ? `Calendario de ${venue(currentUser.venueId).name}.` : 'Vista global de todas las fincas y acceso directo a cada presupuesto.', `<button class="secondary-button">Hoy</button><button class="primary-button" data-action="new-event">Nuevo evento</button>`)}
      <div class="calendar-shell"><aside class="calendar-side"><div class="eyebrow light">SEPTIEMBRE 2026</div><h3>Visión operativa</h3><div class="calendar-legend"><span><i style="background:#3279e8"></i>Pendiente</span><span><i style="background:#29865b"></i>Confirmado</span><span><i style="background:#e74646"></i>Urgente</span></div></aside><div class="calendar-grid">${['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map((day) => `<div class="calendar-day-name">${day}</div>`).join('')}${cells.map((date) => calendarDay(date, events)).join('')}</div></div>`;
  }

  function calendarDay(date, events) {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const dayEvents = events.filter((item) => item.date === key);
    const muted = date.getMonth() !== 8;
    return `<div class="calendar-day ${muted ? 'muted-day' : ''}"><div class="calendar-number">${date.getDate()}</div>${dayEvents.map((item) => `<button class="calendar-event ${item.status === 'CONFIRMED' ? 'confirmed' : ''} ${['URGENT','VERY_URGENT'].includes(item.priority) ? 'urgent' : ''}" data-open-event="${item.id}"><b>${esc(item.name)}</b><small>${esc(item.start)} · ${currentBudget(item.id) ? `Ppto. V${currentBudget(item.id).version}` : 'Sin presupuesto'}</small></button>`).join('')}</div>`;
  }

  function renderFiles() {
    const eventIds = new Set(visibleEvents().map((item) => item.id));
    const budgets = state.budgets.filter((item) => eventIds.has(item.eventId));
    const docs = state.documents.filter((item) => eventIds.has(item.eventId));
    const cards = [
      ...budgets.map((item) => ({ ...item, kind: 'Presupuesto', event: eventById(item.eventId) })),
      ...docs.map((item) => ({ ...item, kind: item.category || 'Documento', event: eventById(item.eventId) }))
    ].sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)));
    $('#mainContent').innerHTML = `${pageHead('Archivos', 'Los presupuestos no se pierden: están accesibles desde biblioteca, evento, calendario y comunicación.', canManage() ? `<button class="primary-button" data-action="upload-from-library">Subir presupuesto</button>` : '')}
      <div class="toolbar"><div class="filters"><input id="fileSearch" type="search" placeholder="Buscar archivo, evento o finca…" value="${esc(window.__fileSearch || '')}"></div><span class="muted">${cards.length} archivos</span></div>
      <section class="grid file-grid">${cards.filter((item) => !window.__fileSearch || normalize([item.fileName, item.event?.name, venue(item.event?.venueId)?.name].join(' ')).includes(normalize(window.__fileSearch))).map(fileCard).join('') || emptyInline('Sin archivos', 'No hay documentos que coincidan con la búsqueda.')}</section>`;
  }

  function fileCard(item) {
    const budget = item.kind === 'Presupuesto';
    return `<article class="file-card"><div class="venue-card-head"><span class="file-icon">${budget ? 'PDF' : 'DOC'}</span>${budget ? `<span class="badge ${item.status === 'Vigente' ? 'confirmed' : 'cancelled'}">${esc(item.status)}</span>` : `<span class="badge normal">${esc(item.kind)}</span>`}</div><h3>${esc(item.fileName)}</h3><p>${esc(item.event?.name || '')}<br>${esc(venue(item.event?.venueId)?.name || '')} · ${fmtDateTime(item.uploadedAt)}</p><div class="file-actions"><button class="secondary-button" data-open-event="${item.eventId}" data-tab="budgets">Abrir evento</button><button class="primary-button" data-download-file="${item.id}" data-kind="${budget ? 'budget' : 'document'}">Descargar</button></div></article>`;
  }

  function renderVenues() {
    const venues = currentUser.role === 'VENUE_USER' ? state.venues.filter((item) => item.id === currentUser.venueId) : state.venues;
    $('#mainContent').innerHTML = `${pageHead(currentUser.role === 'VENUE_USER' ? 'Mi finca' : 'Fincas', currentUser.role === 'VENUE_USER' ? 'Información permanente del espacio para no repetirla en cada evento.' : 'Cada finca funciona como un espacio de trabajo independiente.', canManage() ? `<button class="primary-button" data-action="new-venue">Nueva finca</button>` : '')}
      <section class="grid venue-grid">${venues.map((item) => { const events = state.events.filter((event) => event.venueId === item.id); return `<article class="venue-card"><div class="venue-card-head"><span class="venue-monogram">${initials(item.name)}</span><span class="badge confirmed">Activa</span></div><h3>${esc(item.name)}</h3><p>${esc(item.municipality)}, ${esc(item.province)}<br>${esc(item.contact)} · ${esc(item.phone)}</p><div class="venue-stats"><span><b>${events.length}</b><small>Eventos</small></span><span><b>${events.filter((event) => event.status === 'CONFIRMED').length}</b><small>Confirmados</small></span><span><b>${events.filter((event) => !currentBudget(event.id)).length}</b><small>Sin ppto.</small></span></div><div class="detail-grid" style="margin-top:12px"><div class="detail-card"><small>Potencia</small><b>${esc(item.power)}</b></div><div class="detail-card"><small>Carga</small><b>${esc(item.loading)}</b></div><div class="detail-card wide"><small>Observaciones técnicas</small><p>${esc(item.notes)}</p></div></div></article>`; }).join('')}</section>`;
  }

  function renderContacts() {
    const map = new Map();
    visibleEvents().forEach((item) => { const key = normalize(item.email || item.contact); if (!map.has(key)) map.set(key, { name: item.contact, email: item.email, phone: item.phone, company: item.client, agency: item.agency, count: 0 }); map.get(key).count += 1; });
    const contacts = [...map.values()];
    $('#mainContent').innerHTML = `${pageHead('Contactos', 'Agenda sencilla conectada con clientes, agencias y eventos.', `<button class="primary-button">Nuevo contacto</button>`)}<section class="grid contact-grid">${contacts.map((item) => `<article class="contact-card"><span class="venue-monogram">${initials(item.name)}</span><h3>${esc(item.name)}</h3><p>${esc(item.company)} · ${esc(item.agency)}<br>${esc(item.email)}<br>${esc(item.phone)}</p><div class="file-actions"><button class="secondary-button">${item.count} evento${item.count === 1 ? '' : 's'}</button><a class="primary-button" href="mailto:${esc(item.email)}">Escribir</a></div></article>`).join('')}</section>`;
  }

  function renderBackups() {
    if (currentUser.role !== 'ADMIN') return go('dashboard');
    $('#mainContent').innerHTML = `${pageHead('Copias de seguridad', 'Puntos de restauración y exportación portable para validar el flujo de continuidad.', `<button class="secondary-button" data-action="import-backup">Importar</button><button class="primary-button" data-action="export-backup">Exportar copia</button>`)}
      <div class="status-banner"><div><b>Demo local protegida</b><p>En producción se utilizarán PostgreSQL, almacenamiento S3/R2, retención automática y pruebas de restauración.</p></div><button class="secondary-button" data-action="snapshot">Crear punto</button></div>
      <div class="panel"><div class="panel-head"><div><h2>Puntos de restauración</h2><p>Estados guardados dentro de este navegador</p></div></div><div class="panel-body grid">${state.snapshots.length ? state.snapshots.map((item) => `<div class="backup-card"><span class="action-mark">↻</span><div><b>${esc(item.name)}</b><small>${fmtDateTime(item.at)} · ${item.events} eventos · ${item.budgets} presupuestos</small></div><button class="secondary-button" data-restore="${item.id}">Restaurar</button></div>`).join('') : emptyInline('Todavía no hay puntos', 'Crea un punto antes de realizar cambios importantes.')}</div></div>`;
  }

  function renderSettings() {
    if (currentUser.role !== 'ADMIN') return go('dashboard');
    $('#mainContent').innerHTML = `${pageHead('Configuración', 'Preferencias generales del entorno de demostración.')}
      <div class="grid dashboard-grid"><div class="panel"><div class="panel-head"><h2>Flujo y comunicación</h2></div><div class="panel-body form-section"><label class="check"><input type="checkbox" checked> Mostrar el comercial asignado a la finca</label><label class="check"><input type="checkbox" checked> Agrupar notificaciones no urgentes</label><label class="check"><input type="checkbox" checked> Avisar cuando un presupuesto se descarga</label><label class="check"><input type="checkbox" checked> Solicitar motivo en cambios críticos</label></div></div><div class="panel"><div class="panel-head"><h2>Entorno</h2></div><div class="panel-body"><div class="detail-card"><small>Versión</small><b>Marquee Flow V4 · Demo 4.0.0</b></div><div class="detail-card" style="margin-top:10px"><small>Persistencia</small><b>Almacenamiento local del navegador</b></div><button class="danger-button full" data-action="reset-demo" style="margin-top:16px">Restablecer demo</button></div></div></div>`;
  }

  function openEvent(id, tab = 'summary') {
    const item = eventById(id);
    if (!canSeeEvent(item)) { toast('No tienes permiso para consultar este evento', true); return; }
    activeEventId = id; activeEventTab = tab || 'summary'; item.unread = 0; localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    renderEventDrawer();
    $('#eventDrawer').classList.add('open'); $('#eventDrawer').setAttribute('aria-hidden', 'false'); showBackdrop();
  }

  function renderEventDrawer() {
    const item = eventById(activeEventId); if (!item) return;
    const budget = currentBudget(item.id);
    const tabs = [['summary','Resumen'],['budgets','Presupuestos'],['messages','Comunicación'],['tasks','Tareas'],['history','Histórico']];
    $('#eventDrawer').innerHTML = `<div class="drawer-head"><div class="drawer-head-row"><span class="venue-monogram">${initials(item.name)}</span><div class="drawer-head-copy"><div>${statusBadge(item.status)} ${priorityBadge(item.priority)}</div><h2>${esc(item.name)}</h2><p>${esc(venue(item.venueId)?.name || '')} · ${fmtDate(item.date)} · ${esc(item.start)}–${esc(item.end)} · ${item.people} pax</p></div><button class="close-button" data-action="close">×</button></div></div><div class="drawer-body"><div class="drawer-tabs">${tabs.map(([code,label]) => `<button class="drawer-tab ${activeEventTab === code ? 'active' : ''}" data-event-tab="${code}">${label}${code === 'budgets' && budget ? ` · V${budget.version}` : ''}${code === 'messages' && item.messages?.length ? ` · ${item.messages.length}` : ''}</button>`).join('')}</div>${eventTabContent(item)}</div>`;
  }

  function eventTabContent(item) {
    if (activeEventTab === 'budgets') return budgetsTab(item);
    if (activeEventTab === 'messages') return messagesTab(item);
    if (activeEventTab === 'tasks') return tasksTab(item);
    if (activeEventTab === 'history') return historyTab(item);
    const budget = currentBudget(item.id);
    return `<div class="status-banner"><div><b>Próxima acción</b><p>${esc(item.nextAction)} · antes del ${fmtDate(item.dueDate, true)}</p></div>${waitingLabel(item.waiting)}</div><div class="detail-grid"><div class="detail-card"><small>Cliente</small><b>${esc(item.client)}</b><p>${esc(item.agency)}</p></div><div class="detail-card"><small>Contacto</small><b>${esc(item.contact)}</b><p>${esc(item.email)} · ${esc(item.phone)}</p></div><div class="detail-card"><small>Progreso del expediente</small><b>${item.completion}% completado</b><p><progress max="100" value="${item.completion}"></progress></p></div><div class="detail-card"><small>Presupuesto vigente</small><b>${budget ? `V${budget.version} · ${budget.amount.toLocaleString('es-ES')} €` : 'Todavía no disponible'}</b><p>${budget ? esc(budget.fileName) : 'Marquee debe prepararlo'}</p></div><div class="detail-card wide"><small>Petición audiovisual</small><p>${esc(item.audiovisual)}</p></div><div class="detail-card wide"><small>Necesidades técnicas</small><p>${esc(item.technical || 'Sin información técnica adicional.')}</p></div></div><div class="file-actions"><button class="secondary-button" data-event-tab="messages">Abrir conversación</button>${budget ? `<button class="primary-button" data-download-file="${budget.id}" data-kind="budget">Descargar presupuesto vigente</button>` : canManage() ? `<button class="primary-button" data-action="upload-budget" data-event-id="${item.id}">Añadir presupuesto</button>` : ''}</div>`;
  }

  function budgetsTab(item) {
    const budgets = budgetsFor(item.id);
    const current = currentBudget(item.id);
    return `${current ? `<div class="budget-hero"><div class="budget-hero-top"><span class="eyebrow light">PRESUPUESTO VIGENTE</span><span class="badge confirmed">V${current.version}</span></div><h3>${esc(current.fileName)}</h3><p>Publicado por ${esc(user(current.uploadedBy)?.name || 'Marquee')} · ${fmtDateTime(current.uploadedAt)}</p><div class="budget-amount">${current.amount ? `${current.amount.toLocaleString('es-ES')} €` : 'Importe no indicado'}</div><div class="budget-actions"><button class="secondary-button" data-download-file="${current.id}" data-kind="budget">Descargar PDF</button>${canManage() ? `<button class="ghost-button" data-action="upload-budget" data-event-id="${item.id}">Subir nueva versión</button>` : ''}</div></div>` : emptyInline('Presupuesto pendiente', canManage() ? 'Sube la primera versión desde este mismo expediente.' : 'Marquee está preparando la propuesta.')}
      ${budgets.length ? `<div class="panel" style="margin-top:14px"><div class="panel-head"><h3>Histórico de versiones</h3></div><div class="action-list">${budgets.map((budget) => `<div class="action-row"><span class="file-icon">V${budget.version}</span><div class="action-copy"><b>${esc(budget.fileName)}</b><small>${fmtDateTime(budget.uploadedAt)} · ${budget.amount ? `${budget.amount.toLocaleString('es-ES')} €` : 'Sin importe'}</small></div><div class="action-meta"><span class="badge ${budget.status === 'Vigente' ? 'confirmed' : 'cancelled'}">${esc(budget.status)}</span><button class="link-button" data-download-file="${budget.id}" data-kind="budget">Descargar</button></div></div>`).join('')}</div></div>` : ''}`;
  }

  function messagesTab(item) {
    const messages = item.messages || [];
    return `<div class="message-list">${messages.length ? messages.map((message) => `<div class="message ${message.userId === currentUser.id ? 'mine' : ''}"><b>${esc(user(message.userId)?.name || 'Usuario')}</b><p>${esc(message.text)}</p><time>${fmtDateTime(message.at)}</time></div>`).join('') : `<p class="muted">Todavía no hay mensajes en este evento.</p>`}</div><form class="composer" data-message-form="${item.id}"><textarea name="message" placeholder="Escribe un mensaje vinculado a este evento…" required></textarea><button class="primary-button" type="submit">Enviar</button></form>${canManage() ? `<p class="security-note">Las notas internas no se muestran a los usuarios de finca.</p>` : ''}`;
  }

  function tasksTab(item) {
    const tasks = item.tasks || [];
    return `<div class="task-list">${tasks.length ? tasks.map((task) => `<label class="task-item"><input type="checkbox" data-task-id="${task.id}" data-event-id="${item.id}" ${task.done ? 'checked' : ''}><span><b>${esc(task.text)}</b><small>Responsable: ${esc(WAITING[task.owner] || task.owner)} · ${fmtDate(task.due, true)}</small></span>${task.done ? '<span class="badge confirmed">Hecha</span>' : '<span class="badge review">Pendiente</span>'}</label>`).join('') : emptyInline('Sin tareas', 'No hay tareas asociadas a este expediente.')}</div>${canManage() ? `<button class="secondary-button full" data-action="add-task" data-event-id="${item.id}" style="margin-top:12px">＋ Añadir tarea</button>` : ''}`;
  }

  function historyTab(item) {
    return `<div class="timeline">${(item.history || []).map((entry) => `<div class="timeline-item"><time class="timeline-time">${fmtDateTime(entry.at)}</time><span class="timeline-dot"></span><div class="timeline-copy"><b>${esc(entry.text)}</b><p>Registrado automáticamente en el expediente.</p></div></div>`).join('')}</div>`;
  }

  function openNewEvent() {
    newEventStep = 1;
    renderNewEventModal();
    $('#modal').hidden = false; showBackdrop();
  }

  function renderNewEventModal(values = {}) {
    const selectedVenue = currentUser.role === 'VENUE_USER' ? currentUser.venueId : (values.venueId || state.venues[0].id);
    const content = newEventStep === 1 ? `<div class="form-section"><div class="form-row"><label class="field">Nombre del evento<input name="name" value="${esc(values.name || '')}" required placeholder="Ej. Convención anual"></label><label class="field">Empresa / cliente final<input name="client" value="${esc(values.client || '')}" required></label></div><div class="form-row"><label class="field">Finca<select name="venueId" ${currentUser.role === 'VENUE_USER' ? 'disabled' : ''}>${state.venues.map((item) => `<option value="${item.id}" ${selectedVenue === item.id ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select><input type="hidden" name="venueIdHidden" value="${selectedVenue}"></label><label class="field">Agencia<input name="agency" value="${esc(values.agency || '')}" placeholder="Directo con cliente"></label></div><div class="form-row"><label class="field">Fecha<input name="date" type="date" value="${esc(values.date || '2026-10-01')}" required></label><label class="field">Número de personas<input name="people" type="number" min="1" value="${esc(values.people || '100')}" required></label></div><div class="form-row"><label class="field">Nombre del contacto<input name="contact" value="${esc(values.contact || '')}" required></label><label class="field">Teléfono<input name="phone" value="${esc(values.phone || '')}"></label></div><label class="field">Correo electrónico<input name="email" type="email" value="${esc(values.email || '')}"></label></div>` : newEventStep === 2 ? `<div class="form-section"><label class="field">Petición de audiovisuales<textarea name="audiovisual" required placeholder="Pantalla LED, sonido, microfonía, iluminación, escenario, técnicos…">${esc(values.audiovisual || '')}</textarea></label><label class="field">Necesidades técnicas<textarea name="technical" placeholder="Medidas, señales, potencia, streaming, tiempos de montaje…">${esc(values.technical || '')}</textarea></label><div class="form-row"><label class="field">Hora de inicio<input name="start" type="time" value="${esc(values.start || '18:00')}"></label><label class="field">Hora de fin<input name="end" type="time" value="${esc(values.end || '00:00')}"></label></div></div>` : `<div class="form-section"><div class="form-row"><label class="field">Prioridad<select name="priority">${Object.entries(PRIORITY).map(([code,item]) => `<option value="${code}" ${values.priority === code ? 'selected' : ''}>${esc(item[0])}</option>`).join('')}</select></label><label class="field">Información pendiente<select name="waiting"><option value="MARQUEE">Esperando a Marquee</option><option value="VENUE">Esperando a la finca</option><option value="CLIENT">Esperando al cliente</option><option value="AGENCY">Esperando a la agencia</option><option value="NONE">Sin bloqueo</option></select></label></div><label class="field">Observaciones<textarea name="observations">${esc(values.observations || '')}</textarea></label><div class="drop-zone"><div><span>⇧</span><b>Podrás añadir planos y documentación al crear el expediente</b><small>PDF, DOCX, XLSX, JPG o PNG</small></div></div></div>`;
    $('#modal').innerHTML = `<div class="modal-card"><div class="modal-head"><div><div class="eyebrow">NUEVA PETICIÓN</div><h2>Crear evento en menos de un minuto</h2></div><button class="close-button" data-action="close">×</button></div><form id="newEventForm" data-step="${newEventStep}"><div class="modal-body"><div class="steps"><div class="step ${newEventStep === 1 ? 'active' : ''}">1 · Datos esenciales</div><div class="step ${newEventStep === 2 ? 'active' : ''}">2 · Audiovisuales</div><div class="step ${newEventStep === 3 ? 'active' : ''}">3 · Finalizar</div></div>${content}</div><div class="modal-foot">${newEventStep > 1 ? '<button class="secondary-button" type="button" data-action="event-back">Atrás</button>' : ''}<button class="primary-button" type="submit">${newEventStep < 3 ? 'Continuar' : 'Crear petición'}</button></div></form></div>`;
  }

  function collectNewEventValues(form) {
    const stored = window.__newEventDraft || {};
    new FormData(form).forEach((value, key) => { stored[key] = value; });
    if (stored.venueIdHidden) stored.venueId = stored.venueId || stored.venueIdHidden;
    window.__newEventDraft = stored;
    return stored;
  }

  function submitNewEvent(form) {
    const values = collectNewEventValues(form);
    if (newEventStep < 3) { newEventStep += 1; renderNewEventModal(values); return; }
    const duplicate = state.events.find((item) => item.venueId === values.venueId && item.date === values.date && normalize(item.client) === normalize(values.client));
    if (duplicate && !confirm(`Existe una posible petición duplicada: “${duplicate.name}”. ¿Deseas crearla igualmente?`)) return;
    const item = { id: uid('e'), venueId: values.venueId || currentUser.venueId, name: values.name || 'Evento sin nombre', date: values.date, start: values.start || '18:00', end: values.end || '00:00', client: values.client || '', agency: values.agency || 'Directo con cliente', contact: values.contact || '', email: values.email || '', phone: values.phone || '', people: Number(values.people || 0), audiovisual: values.audiovisual || 'Información pendiente', technical: values.technical || '', observations: values.observations || '', status: values.audiovisual ? 'NEW' : 'INFO', priority: values.priority || 'NORMAL', waiting: values.waiting || 'MARQUEE', commercialId: currentUser.role === 'COMMERCIAL' ? currentUser.id : '', nextAction: canManage() ? 'Revisar nueva petición' : 'Marquee revisará la petición', dueDate: '2026-09-11', completion: values.audiovisual ? 68 : 42, updatedAt: nowIso(), createdAt: nowIso(), unread: 0, messages: [], tasks: [], history: [{ at: nowIso(), text: `Petición creada por ${currentUser.name}` }] };
    state.events.unshift(item);
    state.activity.unshift({ id: uid('a'), at: nowIso(), text: 'Nueva petición creada', detail: item.name });
    window.__newEventDraft = null;
    saveState('Petición creada correctamente'); closeOverlays(); renderNavigation(); go('events'); setTimeout(() => openEvent(item.id), 80);
  }

  function openSearch() {
    $('#searchPalette').hidden = false; showBackdrop();
    $('#searchPalette').innerHTML = `<div class="palette-card"><input id="paletteInput" class="palette-input" autocomplete="off" placeholder="Buscar evento, cliente, finca, contacto o archivo…"><div id="paletteResults" class="palette-results"></div></div>`;
    $('#paletteInput').focus(); renderSearchResults('');
  }

  function renderSearchResults(query) {
    const needle = normalize(query);
    const results = [];
    visibleEvents().forEach((item) => { if (!needle || normalize([item.name,item.client,item.agency,item.contact,venue(item.venueId)?.name].join(' ')).includes(needle)) results.push({ type: 'event', id: item.id, icon: '▦', title: item.name, detail: `${item.client} · ${venue(item.venueId)?.name}` }); });
    state.venues.filter((item) => currentUser.role !== 'VENUE_USER' || item.id === currentUser.venueId).forEach((item) => { if (needle && normalize([item.name,item.municipality,item.contact].join(' ')).includes(needle)) results.push({ type: 'route', id: 'venues', icon: '◇', title: item.name, detail: `${item.municipality} · ${item.contact}` }); });
    state.budgets.filter((item) => visibleEvents().some((event) => event.id === item.eventId)).forEach((item) => { if (needle && normalize(item.fileName).includes(needle)) results.push({ type: 'event', id: item.eventId, tab: 'budgets', icon: 'PDF', title: item.fileName, detail: eventById(item.eventId)?.name || '' }); });
    $('#paletteResults').innerHTML = results.slice(0, 12).map((item) => `<button class="search-result" data-search-type="${item.type}" data-search-id="${item.id}" data-tab="${item.tab || ''}"><span class="search-result-icon">${item.icon}</span><span><b>${esc(item.title)}</b><small>${esc(item.detail)}</small></span></button>`).join('') || `<div class="empty-state"><p>No se encontraron resultados.</p></div>`;
  }

  function openNotifications() {
    const items = pendingEvents().slice(0, 6);
    $('#modal').hidden = false; showBackdrop();
    $('#modal').innerHTML = `<div class="modal-card"><div class="modal-head"><div><div class="eyebrow">NOTIFICACIONES</div><h2>Asuntos importantes</h2></div><button class="close-button" data-action="close">×</button></div><div class="action-list">${items.length ? items.map(actionRow).join('') : emptyInline('Todo al día', 'No hay notificaciones pendientes.')}</div></div>`;
  }

  function uploadBudget(eventId) {
    if (!canManage()) { toast('Solo Marquee puede publicar presupuestos', true); return; }
    pendingBudgetEventId = eventId;
    $('#budgetFileInput').value = '';
    $('#budgetFileInput').click();
  }

  function handleBudgetUpload(event) {
    const file = event.target.files?.[0];
    if (!file || !pendingBudgetEventId) return;
    if (file.size > 3 * 1024 * 1024) { toast('En la demo el archivo debe ocupar menos de 3 MB', true); return; }
    const versions = budgetsFor(pendingBudgetEventId);
    versions.forEach((item) => { if (item.status === 'Vigente') item.status = 'Sustituido'; });
    const next = Math.max(0, ...versions.map((item) => item.version)) + 1;
    const reader = new FileReader();
    reader.onload = () => {
      state.budgets.push({ id: uid('b'), eventId: pendingBudgetEventId, fileName: file.name, version: next, status: 'Vigente', amount: 0, uploadedBy: currentUser.id, uploadedAt: nowIso(), dataUrl: reader.result });
      const item = eventById(pendingBudgetEventId);
      item.status = 'SENT'; item.waiting = 'CLIENT'; item.updatedAt = nowIso(); item.completion = Math.max(item.completion, 82); item.history.unshift({ at: nowIso(), text: `Presupuesto V${next} publicado` });
      state.activity.unshift({ id: uid('a'), at: nowIso(), text: `Presupuesto V${next} publicado`, detail: item.name });
      saveState(`Presupuesto V${next} publicado`); renderNavigation(); renderEventDrawer(); if (activeRoute === 'files') renderFiles();
    };
    reader.readAsDataURL(file);
  }

  function downloadFile(id, kind) {
    if (kind === 'budget') {
      const item = state.budgets.find((budget) => budget.id === id); if (!item || !canSeeEvent(eventById(item.eventId))) return;
      if (item.dataUrl) return downloadDataUrl(item.dataUrl, item.fileName);
      const event = eventById(item.eventId);
      const text = `MARQUEE AUDIOVISUALES\n\n${event.name}\n${venue(event.venueId)?.name}\nPresupuesto V${item.version}\n${item.amount ? `Importe: ${item.amount.toLocaleString('es-ES')} EUR` : ''}\n\nDocumento simulado para la demostración V4.`;
      return downloadBlob(makeSimplePdf(text), item.fileName);
    }
    const item = state.documents.find((document) => document.id === id); if (!item || !canSeeEvent(eventById(item.eventId))) return;
    downloadBlob(new Blob([`Documento de demostración\n\n${item.fileName}\nEvento: ${eventById(item.eventId)?.name}`], { type: 'text/plain;charset=utf-8' }), item.fileName.replace(/\.[^.]+$/, '.txt'));
  }

  function makeSimplePdf(text) {
    const safe = text.replace(/[()\\]/g, (char) => `\\${char}`).replace(/\r?\n/g, ') Tj T* (');
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
      `<< /Length ${safe.length + 55} >>\nstream\nBT /F1 12 Tf 50 790 Td 16 TL (${safe}) Tj ET\nendstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
    ];
    let pdf = '%PDF-1.4\n'; const offsets = [0];
    objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
    const xref = pdf.length; pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`; offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
    pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return new Blob([pdf], { type: 'application/pdf' });
  }

  function downloadDataUrl(dataUrl, fileName) { const link = document.createElement('a'); link.href = dataUrl; link.download = fileName; link.click(); toast('Descarga iniciada'); }
  function downloadBlob(blob, fileName) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = fileName; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Descarga iniciada'); }

  function exportCsv() {
    const rows = [['Fecha','Evento','Cliente','Agencia','Finca','Contacto','Personas','Estado','Prioridad','Última actualización'], ...filteredEventsFromControls().map((item) => [item.date,item.name,item.client,item.agency,venue(item.venueId)?.name,item.contact,item.people,STATUS[item.status]?.[0],PRIORITY[item.priority]?.[0],item.updatedAt])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    downloadBlob(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }), 'marquee_eventos_v4.csv');
  }

  function exportBackup() {
    const payload = { product: 'Marquee Flow V4', exportedAt: nowIso(), state };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `marquee-flow-v4-backup-${new Date().toISOString().slice(0,10)}.json`);
  }

  function importBackup(event) {
    const file = event.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { const parsed = JSON.parse(reader.result); const incoming = parsed.state || parsed; if (!incoming.events || !incoming.venues) throw new Error('Formato no válido'); state = incoming; saveState('Copia restaurada correctamente'); renderNavigation(); renderRoute(); }
      catch { toast('No se ha podido importar esta copia', true); }
    };
    reader.readAsText(file); event.target.value = '';
  }

  function createSnapshot() {
    const snapshot = { id: uid('s'), name: `Punto manual · ${new Date().toLocaleString('es-ES')}`, at: nowIso(), events: state.events.length, budgets: state.budgets.length, payload: JSON.stringify({ ...state, snapshots: [] }) };
    state.snapshots.unshift(snapshot); saveState('Punto de restauración creado'); renderBackups();
  }

  function restoreSnapshot(id) {
    const snapshot = state.snapshots.find((item) => item.id === id); if (!snapshot || !confirm('¿Restaurar este punto? Se sustituirá el estado actual de la demo.')) return;
    const snapshots = state.snapshots; state = JSON.parse(snapshot.payload); state.snapshots = snapshots; saveState('Estado restaurado'); renderBackups();
  }

  function go(route) { if (location.hash === `#${route}`) renderRoute(); else location.hash = route; }
  function showBackdrop() { $('#backdrop').hidden = false; }
  function hideBackdropIfIdle() { if (!$('#sidebar').classList.contains('open') && !$('#eventDrawer').classList.contains('open') && $('#modal').hidden && $('#searchPalette').hidden) $('#backdrop').hidden = true; }
  function closeOverlays() { $('#sidebar').classList.remove('open'); $('#eventDrawer').classList.remove('open'); $('#eventDrawer').setAttribute('aria-hidden', 'true'); $('#modal').hidden = true; $('#searchPalette').hidden = true; hideBackdropIfIdle(); }

  function toast(message, error = false) {
    const node = document.createElement('div'); node.className = 'toast'; node.innerHTML = `<i>${error ? '!' : '✓'}</i><div><b>${error ? 'Revisa esta acción' : 'Operación completada'}</b><small>${esc(message)}</small></div>`;
    $('#toastRegion').appendChild(node); setTimeout(() => node.remove(), 3200);
  }

  function globalClick(event) {
    const routeButton = event.target.closest('[data-route]'); if (routeButton) { go(routeButton.dataset.route); return; }
    const openButton = event.target.closest('[data-open-event]'); if (openButton) { closeOverlays(); setTimeout(() => openEvent(openButton.dataset.openEvent, openButton.dataset.tab || 'summary'), 0); return; }
    const tabButton = event.target.closest('[data-event-tab]'); if (tabButton) { activeEventTab = tabButton.dataset.eventTab; renderEventDrawer(); return; }
    const download = event.target.closest('[data-download-file]'); if (download) { downloadFile(download.dataset.downloadFile, download.dataset.kind); return; }
    const searchResult = event.target.closest('[data-search-type]'); if (searchResult) { closeOverlays(); if (searchResult.dataset.searchType === 'event') openEvent(searchResult.dataset.searchId, searchResult.dataset.tab || 'summary'); else go(searchResult.dataset.searchId); return; }
    const restore = event.target.closest('[data-restore]'); if (restore) { restoreSnapshot(restore.dataset.restore); return; }
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    if (action === 'new-event') openNewEvent();
    if (action === 'close') closeOverlays();
    if (action === 'search') openSearch();
    if (action === 'export-csv') exportCsv();
    if (action === 'upload-budget') uploadBudget(event.target.closest('[data-event-id]').dataset.eventId);
    if (action === 'upload-from-library') { const first = visibleEvents()[0]; if (first) { openEvent(first.id, 'budgets'); setTimeout(() => uploadBudget(first.id), 250); } }
    if (action === 'event-back') { newEventStep = Math.max(1, newEventStep - 1); renderNewEventModal(window.__newEventDraft || {}); }
    if (action === 'export-backup') exportBackup();
    if (action === 'import-backup') $('#backupFileInput').click();
    if (action === 'snapshot') createSnapshot();
    if (action === 'reset-demo' && confirm('¿Restablecer todos los datos de la demo?')) { state = seed(); saveState('Demo restablecida'); renderNavigation(); renderRoute(); }
    if (action === 'add-task') { const item = eventById(event.target.closest('[data-event-id]').dataset.eventId); const text = prompt('Describe la nueva tarea'); if (item && text) { item.tasks.push({ id: uid('t'), text, owner: 'MARQUEE', due: item.dueDate, done: false }); item.history.unshift({ at: nowIso(), text: `Tarea añadida: ${text}` }); saveState('Tarea añadida'); renderEventDrawer(); } }
  }

  function globalSubmit(event) {
    if (event.target.id === 'newEventForm') { event.preventDefault(); submitNewEvent(event.target); return; }
    if (event.target.matches('[data-message-form]')) {
      event.preventDefault(); const item = eventById(event.target.dataset.messageForm); const text = new FormData(event.target).get('message')?.trim(); if (!item || !text) return;
      item.messages = item.messages || []; item.messages.push({ id: uid('m'), userId: currentUser.id, text, at: nowIso() }); item.history.unshift({ at: nowIso(), text: `Nuevo mensaje de ${currentUser.name}` }); item.updatedAt = nowIso(); saveState('Mensaje enviado'); renderEventDrawer();
    }
  }

  function globalChange(event) {
    if (event.target.id === 'eventSearch') { window.__eventSearch = event.target.value; renderEvents(); }
    if (event.target.id === 'statusFilter') { window.__statusFilter = event.target.value; renderEvents(); }
    if (event.target.id === 'venueFilter') { window.__venueFilter = event.target.value; renderEvents(); }
    if (event.target.id === 'fileSearch') { window.__fileSearch = event.target.value; renderFiles(); }
    if (event.target.id === 'paletteInput') renderSearchResults(event.target.value);
    if (event.target.matches('[data-task-id]')) {
      const item = eventById(event.target.dataset.eventId); const task = item?.tasks?.find((entry) => entry.id === event.target.dataset.taskId); if (!task) return;
      task.done = event.target.checked; item.history.unshift({ at: nowIso(), text: `${task.done ? 'Tarea completada' : 'Tarea reabierta'}: ${task.text}` }); saveState(task.done ? 'Tarea completada' : 'Tarea reabierta'); renderEventDrawer();
    }
  }

  document.addEventListener('input', (event) => {
    if (event.target.id === 'eventSearch') { window.__eventSearch = event.target.value; renderEvents(); }
    if (event.target.id === 'fileSearch') { window.__fileSearch = event.target.value; renderFiles(); }
    if (event.target.id === 'paletteInput') renderSearchResults(event.target.value);
  });

  boot();
})();
