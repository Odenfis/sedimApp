let appData = null; // Variable global para los datos de equipos

// ==========================================
//  INICIO: VALIDACIÓN DE SESIÓN
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    // 1. Aplicar tema guardado
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateIcon(savedTheme);

    try {
        // 2. Verificar si estamos logueados
        const res = await fetch('/api/session');
        if (!res.ok) {
            window.location.href = '/login.html'; // Si falla, al login
        } else {
            // 3. Si todo ok, cargamos las dos partes del sistema
            fetchData();  // Cargar Equipos (JSON)
            loadUsers();  // Cargar Usuarios (Azure)
        }
    } catch (e) {
        window.location.href = '/login.html';
    }
});

// ==========================================
//  LÓGICA DEL MENÚ LATERAL (TABS)
// ==========================================
function showView(viewName) {
    // Ocultar todas las vistas
    document.getElementById('view-equipos').style.display = 'none';
    document.getElementById('view-usuarios').style.display = 'none';

    // Quitar clase active del menú
    document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active'));

    // Activar la seleccionada
    if (viewName === 'equipos') {
        document.getElementById('view-equipos').style.display = 'block';
        // Asumiendo que es el primer LI
        document.querySelectorAll('.sidebar li')[0].classList.add('active');
    } else {
        document.getElementById('view-usuarios').style.display = 'block';
        // Asumiendo que es el segundo LI
        document.querySelectorAll('.sidebar li')[1].classList.add('active');
    }
}

async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login.html';
}

// ==========================================
//  PARTE 1: CONTROL DE EQUIPOS (JSON)
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
    if (!container) return; // Si no existe el div, salir
    container.innerHTML = "";

    appData.areas.forEach((area, areaIdx) => {
        // Columna de Área
        const areaCol = document.createElement("div");
        areaCol.className = "area-column";

        const areaTitle = document.createElement("div");
        areaTitle.className = "area-title";
        areaTitle.innerText = area.name;
        areaCol.appendChild(areaTitle);

        // Sedes
        area.locations.forEach((loc, locIdx) => {
            const locCard = document.createElement("div");
            locCard.className = "location-card";

            // Header Sede
            locCard.innerHTML = `
                <div class="location-header-top">
                    <span class="location-name">${loc.name}</span>
                    <div class="sede-actions">
                        <i class="fas fa-plus" onclick="openCompModal(${areaIdx}, ${locIdx}, null)" title="Agregar PC"></i>
                        <i class="fas fa-cog" onclick="openSedeModal(${areaIdx}, ${locIdx})" title="Configurar Sede"></i>
                    </div>
                </div>
            `;

            // Grid de Computadoras
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
                    <div class="comp-info">
                        <span class="comp-name">${comp.name}</span>
                        <span class="comp-host">${comp.hostname}</span>
                    </div>
                `;
                grid.appendChild(item);
            });

            locCard.appendChild(grid);
            areaCol.appendChild(locCard);
        });

        // Botón Agregar Sede
        const btnAddSede = document.createElement("button");
        btnAddSede.innerText = "+ Nueva Sede";
        btnAddSede.style.cssText = "background:transparent; border:2px dashed var(--border-color); color:var(--text-secondary); width:100%; padding:10px; cursor:pointer;";
        btnAddSede.onclick = () => openSedeModal(areaIdx, null);
        areaCol.appendChild(btnAddSede);

        container.appendChild(areaCol);
    });
}

// --- MODAL EQUIPOS ---
const modalComp = document.getElementById("modal-comp");
const formComp = document.getElementById("computer-form");

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
            // Preservar ID si es edición
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

// --- MODAL SEDES ---
const modalSede = document.getElementById("modal-sede");
const formSede = document.getElementById("sede-form");

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

// Utilidad para cerrar modales
function closeModal(id) {
    document.getElementById(id).style.display = "none";
}


// ==========================================
//  PARTE 2: USUARIOS (AZURE SQL)
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
            tr.innerHTML = `
                <td>${u.id}</td>
                <td>${u.usuario}</td>
                <td>${u.nombre}</td>
                <td><button class="btn-delete" style="padding:5px 10px;" onclick="deleteUser(${u.id})">Eliminar</button></td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) { console.error("Error usuarios", e); }
}

function openUserModal() {
    const m = document.getElementById('modal-user');
    if (m) m.style.display = 'block';
}

const formUser = document.getElementById('user-form');
if (formUser) {
    formUser.onsubmit = async (e) => {
        e.preventDefault();
        const usuario = document.getElementById('u-user').value;
        const password = document.getElementById('u-pass').value;
        const nombre = document.getElementById('u-name').value;

        const res = await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario, password, nombre })
        });

        if (res.ok) {
            closeModal('modal-user');
            formUser.reset();
            loadUsers();
            alert('Usuario creado');
        } else {
            alert('Error al crear usuario');
        }
    };
}

async function deleteUser(id) {
    if (confirm('¿Borrar usuario?')) {
        await fetch(`/api/users/${id}`, { method: 'DELETE' });
        loadUsers();
    }
}


// ==========================================
//  PARTE 3: TEMA CLARO/OSCURO
// ==========================================
function toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    const target = current === 'light' ? 'dark' : 'light';
    html.setAttribute('data-theme', target);
    localStorage.setItem('theme', target);
    updateIcon(target);
}

function updateIcon(theme) {
    const icon = document.getElementById('theme-icon');
    if (!icon) return;
    if (theme === 'light') {
        icon.classList.remove('fa-sun');
        icon.classList.add('fa-moon');
    } else {
        icon.classList.remove('fa-moon');
        icon.classList.add('fa-sun');
    }
}