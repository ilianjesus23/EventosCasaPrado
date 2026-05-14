// ============================================================
// STATE
// ============================================================
let state = {
  events: [],
  restaurants: ['La Hacienda', 'El Rincón Mexicano', 'Bistrot Central', 'Mar Abierto'],
  editingId: null,
  deletingId: null,
  currentMonth: new Date().getMonth(),
  currentYear: new Date().getFullYear(),
  expandedId: null,
  activeDetailTab: {},
  pendingLockAttach: null,
};

// ============================================================
// UTILS
// ============================================================
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function today() { return new Date().toISOString().split('T')[0]; }
function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${parseInt(day)} ${months[parseInt(m)-1]} ${y}`;
}
function fmtDateTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString('es-MX', {day:'2-digit',month:'short',year:'numeric'}) + ' ' +
         d.toLocaleTimeString('es-MX', {hour:'2-digit',minute:'2-digit'});
}

// ── Persistence: Supabase if ready, else localStorage ────────

async function saveRestaurants() {
  localStorage.setItem('eventosPro_restaurants', JSON.stringify(state.restaurants));
}

async function saveEvents() {
  localStorage.setItem('eventosPro_events', JSON.stringify(state.events));
}

function loadLocalState() {
  try {
    const raw = localStorage.getItem('eventosPro');
    if (raw) {
      const s = JSON.parse(raw);
      Object.assign(state, s);
      return;
    }
    const r = localStorage.getItem('eventosPro_restaurants');
    const e = localStorage.getItem('eventosPro_events');
    if (r) state.restaurants = JSON.parse(r);
    if (e) state.events = JSON.parse(e);
  } catch(e) {}
}

// ============================================================
// EVENT STATUS
// ============================================================
const LOCKS = [
  { key: 'purchases', label: 'Lista de insumos', sublabel: 'Compras', icon: 'ti ti-shopping-cart', cls: 'purchases' },
  { key: 'production', label: 'Lista de producción', sublabel: 'Producción', icon: 'ti ti-chef-hat', cls: 'production' },
  { key: 'service', label: 'Equipo y mobiliario', sublabel: 'Servicio', icon: 'ti ti-armchair', cls: 'service' },
];

function getStatus(ev) {
  const locks = ev.locks || {};
  const completed = LOCKS.filter(l => locks[l.key]?.done).length;
  if (completed === 3) return 'closed';
  if (completed > 0) return 'progress';
  return 'open';
}
function statusLabel(s) { return {open:'Abierto', progress:'En proceso', closed:'Cerrado'}[s]; }
function lockCount(ev) {
  const locks = ev.locks || {};
  return LOCKS.filter(l => locks[l.key]?.done).length;
}

// ============================================================
// TOAST
// ============================================================
let toastTimer = null;
function showToast(msg, type = '') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// ============================================================
// METRICS
// ============================================================
function renderMetrics() {
  const total = state.events.length;
  const open = state.events.filter(e => getStatus(e) === 'open').length;
  const progress = state.events.filter(e => getStatus(e) === 'progress').length;
  const closed = state.events.filter(e => getStatus(e) === 'closed').length;
  document.getElementById('metrics').innerHTML = `
    <div class="metric-card">
      <div class="metric-icon total"><i class="ti ti-calendar-event"></i></div>
      <div><div class="metric-value">${total}</div><div class="metric-label">Total eventos</div></div>
    </div>
    <div class="metric-card">
      <div class="metric-icon open"><i class="ti ti-circle-dot"></i></div>
      <div><div class="metric-value">${open}</div><div class="metric-label">Abiertos</div></div>
    </div>
    <div class="metric-card">
      <div class="metric-icon progress"><i class="ti ti-progress"></i></div>
      <div><div class="metric-value">${progress}</div><div class="metric-label">En proceso</div></div>
    </div>
    <div class="metric-card">
      <div class="metric-icon closed"><i class="ti ti-circle-check"></i></div>
      <div><div class="metric-value">${closed}</div><div class="metric-label">Cerrados</div></div>
    </div>
  `;
}

// ============================================================
// RESTAURANT FILTER SELECT
// ============================================================
function populateRestaurantFilters() {
  const fs = [document.getElementById('filterRestaurant'), document.getElementById('f-restaurant')];
  fs.forEach((el, i) => {
    if (!el) return;
    const val = el.value;
    el.innerHTML = i === 0 ? '<option value="">Todos los restaurantes</option>' : '<option value="">Seleccionar...</option>';
    state.restaurants.forEach(r => {
      el.innerHTML += `<option value="${r}">${r}</option>`;
    });
    el.value = val;
  });
}

// ============================================================
// EVENTS RENDER
// ============================================================
function getFilteredEvents() {
  const q = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const fs = document.getElementById('filterStatus')?.value || '';
  const fr = document.getElementById('filterRestaurant')?.value || '';
  return state.events.filter(ev => {
    if (q && !ev.name.toLowerCase().includes(q) && !ev.restaurant?.toLowerCase().includes(q)) return false;
    if (fs && getStatus(ev) !== fs) return false;
    if (fr && ev.restaurant !== fr) return false;
    return true;
  });
}

function renderEvents() {
  const grid = document.getElementById('eventsGrid');
  const events = getFilteredEvents();
  renderMetrics();
  if (!events.length) {
    grid.innerHTML = `<div class="empty-state">
      <i class="ti ti-calendar-off"></i>
      <p>No se encontraron eventos</p>
      <button class="btn btn-primary" onclick="openModal()"><i class="ti ti-plus"></i> Crear evento</button>
    </div>`;
    return;
  }
  const sorted = [...events].sort((a,b) => (b.date||'').localeCompare(a.date||''));
  grid.innerHTML = sorted.map(ev => renderEventCard(ev)).join('');
}

function renderEventCard(ev) {
  const status = getStatus(ev);
  const lc = lockCount(ev);
  const pct = Math.round((lc / 3) * 100);
  const isExpanded = state.expandedId === ev.id;
  const detailTab = state.activeDetailTab[ev.id] || 'info';

  return `
  <div class="event-card" id="card-${ev.id}">
    <div class="event-card-header" onclick="toggleExpand('${ev.id}')">
      <div class="event-status-bar ${status}"></div>
      <div class="event-main">
        <div class="event-top">
          <div class="event-name">${ev.name}</div>
          <span class="event-badge ${status}">${statusLabel(status)}</span>
        </div>
        <div class="event-meta">
          <div class="event-meta-item"><i class="ti ti-tools-kitchen-2"></i>${ev.restaurant || '—'}</div>
          <div class="event-meta-item"><i class="ti ti-calendar"></i>${fmtDate(ev.date)}</div>
          <div class="event-meta-item"><i class="ti ti-tag"></i>${ev.type || '—'}</div>
          <div class="event-meta-item"><i class="ti ti-user"></i>${ev.manager || '—'}</div>
          <div class="event-meta-item"><i class="ti ti-users"></i>${ev.guests ? ev.guests + ' personas' : '—'}</div>
        </div>
      </div>
      <div class="event-actions" onclick="event.stopPropagation()">
        <button class="icon-btn" onclick="openModal('${ev.id}')" title="Editar"><i class="ti ti-pencil"></i></button>
        <button class="icon-btn danger" onclick="askDelete('${ev.id}')" title="Eliminar"><i class="ti ti-trash"></i></button>
        <button class="icon-btn" onclick="toggleExpand('${ev.id}')" title="${isExpanded?'Cerrar':'Expandir'}">
          <i class="ti ti-chevron-${isExpanded?'up':'down'}"></i>
        </button>
      </div>
    </div>
    <div class="lock-progress">
      <div class="lock-progress-bar-wrap">
        <div class="lock-progress-bar" style="width:${pct}%"></div>
      </div>
      <div class="lock-progress-labels">
        <span class="lock-progress-label"><i class="ti ti-lock" style="font-size:11px"></i> ${lc}/3 candados completados</span>
        <span class="lock-progress-label">${pct}%</span>
      </div>
    </div>
    ${isExpanded ? `
    <div class="event-detail">
      <div class="event-detail-tabs">
        <button class="detail-tab ${detailTab==='info'?'active':''}" onclick="setDetailTab('${ev.id}','info')">Información</button>
        <button class="detail-tab ${detailTab==='locks'?'active':''}" onclick="setDetailTab('${ev.id}','locks')">Candados de cierre</button>
      </div>
      <div class="detail-content">
        ${detailTab === 'info' ? renderDetailInfo(ev) : renderDetailLocks(ev)}
      </div>
    </div>
    ` : ''}
  </div>`;
}

function renderDetailInfo(ev) {
  return `
  <div class="info-grid">
    <div class="info-item"><label>Restaurante</label><span>${ev.restaurant || '—'}</span></div>
    <div class="info-item"><label>Fecha</label><span>${fmtDate(ev.date)}</span></div>
    <div class="info-item"><label>Tipo de evento</label><span>${ev.type || '—'}</span></div>
    <div class="info-item"><label>Responsable</label><span>${ev.manager || '—'}</span></div>
    <div class="info-item"><label>Número de personas</label><span>${ev.guests ? ev.guests + ' personas' : '—'}</span></div>
    <div class="info-item"><label>Estado</label><span>${statusLabel(getStatus(ev))}</span></div>
    <div class="info-item full"><label>Alimentos</label><div class="notes-box">${ev.food || 'Sin descripción'}</div></div>
    <div class="info-item full"><label>Bebidas</label><div class="notes-box">${ev.drinks || 'Sin descripción'}</div></div>
    ${ev.notes ? `<div class="info-item full"><label>Notas</label><div class="notes-box">${ev.notes}</div></div>` : ''}
  </div>`;
}

function renderDetailLocks(ev) {
  const locks = ev.locks || {};
  const canClose = LOCKS.every(l => locks[l.key]?.done);
  return `
  <div class="locks-list">
    ${LOCKS.map(l => {
      const lock = locks[l.key] || {};
      const hasFile = !!lock.fileName;
      const isDone = !!lock.done;
      return `
      <div class="lock-item ${isDone?'completed':''}" id="lock-${ev.id}-${l.key}">
        <div class="lock-header">
          <div class="lock-icon ${l.cls}"><i class="${l.icon}"></i></div>
          <div class="lock-info">
            <div class="lock-title">${l.label}</div>
            <div class="lock-subtitle">${l.sublabel}</div>
          </div>
          <div class="lock-check">
            ${lock.timestamp ? `<span class="lock-timestamp">${fmtDateTime(lock.timestamp)}</span>` : ''}
            <div class="check-circle ${isDone?'done':''}">
              <i class="ti ti-${isDone?'check':'lock'}"></i>
            </div>
          </div>
        </div>
        <div class="lock-body">
          <button class="file-attach-btn ${hasFile?'has-file':''}" onclick="triggerFileAttach('${ev.id}','${l.key}')">
            <i class="ti ti-${hasFile?'file-check':'upload'}"></i>
            ${hasFile ? 'Cambiar archivo' : 'Adjuntar documento'}
          </button>
          ${hasFile ? `<span class="file-name" title="${lock.fileName}"><i class="ti ti-file" style="font-size:13px"></i> ${lock.fileName}</span>` : ''}
          ${hasFile && !isDone ? `
            <button class="btn btn-primary btn-sm" onclick="completeLock('${ev.id}','${l.key}')">
              <i class="ti ti-lock-open"></i> Marcar completado
            </button>
          ` : ''}
          ${isDone ? `<span style="font-size:12px;color:var(--primary);font-weight:600"><i class="ti ti-circle-check" style="font-size:14px"></i> Completado</span>` : ''}
        </div>
      </div>`;
    }).join('')}
    ${canClose ? `
    <div style="background:var(--primary-light);border:1.5px solid var(--primary-mid);border-radius:9px;padding:16px;display:flex;align-items:center;gap:12px;">
      <i class="ti ti-circle-check" style="font-size:24px;color:var(--primary)"></i>
      <div style="flex:1">
        <div style="font-size:14px;font-weight:600;color:var(--primary)">¡Evento listo para cerrar!</div>
        <div style="font-size:12px;color:var(--gray-500)">Los 3 candados han sido completados exitosamente.</div>
      </div>
    </div>` : ''}
  </div>`;
}

// ============================================================
// TOGGLE EXPAND
// ============================================================
function toggleExpand(id) {
  state.expandedId = state.expandedId === id ? null : id;
  renderEvents();
  if (state.expandedId === id) {
    setTimeout(() => {
      const el = document.getElementById('card-' + id);
      if (el) el.scrollIntoView({behavior: 'smooth', block: 'nearest'});
    }, 50);
  }
}

function setDetailTab(id, tab) {
  state.activeDetailTab[id] = tab;
  renderEvents();
}

// ============================================================
// LOCKS
// ============================================================
function triggerFileAttach(eventId, lockKey) {
  state.pendingLockAttach = {eventId, lockKey};
  document.getElementById('fileInput').click();
}

async function handleFileAttach(e) {
  const file = e.target.files[0];
  if (!file || !state.pendingLockAttach) return;
  const {eventId, lockKey} = state.pendingLockAttach;
  const ev = state.events.find(e => e.id === eventId);
  if (!ev) return;
  if (!ev.locks) ev.locks = {};
  if (!ev.locks[lockKey]) ev.locks[lockKey] = {};

  // Try upload to Supabase Storage, fallback to just storing filename
  if (isSupabaseReady()) {
    const result = await dbUploadFile(eventId, lockKey, file);
    if (result) {
      ev.locks[lockKey].fileName = result.fileName;
      ev.locks[lockKey].filePath = result.path;
    } else {
      ev.locks[lockKey].fileName = file.name;
    }
    await dbUpdateEvent(eventId, { locks: ev.locks });
  } else {
    ev.locks[lockKey].fileName = file.name;
    await saveEvents();
  }

  renderAll();
  e.target.value = '';
  state.pendingLockAttach = null;
  showToast('Archivo adjuntado', 'success');
}

async function completeLock(eventId, lockKey) {
  const ev = state.events.find(e => e.id === eventId);
  if (!ev || !ev.locks?.[lockKey]?.fileName) return;
  ev.locks[lockKey].done = true;
  ev.locks[lockKey].timestamp = Date.now();

  if (isSupabaseReady()) {
    await dbUpdateEvent(eventId, { locks: ev.locks });
  } else {
    await saveEvents();
  }

  renderAll();
  showToast('Candado completado', 'success');
}

// ============================================================
// MODAL
// ============================================================
function openModal(id) {
  state.editingId = id || null;
  populateRestaurantFilters();
  const ev = id ? state.events.find(e => e.id === id) : null;
  document.getElementById('modalTitle').textContent = ev ? 'Editar evento' : 'Nuevo evento';
  document.getElementById('f-name').value = ev?.name || '';
  document.getElementById('f-restaurant').value = ev?.restaurant || '';
  document.getElementById('f-date').value = ev?.date || today();
  document.getElementById('f-type').value = ev?.type || 'Corporativo';
  document.getElementById('f-manager').value = ev?.manager || '';
  document.getElementById('f-guests').value = ev?.guests || '';
  document.getElementById('f-food').value = ev?.food || '';
  document.getElementById('f-drinks').value = ev?.drinks || '';
  document.getElementById('f-notes').value = ev?.notes || '';
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  state.editingId = null;
}

async function saveEvent() {
  const name = document.getElementById('f-name').value.trim();
  const restaurant = document.getElementById('f-restaurant').value;
  const date = document.getElementById('f-date').value;
  if (!name) { showToast('El nombre del evento es requerido.', 'error'); return; }
  if (!restaurant) { showToast('Selecciona un restaurante.', 'error'); return; }
  if (!date) { showToast('La fecha es requerida.', 'error'); return; }

  const fields = {
    name, restaurant, date,
    type: document.getElementById('f-type').value,
    manager: document.getElementById('f-manager').value.trim(),
    guests: document.getElementById('f-guests').value,
    food: document.getElementById('f-food').value.trim(),
    drinks: document.getElementById('f-drinks').value.trim(),
    notes: document.getElementById('f-notes').value.trim(),
  };

  if (state.editingId) {
    const idx = state.events.findIndex(e => e.id === state.editingId);
    if (idx > -1) {
      state.events[idx] = { ...state.events[idx], ...fields };
      if (isSupabaseReady()) {
        await dbUpdateEvent(state.editingId, fields);
      } else {
        await saveEvents();
      }
    }
  } else {
    const newEv = { ...fields, locks: {}, createdAt: Date.now() };
    if (isSupabaseReady()) {
      const created = await dbCreateEvent(newEv);
      if (created) {
        state.events.push(created);
      } else {
        showToast('Error al guardar el evento.', 'error');
        return;
      }
    } else {
      newEv.id = uid();
      state.events.push(newEv);
      await saveEvents();
    }
  }

  closeModal();
  renderAll();
  showToast(state.editingId ? 'Evento actualizado' : 'Evento creado', 'success');
}

// ============================================================
// DELETE
// ============================================================
function askDelete(id) {
  state.deletingId = id;
  document.getElementById('confirmOverlay').classList.add('open');
}
function closeConfirm() {
  document.getElementById('confirmOverlay').classList.remove('open');
  state.deletingId = null;
}
async function confirmDelete() {
  if (!state.deletingId) return;

  if (isSupabaseReady()) {
    await dbDeleteEvent(state.deletingId);
  }

  state.events = state.events.filter(e => e.id !== state.deletingId);
  if (state.expandedId === state.deletingId) state.expandedId = null;

  if (!isSupabaseReady()) await saveEvents();

  closeConfirm();
  renderAll();
  showToast('Evento eliminado', '');
}

// ============================================================
// CALENDAR
// ============================================================
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

function changeMonth(delta) {
  state.currentMonth += delta;
  if (state.currentMonth > 11) { state.currentMonth = 0; state.currentYear++; }
  if (state.currentMonth < 0) { state.currentMonth = 11; state.currentYear--; }
  renderCalendar();
}
function goToday() {
  const now = new Date();
  state.currentMonth = now.getMonth();
  state.currentYear = now.getFullYear();
  renderCalendar();
}

function renderCalendar() {
  document.getElementById('calTitle').textContent = `${MONTHS[state.currentMonth]} ${state.currentYear}`;
  const grid = document.getElementById('calGrid');
  const now = new Date();

  let html = DAYS.map(d => `<div class="cal-day-header">${d}</div>`).join('');

  const firstDay = new Date(state.currentYear, state.currentMonth, 1).getDay();
  const daysInMonth = new Date(state.currentYear, state.currentMonth + 1, 0).getDate();
  const daysInPrev = new Date(state.currentYear, state.currentMonth, 0).getDate();
  const total = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  for (let i = 0; i < total; i++) {
    let day, month, year, isOther = false;
    if (i < firstDay) {
      day = daysInPrev - firstDay + i + 1;
      month = state.currentMonth - 1;
      year = state.currentYear;
      if (month < 0) { month = 11; year--; }
      isOther = true;
    } else if (i >= firstDay + daysInMonth) {
      day = i - firstDay - daysInMonth + 1;
      month = state.currentMonth + 1;
      year = state.currentYear;
      if (month > 11) { month = 0; year++; }
      isOther = true;
    } else {
      day = i - firstDay + 1;
      month = state.currentMonth;
      year = state.currentYear;
    }
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const isToday = day === now.getDate() && month === now.getMonth() && year === now.getFullYear();
    const dayEvents = state.events.filter(ev => ev.date === dateStr);

    html += `<div class="cal-cell ${isOther?'other-month':''} ${isToday?'today':''}">
      <div class="cal-day-num">${day}</div>
      ${dayEvents.map(ev => `
        <div class="cal-event ${getStatus(ev)}" onclick="goToEvent('${ev.id}')" title="${ev.name} — ${ev.restaurant||''}">
          ${ev.name}
        </div>
      `).join('')}
    </div>`;
  }
  grid.innerHTML = html;
}

function goToEvent(id) {
  switchTab('events');
  state.expandedId = id;
  state.activeDetailTab[id] = 'info';
  renderAll();
  setTimeout(() => {
    const el = document.getElementById('card-' + id);
    if (el) el.scrollIntoView({behavior: 'smooth', block: 'center'});
  }, 100);
}

// ============================================================
// CONFIG
// ============================================================
function renderConfig() {
  const list = document.getElementById('restaurantList');
  if (!state.restaurants.length) {
    list.innerHTML = `<div class="empty-state" style="padding:20px"><p>No hay restaurantes registrados</p></div>`;
    return;
  }
  list.innerHTML = state.restaurants.map((r, i) => `
    <div class="restaurant-item">
      <div class="r-icon"><i class="ti ti-tools-kitchen-2"></i></div>
      <div class="r-name">${r}</div>
      <button class="icon-btn danger" onclick="removeRestaurant(${i})" title="Eliminar"><i class="ti ti-trash"></i></button>
    </div>
  `).join('');
}

async function addRestaurant() {
  const input = document.getElementById('newRestaurantInput');
  const name = input.value.trim();
  if (!name) return;
  if (state.restaurants.includes(name)) { showToast('Este restaurante ya existe.', 'error'); return; }

  if (isSupabaseReady()) {
    const ok = await dbAddRestaurant(name);
    if (!ok) { showToast('Error al agregar restaurante.', 'error'); return; }
  }

  state.restaurants.push(name);
  input.value = '';

  if (!isSupabaseReady()) await saveRestaurants();

  renderConfig();
  populateRestaurantFilters();
  showToast('Restaurante agregado', 'success');
}

async function removeRestaurant(idx) {
  const name = state.restaurants[idx];
  const inUse = state.events.some(e => e.restaurant === name);
  if (inUse && !confirm(`El restaurante "${name}" está en uso. ¿Eliminar de todas formas?`)) return;

  if (isSupabaseReady()) {
    await dbRemoveRestaurant(name);
  }

  state.restaurants.splice(idx, 1);

  if (!isSupabaseReady()) await saveRestaurants();

  renderConfig();
  populateRestaurantFilters();
  showToast('Restaurante eliminado', '');
}

// ============================================================
// TABS
// ============================================================
function switchTab(tab) {
  ['events', 'calendar', 'config'].forEach(t => {
    document.getElementById('tab-' + t).classList.toggle('hidden', t !== tab);
    document.querySelector(`.nav-tab[data-tab="${t}"]`).classList.toggle('active', t === tab);
  });
  if (tab === 'calendar') renderCalendar();
  if (tab === 'config') renderConfig();
}

// ============================================================
// RENDER ALL
// ============================================================
function renderAll() {
  renderMetrics();
  renderEvents();
  populateRestaurantFilters();
  const activeTab = document.querySelector('.nav-tab.active')?.dataset?.tab;
  if (activeTab === 'calendar') renderCalendar();
  if (activeTab === 'config') renderConfig();
}

// ============================================================
// CLOSE MODALS ON OVERLAY CLICK / ESC
// ============================================================
document.getElementById('modalOverlay').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});
document.getElementById('confirmOverlay').addEventListener('click', function(e) {
  if (e.target === this) closeConfirm();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeConfirm(); }
});

// ============================================================
// INIT
// ============================================================
async function init() {
  loadLocalState();

  // If Supabase is configured, load from DB (overrides localStorage)
  if (isSupabaseReady()) {
    const [restaurants, events] = await Promise.all([dbGetRestaurants(), dbGetEvents()]);
    if (restaurants) state.restaurants = restaurants;
    if (events) state.events = events;
  }

  // Seed demo data if empty (only in localStorage mode)
  if (!state.events.length && !isSupabaseReady()) {
    const demoEvents = [
      {
        id: uid(), name: 'Cena Corporativa ACME', restaurant: state.restaurants[0],
        date: (() => { const d = new Date(); d.setDate(d.getDate() + 5); return d.toISOString().split('T')[0]; })(),
        type: 'Corporativo', manager: 'Laura Gómez', guests: '80',
        food: 'Menú de 4 tiempos: ensalada, sopa, plato fuerte (res o pollo), postre.',
        drinks: 'Barra libre estándar 4 horas, vinos de mesa, refresco y agua.',
        notes: 'Requiere pantalla y proyector para presentación.', locks: {}, createdAt: Date.now(),
      },
      {
        id: uid(), name: 'Boda Martínez-Soto', restaurant: state.restaurants[1],
        date: (() => { const d = new Date(); d.setDate(d.getDate() + 12); return d.toISOString().split('T')[0]; })(),
        type: 'Boda', manager: 'Carlos Ríos', guests: '150',
        food: 'Coctel de bienvenida, cena de gala 5 tiempos, pastel de 4 pisos.',
        drinks: 'Barra premium 6 horas, champagne para brindis.',
        notes: 'Decoración floral incluida. Música en vivo de 8pm a 12am.',
        locks: {
          purchases: { fileName: 'insumos_boda.xlsx', done: true, timestamp: Date.now() - 86400000 }
        },
        createdAt: Date.now() - 2*86400000,
      },
      {
        id: uid(), name: 'Graduación ITESM', restaurant: state.restaurants[2],
        date: (() => { const d = new Date(); d.setDate(d.getDate() - 3); return d.toISOString().split('T')[0]; })(),
        type: 'Graduación', manager: 'Ana Torres', guests: '200',
        food: 'Buffet internacional, estaciones temáticas.',
        drinks: 'Barra libre 5 horas.',
        notes: '',
        locks: {
          purchases: { fileName: 'compras.pdf', done: true, timestamp: Date.now() - 5*86400000 },
          production: { fileName: 'produccion.docx', done: true, timestamp: Date.now() - 3*86400000 },
          service: { fileName: 'servicio.pdf', done: true, timestamp: Date.now() - 86400000 },
        },
        createdAt: Date.now() - 7*86400000,
      },
    ];
    state.events = demoEvents;
    await saveEvents();
  }

  populateRestaurantFilters();
  renderAll();
}

init();
