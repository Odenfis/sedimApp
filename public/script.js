let appData = null;

// ==========================================
//  INICIO: VALIDACIÓN DE SESIÓN Y TEMA
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    // 1. Aplicar tema guardado
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateIcon(savedTheme);

    // Inicializar fechas en filtros (Revision Nube)
    const today = new Date().toISOString().split('T')[0];
    const inputsDate = document.querySelectorAll('input[type="date"]');
    inputsDate.forEach(input => input.value = today);

    try {
        // 2. Verificar sesión
        const res = await fetch('/api/session');
        if (!res.ok) {
            window.location.href = '/login.html';
        } else {
            // 3. Cargar datos iniciales
            fetchData();  // Equipos
            loadUsers();  // Usuarios
        }
    } catch (e) {
        window.location.href = '/login.html';
    }
});

// ==========================================
//  NAVEGACIÓN Y SIDEBAR (UNIFICADO)
// ==========================================

// Función UNIFICADA para cambiar vistas
function showView(viewName) {
    // 1. Ocultar todas las vistas
    const views = ['view-equipos', 'view-usuarios', 'view-precios', 'view-revision'];
    views.forEach(v => {
        const el = document.getElementById(v);
        if (el) el.style.display = 'none';
    });

    // 2. Resetear clases 'active' del menú
    document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active'));

    // 3. Mapeo para activar el item correcto del menú
    const menuIndex = {
        'equipos': 0,
        'usuarios': 1,
        'precios': 2,
        'revision': 3
    };

    // 4. Mostrar vista deseada
    const targetView = document.getElementById(`view-${viewName}`);
    if (targetView) {
        targetView.style.display = 'block';
        // Activar item en sidebar
        const items = document.querySelectorAll('.sidebar ul li'); // Solo los LI de la lista UL
        if (items[menuIndex[viewName]]) {
            items[menuIndex[viewName]].classList.add('active');
        }
    }
}

// Lógica Sidebar Dinámico y Responsivo
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');
    const isMobile = window.innerWidth <= 1024;

    if (isMobile) {
        // Móvil: Slide in/out
        sidebar.classList.toggle('open');
        overlay.classList.toggle('active');
    } else {
        // Escritorio: Colapsar ancho
        sidebar.classList.toggle('collapsed');

        // Cambiar icono flecha/hamburguesa
        const icon = document.querySelector('.toggle-btn i');
        if (sidebar.classList.contains('collapsed')) {
            icon.classList.remove('fa-bars');
            icon.classList.add('fa-arrow-right');
        } else {
            icon.classList.remove('fa-arrow-right');
            icon.classList.add('fa-bars');
        }
    }
}

// Cerrar menú móvil al redimensionar ventana
window.addEventListener('resize', () => {
    if (window.innerWidth > 1024) {
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('mobile-overlay').classList.remove('active');
    }
});

async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login.html';
}

// ==========================================
//  PARTE 1: CONTROL DE EQUIPOS
// ==========================================
async function fetchData() {
    try {
        const response = await fetch('/api/data');
        appData = await response.json();
        renderDashboard();
    } catch (error) { console.error("Error cargando equipos", error); }
}

function renderDashboard() {
    const container = document.getElementById("dashboard");
    if (!container) return;
    container.innerHTML = "";

    appData.areas.forEach((area, areaIdx) => {
        const areaCol = document.createElement("div");
        areaCol.className = "area-column";

        const areaTitle = document.createElement("div");
        areaTitle.className = "area-title";
        areaTitle.innerText = area.name;
        areaCol.appendChild(areaTitle);

        area.locations.forEach((loc, locIdx) => {
            const locCard = document.createElement("div");
            locCard.className = "location-card";
            locCard.innerHTML = `
                <div class="location-header-top">
                    <span class="location-name">${loc.name}</span>
                    <div class="sede-actions">
                        <i class="fas fa-plus" onclick="openCompModal(${areaIdx}, ${locIdx}, null)" title="Agregar PC"></i>
                        <i class="fas fa-cog" onclick="openSedeModal(${areaIdx}, ${locIdx})" title="Configurar Sede"></i>
                    </div>
                </div>
            `;

            const grid = document.createElement("div");
            grid.className = "computer-grid";

            loc.computers.forEach((comp, compIdx) => {
                const item = document.createElement("div");
                item.className = "computer-item";
                item.onclick = () => openCompModal(areaIdx, locIdx, compIdx);
                const iconClass = comp.type === 'server' ? 'fa-server' : 'fa-desktop';
                const statusClass = comp.status ? 'status-true' : 'status-false';
                item.innerHTML = `
                    <div class="icon-wrapper"><i class="fas ${iconClass}"></i></div>
                    <div class="status-indicator ${statusClass}"><span class="dot"></span></div>
                    <div class="comp-info"><span class="comp-name">${comp.name}</span><span class="comp-host">${comp.hostname}</span></div>
                `;
                grid.appendChild(item);
            });
            locCard.appendChild(grid);
            areaCol.appendChild(locCard);
        });

        // Botón agregar sede
        const btnAddSede = document.createElement("button");
        btnAddSede.innerText = "+ Nueva Sede";
        btnAddSede.style.cssText = "background:transparent; border:2px dashed var(--border-color); color:var(--text-secondary); width:100%; padding:10px; cursor:pointer;";
        btnAddSede.onclick = () => openSedeModal(areaIdx, null);
        areaCol.appendChild(btnAddSede);

        container.appendChild(areaCol);
    });
}

// --- MODALES EQUIPOS Y SEDES ---
const modalComp = document.getElementById("modal-comp");
const formComp = document.getElementById("computer-form");
const modalSede = document.getElementById("modal-sede");
const formSede = document.getElementById("sede-form");

function openCompModal(areaIdx, locIdx, compIdx) {
    if (!modalComp) return;
    modalComp.style.display = "block";
    const deleteBtn = document.getElementById("btn-delete-comp");
    const indicesInput = document.getElementById("comp-indices");

    if (compIdx !== null) {
        const comp = appData.areas[areaIdx].locations[locIdx].computers[compIdx];
        document.getElementById("modal-comp-title").innerText = "Editar Equipo";
        document.getElementById("comp-name").value = comp.name;
        document.getElementById("comp-hostname").value = comp.hostname;
        document.getElementById("comp-type").value = comp.type;
        document.getElementById("comp-status").checked = comp.status;
        indicesInput.value = `${areaIdx},${locIdx},${compIdx}`;
        deleteBtn.style.display = "block";
        deleteBtn.onclick = () => deleteComputer(areaIdx, locIdx, compIdx);
    } else {
        document.getElementById("modal-comp-title").innerText = "Nuevo Equipo";
        formComp.reset();
        document.getElementById("comp-type").value = "desktop";
        document.getElementById("comp-status").checked = true;
        indicesInput.value = `${areaIdx},${locIdx},new`;
        deleteBtn.style.display = "none";
    }
}

if (formComp) {
    formComp.onsubmit = async (e) => {
        e.preventDefault();
        const [areaIdx, locIdx, compIdx] = document.getElementById("comp-indices").value.split(',');
        const newComp = {
            id: Date.now(),
            name: document.getElementById("comp-name").value,
            hostname: document.getElementById("comp-hostname").value,
            type: document.getElementById("comp-type").value,
            status: document.getElementById("comp-status").checked
        };
        if (compIdx === 'new') {
            appData.areas[areaIdx].locations[locIdx].computers.push(newComp);
        } else {
            newComp.id = appData.areas[areaIdx].locations[locIdx].computers[compIdx].id;
            appData.areas[areaIdx].locations[locIdx].computers[compIdx] = newComp;
        }
        await saveData();
        modalComp.style.display = "none";
    };
}

async function deleteComputer(areaIdx, locIdx, compIdx) {
    if (confirm("¿Eliminar equipo?")) {
        appData.areas[areaIdx].locations[locIdx].computers.splice(compIdx, 1);
        await saveData();
        modalComp.style.display = "none";
    }
}

function openSedeModal(areaIdx, locIdx) {
    if (!modalSede) return;
    modalSede.style.display = "block";
    const indicesInput = document.getElementById("sede-indices");
    const nameInput = document.getElementById("sede-name");
    const deleteBtn = document.getElementById("btn-delete-sede");

    if (locIdx !== null) {
        const loc = appData.areas[areaIdx].locations[locIdx];
        document.getElementById("modal-sede-title").innerText = "Editar Sede";
        nameInput.value = loc.name;
        indicesInput.value = `${areaIdx},${locIdx}`;
        deleteBtn.style.display = "block";
        deleteBtn.onclick = () => deleteSede(areaIdx, locIdx);
    } else {
        document.getElementById("modal-sede-title").innerText = "Nueva Sede";
        nameInput.value = "";
        indicesInput.value = `${areaIdx},new`;
        deleteBtn.style.display = "none";
    }
}

if (formSede) {
    formSede.onsubmit = async (e) => {
        e.preventDefault();
        const indices = document.getElementById("sede-indices").value.split(',');
        const areaIdx = indices[0];
        const locIdx = indices[1];
        const name = document.getElementById("sede-name").value;
        if (locIdx === 'new') {
            appData.areas[areaIdx].locations.push({ name: name, computers: [] });
        } else {
            appData.areas[areaIdx].locations[locIdx].name = name;
        }
        await saveData();
        modalSede.style.display = "none";
    };
}

async function deleteSede(areaIdx, locIdx) {
    if (confirm("¿Eliminar sede y sus equipos?")) {
        appData.areas[areaIdx].locations.splice(locIdx, 1);
        await saveData();
        modalSede.style.display = "none";
    }
}

async function saveData() {
    await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(appData)
    });
    renderDashboard();
}

function closeModal(id) { document.getElementById(id).style.display = "none"; }


// ==========================================
//  PARTE 2: USUARIOS
// ==========================================
async function loadUsers() {
    try {
        const res = await fetch('/api/users');
        if (!res.ok) return;
        const users = await res.json();
        const tbody = document.querySelector('#users-table tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        users.forEach(u => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${u.id}</td><td>${u.usuario}</td><td>${u.nombre}</td><td><button class="btn-delete" style="padding:5px 10px;" onclick="deleteUser(${u.id})">Eliminar</button></td>`;
            tbody.appendChild(tr);
        });
    } catch (e) { console.error("Error usuarios", e); }
}

function openUserModal() { document.getElementById('modal-user').style.display = 'block'; }
const formUser = document.getElementById('user-form');
if (formUser) {
    formUser.onsubmit = async (e) => {
        e.preventDefault();
        const usuario = document.getElementById('u-user').value;
        const password = document.getElementById('u-pass').value;
        const nombre = document.getElementById('u-name').value;
        const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario, password, nombre }) });
        if (res.ok) { closeModal('modal-user'); formUser.reset(); loadUsers(); alert('Usuario creado'); } else { alert('Error al crear usuario'); }
    };
}
async function deleteUser(id) { if (confirm('¿Borrar usuario?')) { await fetch(`/api/users/${id}`, { method: 'DELETE' }); loadUsers(); } }

// ==========================================
//  PARTE 3: TEMA CLARO/OSCURO
// ==========================================
function toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme') || 'light';
    const target = current === 'light' ? 'dark' : 'light';
    html.setAttribute('data-theme', target);
    localStorage.setItem('theme', target);
    updateIcon(target);
}
function updateIcon(theme) {
    const icon = document.getElementById('theme-icon');
    if (!icon) return;
    if (theme === 'light') icon.className = 'fas fa-moon';
    else icon.className = 'fas fa-sun';
}

// ==========================================
//  MÓDULO: CAMBIO DE PRECIOS
// ==========================================
async function cargarProductosPrecios() {
    const empresa = document.getElementById('empresa-select').value;
    const tbody = document.querySelector('#precios-table tbody');
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Cargando productos...</td></tr>';
    try {
        const res = await fetch(`/api/precios/${empresa}`);
        if (!res.ok) throw new Error('Error al cargar');
        const productos = await res.json();
        renderTablaPrecios(productos);
    } catch (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--red-status);">Error cargando datos</td></tr>';
    }
}
function renderTablaPrecios(lista) {
    const tbody = document.querySelector('#precios-table tbody');
    tbody.innerHTML = '';
    if (lista.length === 0) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No se encontraron productos tipo 3.</td></tr>'; return; }
    lista.forEach(p => {
        const tr = document.createElement('tr');
        //const p1 = p.PreTema1 || 0; const p2 = p.PreTema2 || 0; const p3 = p.PreTema3 || 0;
        //const p4 = p.PreTema4 || 0; const p5 = p.PreTema5 || 0; const p6 = p.PreTema6 || 0;
        const p1 = (p.PreTema1 || 0).toFixed(4);
        const p2 = (p.PreTema2 || 0).toFixed(4);
        const p3 = (p.PreTema3 || 0).toFixed(4);
        const p4 = (p.PreTema4 || 0).toFixed(4);
        const p5 = (p.PreTema5 || 0).toFixed(4);
        const p6 = (p.PreTema6 || 0).toFixed(4);
        tr.innerHTML = `
            <td><span style="font-weight:bold; font-size:0.85rem; color:var(--text-secondary)">${p.CodPro}</span><br>${p.Nombre}</td>
            <td><input type="number" step="0.01" class="price-input" id="p1-${p.CodPro}" value="${p1}"></td>
            <td><input type="number" step="0.01" class="price-input" id="p2-${p.CodPro}" value="${p2}"></td>
            <td><input type="number" step="0.01" class="price-input" id="p3-${p.CodPro}" value="${p3}"></td>
            <td><input type="number" step="0.01" class="price-input" id="p4-${p.CodPro}" value="${p4}"></td>
            <td><input type="number" step="0.01" class="price-input" id="p5-${p.CodPro}" value="${p5}"></td>
            <td><input type="number" step="0.01" class="price-input" id="p6-${p.CodPro}" value="${p6}"></td>
            <td><button class="btn-update" onclick="guardarPrecio('${p.CodPro}')"><i class="fas fa-save"></i></button></td>
        `;
        tbody.appendChild(tr);
    });
}
function filtrarTablaPrecios() {
    const texto = document.getElementById('search-product').value.toLowerCase().trim();
    const filas = document.querySelectorAll('#precios-table tbody tr');
    filas.forEach(fila => {
        const celdaProducto = fila.cells[0];
        if (celdaProducto) {
            const contenido = celdaProducto.textContent || celdaProducto.innerText;
            fila.style.display = contenido.toLowerCase().includes(texto) ? '' : 'none';
        }
    });
}
async function guardarPrecio(codPro) {
    const p1 = document.getElementById(`p1-${codPro}`).value;
    const p2 = document.getElementById(`p2-${codPro}`).value;
    const p3 = document.getElementById(`p3-${codPro}`).value;
    const p4 = document.getElementById(`p4-${codPro}`).value;
    const p5 = document.getElementById(`p5-${codPro}`).value;
    const p6 = document.getElementById(`p6-${codPro}`).value;
    const btn = event.currentTarget; const icono = btn.querySelector('i');
    icono.className = "fas fa-spinner fa-spin";
    try {
        const res = await fetch(`/api/precios/${codPro}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p1, p2, p3, p4, p5, p6 }) });
        if (res.ok) {
            icono.className = "fas fa-check"; btn.style.backgroundColor = "var(--green-status)";
            setTimeout(() => { icono.className = "fas fa-save"; btn.style.backgroundColor = "var(--accent)"; }, 1500);
        } else { alert("Error al guardar"); icono.className = "fas fa-save"; }
    } catch (e) { alert("Error de conexión"); icono.className = "fas fa-save"; }
}

// ==========================================
//  MÓDULO: REVISIÓN NUBE
// ==========================================
async function consultarRevision() {
    const empresa = document.getElementById('rev-empresa').value;
    const turno = document.getElementById('rev-turno').value;
    const inicio = document.getElementById('rev-inicio').value;
    const fin = document.getElementById('rev-fin').value;
    const grid = document.getElementById('revision-grid');
    grid.innerHTML = '<div style="width:100%; text-align:center;"><i class="fas fa-spinner fa-spin fa-3x"></i><br>Consultando Nube...</div>';
    try {
        const res = await fetch('/api/revision-nube', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ empresa, turno, fechaInicio: inicio, fechaFin: fin }) });
        if (!res.ok) throw new Error('Error en consulta');
        const data = await res.json();
        renderRevisionCards(data);
    } catch (error) { grid.innerHTML = '<div style="color:var(--red-status); text-align:center;">Error al consultar datos</div>'; }
}
function renderRevisionCards(data) {
    const grid = document.getElementById('revision-grid');
    grid.innerHTML = '';
    const tables = [
        { key: 'doccab', title: 'Doccab' }, { key: 'docdet', title: 'Docdet' },
        { key: 'ticket_c', title: 'Ticket_C' }, { key: 'ticket_d', title: 'Ticket_D' },
        { key: 'pagos', title: 'Pagos Tickets' }, { key: 'caja', title: 'Caja' }
    ];
    tables.forEach(t => {
        const info = data[t.key] || { Total: 0 };
        const hasData = info.Total > 0;
        const card = document.createElement('div');
        card.className = 'status-card';
        let contentHTML = '';
        if (hasData) {
            contentHTML = `<div class="card-data"><div class="data-row"><span>INICIO:</span> ${info.First}</div><div class="data-row"><span>FIN:</span> ${info.Last}</div><div class="total-row">REGISTROS: ${info.Total} FILAS</div></div>`;
        } else {
            contentHTML = `<div class="no-data-state"><i class="fas fa-exclamation-triangle"></i><span class="no-data-text">NO HAY REGISTROS</span><i class="fas fa-person-walking"></i></div>`;
        }
        card.innerHTML = `<div class="card-header"><span class="table-name">${t.title}</span><div class="traffic-light ${hasData ? 'light-green' : 'light-red'}"></div></div>${contentHTML}`;
        grid.appendChild(card);
    });
}