let appData = null;
let reportPage = 1;
let reportFilters = {};
let reportDebounceTimer;

// Variables Modales
let currentSedeIdForComp = null;
let currentCompId = null;
let currentAreaIdForSede = null;
let currentSedeId = null;

//variables globales
let prodPage = 1;
let GLOBAL_IGV_PCT = 18;
let GLOBAL_IGVV_PCT = 10;

//variables reporte cargos caja
let reportCargosPage = 1;
let reportCargosFilters = {};
let reportCargosDebounceTimer;

// ==========================================
//  INICIO
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateIcon(savedTheme);

    const today = new Date().toISOString().split('T')[0];
    document.querySelectorAll('input[type="date"]').forEach(input => input.value = today);

    // Año reporte
    const yearSelect = document.getElementById('rep-anio');
    if (yearSelect) {
        const currentYear = new Date().getFullYear();
        for (let i = 0; i < 5; i++) {
            const opt = document.createElement('option');
            opt.value = currentYear - i; opt.innerText = currentYear - i;
            yearSelect.appendChild(opt);
        }
    }

    // Llenar select año Cargos Caja
    const yearSelectC = document.getElementById('repc-anio');
    if (yearSelectC) {
        const currentYear = new Date().getFullYear();
        for (let i = 0; i < 5; i++) {
            const opt = document.createElement('option');
            opt.value = currentYear - i; opt.innerText = currentYear - i;
            yearSelectC.appendChild(opt);
        }
    }

    try {
        const res = await fetch('/api/session');
        if (!res.ok) window.location.href = '/login.html';
        else {
            const data = await res.json();
            const user = data.user;
            aplicarPermisos(user.permisos);
            if (user.permisos.includes('equipos')) fetchData();
            if (user.permisos.includes('usuarios')) { loadUsers(); loadRolesSelect(); }
            if (user.permisos.includes('reportes')) {
                cargarReporte(1);       // Carga reporte de Insumos (existente)
                cargarEmpresasReporte(); // NUEVO: Carga el combo y luego el reporte de Cargos
            }
        }
    } catch (e) { window.location.href = '/login.html'; }

    // Eventos Filtros Reporte
    document.querySelectorAll('.col-filter').forEach(input => {
        input.addEventListener('keyup', (e) => {
            clearTimeout(reportDebounceTimer);
            reportFilters[e.target.dataset.col] = e.target.value;
            reportDebounceTimer = setTimeout(() => cargarReporte(1), 500);
        });
    });

    // Listener Filtros Cargos Caja
    document.querySelectorAll('.col-filter-cargos').forEach(input => {
        input.addEventListener('keyup', (e) => {
            clearTimeout(reportCargosDebounceTimer);
            reportCargosFilters[e.target.dataset.col] = e.target.value;
            reportCargosDebounceTimer = setTimeout(() => cargarReporteCargos(1), 500);
        });
    });

});

// ==========================================
//  NAVEGACIÓN
// ==========================================
function aplicarPermisos(permisos) {
    const menuItems = document.querySelectorAll('.sidebar li[data-module]');
    menuItems.forEach(item => item.style.display = 'none');

    // Mapeo manual para asegurar compatibilidad
    // Si usaste data-module en el HTML anterior, esto funciona directo.
    // Si no, agregamos un fallback simple por nombres
    const permisosUsuario = permisos || [];
    menuItems.forEach(item => {
        const mod = item.getAttribute('data-module');
        if (permisosUsuario.includes(mod)) item.style.display = 'block';
    });
}

// ==========================================
//  NAVEGACIÓN (ACTUALIZADA PARA SUBMENÚS)
// ==========================================
function showView(viewName) {
    // 1. Ocultar todas las vistas
    const views = ['view-equipos', 'view-usuarios', 'view-precios', 'view-revision', 'view-reportes-salida', 'view-reportes-cargos', 'view-prod-almacen'];
    views.forEach(v => {
        const el = document.getElementById(v);
        if (el) el.style.display = 'none';
    });

    // 2. Resetear 'active' de todos los items del menú (padres e hijos)
    document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active'));

    // 3. Mostrar vista deseada
    const target = document.getElementById(`view-${viewName}`);
    if (target) {
        target.style.display = 'block';

        // LOGICA ESPECIFICA DE CARGA
        if (viewName === 'prod-almacen') buscarProductos();
    }

    // 4. Activar visualmente el ítem del menú correspondiente
    // Buscamos el LI que tiene el onclick exacto que acabamos de llamar
    const activeLink = document.querySelector(`.sidebar li[onclick="showView('${viewName}')"]`);

    if (activeLink) {
        // Activamos el item
        activeLink.classList.add('active');

        // Si el item está dentro de un submenú, abrimos el padre
        const parentUl = activeLink.closest('ul.submenu');
        if (parentUl) {
            parentUl.classList.add('open');
            // Rotamos la flecha del padre
            const parentLi = parentUl.parentElement;
            const arrow = parentLi.querySelector('.arrow-icon');
            if (arrow) arrow.style.transform = 'rotate(180deg)';
        }
    }
}

function toggleSubmenu(element) {
    const submenu = element.nextElementSibling;
    const arrow = element.querySelector('.arrow-icon');
    submenu.classList.toggle('open');
    if (arrow) arrow.style.transform = submenu.classList.contains('open') ? 'rotate(180deg)' : 'rotate(0deg)';
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');
    const isMobile = window.innerWidth <= 1024;
    if (isMobile) { sidebar.classList.toggle('open'); overlay.classList.toggle('active'); }
    else {
        sidebar.classList.toggle('collapsed');
        const icon = document.querySelector('.toggle-btn i');
        if (sidebar.classList.contains('collapsed')) { icon.classList.remove('fa-bars'); icon.classList.add('fa-arrow-right'); }
        else { icon.classList.remove('fa-arrow-right'); icon.classList.add('fa-bars'); }
    }
}
window.addEventListener('resize', () => {
    if (window.innerWidth > 1024) {
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('mobile-overlay').classList.remove('active');
    }
});
async function logout() { await fetch('/api/logout', { method: 'POST' }); window.location.href = '/login.html'; }
function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const target = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', target);
    localStorage.setItem('theme', target);
    updateIcon(target);
}
function updateIcon(theme) {
    const icon = document.getElementById('theme-icon');
    if (icon) icon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
}
function closeModal(id) { document.getElementById(id).style.display = "none"; }

// ==========================================
//  MÓDULO: PRODUCTOS ALMACÉN (CRUD)
// ==========================================
async function cargarListasProductos() {
    /*
    if (document.getElementById('p-linea').options.length > 1) return;
    try {
        const res = await fetch('/api/productos/listas');
        const data = await res.json();
        llenarSelect('p-linea', data.lineas, 'CodLinea', 'Descripcion');
        llenarSelect('p-proveedor', data.proveedores, 'CodProv', 'Razon');
        llenarSelect('p-unimed', data.unidades, 'n_numero', 'c_describe');
        llenarSelect('p-tipo', data.tipos, 'id', 'nombre');
    } catch (e) { console.error(e); }*/
    try {
        const res = await fetch('/api/productos/listas');
        const data = await res.json();

        // Llenar selects
        llenarSelect('p-linea', data.lineas, 'CodLinea', 'Descripcion');
        llenarSelect('p-proveedor', data.proveedores, 'CodProv', 'Razon');
        llenarSelect('p-unimed', data.unidades, 'n_numero', 'c_describe');
        llenarSelect('p-tipo', data.tipos, 'id', 'nombre');

        // --- NUEVO: LEER VALORES DE TABLA ---
        if (data.valores) {
            const valIgv = data.valores.find(v => v.c_valor.trim() === 'Igv');
            const valIgvv = data.valores.find(v => v.c_valor.trim() === 'Igvv');

            if (valIgv) GLOBAL_IGV_PCT = valIgv.n_valor;
            if (valIgvv) GLOBAL_IGVV_PCT = valIgvv.n_valor;

            console.log("Valores cargados:", GLOBAL_IGV_PCT, GLOBAL_IGVV_PCT);
        }

    } catch (e) { console.error(e); }
}

function llenarSelect(id, lista, valKey, textKey) {
    const sel = document.getElementById(id);
    sel.innerHTML = '<option value="" disabled selected>Seleccione</option>';
    lista.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item[valKey]; opt.innerText = item[textKey];
        sel.appendChild(opt);
    });
}
async function cargarClases(codLinea, selectedClase = null) {
    const sel = document.getElementById('p-clase');
    sel.innerHTML = '<option>Cargando...</option>';
    try {
        const res = await fetch(`/api/productos/clases/${codLinea}`);
        const data = await res.json();
        sel.innerHTML = '<option value="" disabled selected>Seleccione</option>';
        data.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.CodClase; opt.innerText = item.Descripcion;
            sel.appendChild(opt);
        });
        if (selectedClase) sel.value = selectedClase;
    } catch (e) { console.error(e); }
}
async function generarCodigoProducto() {
    const empresa = document.getElementById('p-empresa-gen').value;
    if (!empresa) return;
    if (document.getElementById('p-codigo').readOnly && document.getElementById('p-codigo').value !== '') {
        if (document.getElementById('modal-producto-title').innerText.includes('Editar')) return;
    }
    try {
        const res = await fetch(`/api/productos/nuevo-codigo/${empresa}`);
        const data = await res.json();
        document.getElementById('p-codigo').value = data.codigo;
    } catch (e) { console.error(e); }
}
const IGV_FACTOR = 1.18;

function calcularPrecios() {
    /*
    const costo = parseFloat(document.getElementById('p-costo').value) || 0;
    const afecto = document.getElementById('p-afecto').checked;
    let costoReal = costo;
    if (afecto) costoReal = costo * IGV_FACTOR;
    document.getElementById('p-costoreal').value = costoReal.toFixed(2);*/

    // Ahora el usuario ingresa el COSTO REAL (Con IGV)
    const costoReal = parseFloat(document.getElementById('p-costoreal').value) || 0;
    const afecto = document.getElementById('p-afecto').checked;

    let costoSinIgv = costoReal;

    if (afecto) {
        // Fórmula: Base = Total / (1 + (Porcentaje/100))
        const factor = 1 + (GLOBAL_IGV_PCT / 100);
        costoSinIgv = costoReal / factor;
    }

    // Llenamos el input readonly P. Costo
    document.getElementById('p-costo').value = costoSinIgv.toFixed(2);
}

function calcularVenta() {
    // El usuario ingresa PRECIO FINAL
    const precioFinal = parseFloat(document.getElementById('p-preciofinal').value) || 0;
    const afecto = document.getElementById('p-afecto').checked;

    let valorVenta = precioFinal;

    // Regla: Siempre dividir entre 1.10 para hallar el valor de venta base
    // Usamos la constante 1.10 directamente o la variable global si prefieres
    // Como pediste explícitamente 1.10 (10%), usaremos esa lógica dura o la variable GLOBAL_IGVV_PCT.

    if (afecto) {
        // Usamos la variable global cargada de la BD (que debería ser 10)
        // Factor = 1 + (10 / 100) = 1.10
        const factor = 1 + (GLOBAL_IGVV_PCT / 100);
        valorVenta = precioFinal / factor;
    }

    document.getElementById('p-pventa').value = valorVenta.toFixed(2);
}

// 5. CRUD: Buscar y Listar (BLINDADO Y CORREGIDO PAGINACIÓN)
async function buscarProductos(resetPage = false) {
    // CORRECCIÓN: Usamos 'prodPage' en lugar de 'productPage'
    if (resetPage) prodPage = 1;

    const inputSearch = document.getElementById('prod-search');
    const selectEmpresa = document.getElementById('prod-filter-empresa');

    if (!selectEmpresa) return;

    let empresa = selectEmpresa.value;

    if (!empresa || empresa === "") {
        if (selectEmpresa.options.length > 0) {
            empresa = selectEmpresa.options[0].value;
            selectEmpresa.value = empresa;
        } else {
            empresa = "02";
        }
    }

    const q = inputSearch ? inputSearch.value.trim() : '';

    const tbody = document.querySelector('#productos-table tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center">Cargando...</td></tr>';

    try {
        // CORRECCIÓN: Usamos 'prodPage' en la URL
        const url = `/api/productos/buscar?q=${encodeURIComponent(q)}&empresa=${encodeURIComponent(empresa)}&page=${prodPage}`;

        const res = await fetch(url);

        if (!res.ok) throw new Error('Error en petición');
        const data = await res.json();

        if (tbody) {
            tbody.innerHTML = '';
            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center">No se encontraron productos</td></tr>';
                return;
            }

            data.forEach(p => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${p.CodPro}</td>
                    <td>${p.Nombre}</td>
                    <td>${p.Linea || '-'}</td>
                    <td>${p.Stock}</td>
                    <td>${p.Costo.toFixed(2)}</td>
                    <td>${p.PventaMa ? p.PventaMa.toFixed(2) : '0.00'}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn-update btn-sm" onclick='abrirModalProducto("${p.CodPro}")'><i class="fas fa-edit"></i></button>
                            <button class="btn-delete btn-sm" onclick="eliminarProducto('${p.CodPro}')"><i class="fas fa-trash"></i></button>
                        </div>
                    </td>`;
                tbody.appendChild(tr);
            });
        }

        // CORRECCIÓN: Usamos 'prodPage' para actualizar el texto
        const pageInfo = document.getElementById('prod-page-info');
        if (pageInfo) pageInfo.innerText = `Pág ${prodPage}`;

    } catch (e) {
        console.error(e);
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="color:var(--red-status); text-align:center">Error de servidor</td></tr>';
    }
}

async function abrirModalProducto(codPro) {
    const modal = document.getElementById('modal-producto');
    const form = document.getElementById('form-producto');
    const title = document.querySelector('#modal-producto h2');
    if (!title.id) title.id = 'modal-producto-title';
    await cargarListasProductos();

    if (codPro) {
        document.getElementById('modal-producto-title').innerText = "Editar Producto";
        document.getElementById('p-empresa-gen').disabled = true;
        try {
            const res = await fetch(`/api/productos/${codPro}`);
            const p = await res.json();
            document.getElementById('p-codigo').value = p.CodPro;
            document.getElementById('p-codbar').value = p.CodBar || '';
            document.getElementById('p-nombre').value = p.Nombre;
            document.getElementById('p-linea').value = p.Clinea;
            await cargarClases(p.Clinea, p.Clase);
            document.getElementById('p-proveedor').value = p.CodProv;
            document.getElementById('p-peso').value = p.Peso;
            document.getElementById('p-stock').value = p.Stock;
            document.getElementById('p-afecto').checked = p.Afecto;
            document.getElementById('p-tipo').value = p.Tipo;
            document.getElementById('p-unimed').value = p.Unimed;
            document.getElementById('p-costo').value = p.Costo;
            document.getElementById('p-costoreal').value = p.CosReal ? p.CosReal.toFixed(2) : '0.00';
            // Lógica inversa: La BD tiene el Valor Venta Base (PventaMa)
            // Queremos mostrar el Precio Final (Base * 1.10)
            let baseVentaBD = p.PventaMa !== null && p.PventaMa !== undefined ? p.PventaMa : 0;
            let precioFinalCalc = baseVentaBD;

            if (p.Afecto) {
                // Si es afecto, multiplicamos por 1.10 para mostrar el precio final
                const factor = 1 + (GLOBAL_IGVV_PCT / 100);
                precioFinalCalc = baseVentaBD * factor;
            }

            document.getElementById('p-preciofinal').value = parseFloat(precioFinalCalc).toFixed(2);

            document.getElementById('p-tempmax').value = p.TemMax;
            document.getElementById('p-tempmin').value = p.TemMin;
            document.getElementById('p-comision').value = p.Comision || 0;
            lockComision(); // Siempre inicia bloqueado al abrir
            calcularPrecios(); calcularVenta();
        } catch (e) { alert("Error al cargar datos"); return; }
    } else {
        document.getElementById('p-comision').value = "0";
        lockComision(); // Función helper que crearemos abajo
        document.getElementById('modal-producto-title').innerText = "Nuevo Producto";
        form.reset();
        document.getElementById('p-codigo').value = '';
        document.getElementById('p-empresa-gen').disabled = false;
        document.getElementById('p-empresa-gen').value = "";
        document.getElementById('p-clase').innerHTML = '';
    }
    modal.style.display = 'block';
}

if (document.getElementById('form-producto')) {
    document.getElementById('form-producto').onsubmit = async (e) => {
        e.preventDefault();
        if (!confirm("¿Está seguro de guardar este producto?")) return;
        const data = {
            isNew: !document.getElementById('p-empresa-gen').disabled,
            CodPro: document.getElementById('p-codigo').value,
            CodBar: document.getElementById('p-codbar').value,
            Nombre: document.getElementById('p-nombre').value,
            Clinea: document.getElementById('p-linea').value,
            Clase: document.getElementById('p-clase').value,
            CodProv: document.getElementById('p-proveedor').value,
            Peso: document.getElementById('p-peso').value,
            Stock: document.getElementById('p-stock').value,
            Afecto: document.getElementById('p-afecto').checked,
            Tipo: document.getElementById('p-tipo').value,
            Unimed: document.getElementById('p-unimed').value,
            Comision: document.getElementById('p-comision').value,
            Costo: document.getElementById('p-costo').value,
            PventaMa: document.getElementById('p-preciofinal').value,
            PventaMi: 0,
            TemMax: document.getElementById('p-tempmax').value,
            TemMin: document.getElementById('p-tempmin').value,
            CosReal: document.getElementById('p-costoreal').value
        };
        try {
            const res = await fetch('/api/productos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            if (res.ok) { closeModal('modal-producto'); buscarProductos(); alert("Guardado"); } else alert("Error al guardar");
        } catch (e) { alert("Error de conexión"); }
    };
}

async function eliminarProducto(id) {
    if (!confirm("¿Eliminar este producto?")) return;
    try { const res = await fetch(`/api/productos/${id}`, { method: 'DELETE' }); if (res.ok) buscarProductos(); else alert("Error"); } catch (e) { console.error(e); }
}

// NUEVA FUNCION: Control de botones Siguiente/Anterior (CORREGIDA)
function cambiarPaginaProducto(delta) {
    // CORRECCIÓN: Usamos 'prodPage' consistentemente
    const newPage = prodPage + delta;
    if (newPage >= 1) {
        prodPage = newPage;
        buscarProductos(false); // false para no resetear a la 1
    }
}

// ==========================================
//  RESTO DE MODULOS (EQUIPOS, PRECIOS, NUBE...)
// ==========================================
// (MANTENEMOS EL CÓDIGO EXISTENTE, PEGADO A CONTINUACIÓN PARA QUE ESTÉ COMPLETO)

async function fetchData() {
    try { const response = await fetch('/api/structure'); if (!response.ok) return; const data = await response.json(); appData = data; renderDashboard(); } catch (error) { console.error(error); }
}
function renderDashboard() {
    const container = document.getElementById("dashboard"); if (!container || !appData) return; container.innerHTML = "";
    appData.areas.forEach((area) => {
        const areaCol = document.createElement("div"); areaCol.className = "area-column";
        const areaTitle = document.createElement("div"); areaTitle.className = "area-title"; areaTitle.innerText = area.name; areaCol.appendChild(areaTitle);
        area.locations.forEach((loc) => {
            const locCard = document.createElement("div"); locCard.className = "location-card";
            locCard.innerHTML = `<div class="location-header-top"><span class="location-name">${loc.name}</span><div class="sede-actions"><i class="fas fa-plus" onclick="openCompModal(${loc.id}, null)" title="Agregar PC"></i><i class="fas fa-cog" onclick="openSedeModal(${area.id}, ${loc.id}, '${loc.name}')" title="Configurar Sede"></i></div></div>`;
            const grid = document.createElement("div"); grid.className = "computer-grid";
            loc.computers.forEach((comp) => {
                const item = document.createElement("div"); item.className = "computer-item"; item.onclick = () => openCompModal(loc.id, comp);
                const iconClass = comp.type === 'server' ? 'fa-server' : 'fa-desktop'; const statusClass = comp.status ? 'status-true' : 'status-false';
                item.innerHTML = `<div class="icon-wrapper"><i class="fas ${iconClass}"></i></div><div class="status-indicator ${statusClass}"><span class="dot"></span></div><div class="comp-info"><span class="comp-name">${comp.name}</span><span class="comp-host">${comp.hostname}</span></div>`;
                grid.appendChild(item);
            });
            locCard.appendChild(grid); areaCol.appendChild(locCard);
        });
        const btnAddSede = document.createElement("button"); btnAddSede.innerText = "+ Nueva Sede"; btnAddSede.style.cssText = "background:transparent; border:2px dashed var(--border-color); color:var(--text-secondary); width:100%; padding:10px; cursor:pointer;";
        btnAddSede.onclick = () => openSedeModal(area.id, null, ''); areaCol.appendChild(btnAddSede); container.appendChild(areaCol);
    });
}

// --- MODALES Y LOGICA CRUD EQUIPOS ---
const modalComp = document.getElementById("modal-comp");
const modalSede = document.getElementById("modal-sede");

function openCompModal(sedeId, compObj) {
    modalComp.style.display = "block";
    currentSedeIdForComp = sedeId;

    // Referencia segura al título
    const titleEl = document.getElementById("modal-comp-title");
    const deleteBtn = document.getElementById("btn-delete-comp");

    if (compObj) {
        // MODO EDITAR
        currentCompId = compObj.id;

        // Si existe el elemento título, lo actualizamos. Si no, no pasa nada.
        if (titleEl) titleEl.innerText = "Editar Equipo";

        // Llenado de datos (Con validación por si vienen vacíos)
        document.getElementById("comp-name").value = compObj.name || '';
        document.getElementById("comp-hostname").value = compObj.hostname || '';
        document.getElementById("comp-type").value = compObj.type || 'desktop';
        document.getElementById("comp-status").checked = compObj.status; // true/false

        if (deleteBtn) {
            deleteBtn.style.display = "block";
            deleteBtn.onclick = () => deleteComputer(currentCompId);
        }
    } else {
        // MODO NUEVO
        currentCompId = null;
        if (titleEl) titleEl.innerText = "Nuevo Equipo";

        document.getElementById("computer-form").reset();
        document.getElementById("comp-type").value = "desktop";
        document.getElementById("comp-status").checked = true;

        if (deleteBtn) deleteBtn.style.display = "none";
    }
}

if (document.getElementById("computer-form")) {
    document.getElementById("computer-form").onsubmit = async (e) => { e.preventDefault(); const data = { name: document.getElementById("comp-name").value, hostname: document.getElementById("comp-hostname").value, type: document.getElementById("comp-type").value, status: document.getElementById("comp-status").checked, sede_id: currentSedeIdForComp }; let url = '/api/equipos'; let method = 'POST'; if (currentCompId) { url = `/api/equipos/${currentCompId}`; method = 'PUT'; } await fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); document.getElementById("modal-comp").style.display = "none"; fetchData(); };
}
async function deleteComputer(id) { if (confirm("¿Eliminar equipo?")) { await fetch(`/api/equipos/${id}`, { method: 'DELETE' }); document.getElementById("modal-comp").style.display = "none"; fetchData(); } }
function openSedeModal(areaId, sedeId, sedeName) {
    const modalSede = document.getElementById("modal-sede");
    modalSede.style.display = "block"; currentAreaIdForSede = areaId; currentSedeId = sedeId;
    const title = document.getElementById("modal-sede-title"); const nameInput = document.getElementById("sede-name"); const delBtn = document.getElementById("btn-delete-sede");
    if (sedeId) { title.innerText = "Editar Sede"; nameInput.value = sedeName; delBtn.style.display = "block"; delBtn.onclick = () => deleteSede(sedeId); } else { title.innerText = "Nueva Sede"; nameInput.value = ""; delBtn.style.display = "none"; }
}
if (document.getElementById("sede-form")) {
    document.getElementById("sede-form").onsubmit = async (e) => { e.preventDefault(); const name = document.getElementById("sede-name").value; let url = '/api/sedes'; let method = 'POST'; let body = { name: name, area_id: currentAreaIdForSede }; if (currentSedeId) { url = `/api/sedes/${currentSedeId}`; method = 'PUT'; body = { name: name }; } await fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); document.getElementById("modal-sede").style.display = "none"; fetchData(); };
}
async function deleteSede(id) { if (confirm("¿Eliminar sede?")) { await fetch(`/api/sedes/${id}`, { method: 'DELETE' }); document.getElementById("modal-sede").style.display = "none"; fetchData(); } }

async function loadUsers() {
    try { const res = await fetch('/api/users'); if (!res.ok) return; const users = await res.json(); const tbody = document.querySelector('#users-table tbody'); if (!tbody) return; tbody.innerHTML = ''; users.forEach(u => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${u.id}</td><td>${u.usuario}</td><td>${u.nombre}</td><td><span style="background:var(--accent); color:white; padding:2px 6px; border-radius:4px; font-size:0.8rem;">${u.rol || 'N/A'}</span></td><td><button class="btn-delete" style="padding:5px 10px;" onclick="deleteUser(${u.id})">Eliminar</button></td>`; tbody.appendChild(tr); }); } catch (e) { console.error(e); }
}
async function loadRolesSelect() { try { const res = await fetch('/api/roles'); if (!res.ok) return; const roles = await res.json(); const select = document.getElementById('u-rol'); if (!select) return; select.innerHTML = ''; roles.forEach(r => { const opt = document.createElement('option'); opt.value = r.id; opt.innerText = r.nombre; select.appendChild(opt); }); } catch (e) { console.error(e); } }
function openUserModal() { document.getElementById('modal-user').style.display = 'block'; }
if (document.getElementById('user-form')) {
    document.getElementById('user-form').onsubmit = async (e) => { e.preventDefault(); const usuario = document.getElementById('u-user').value; const password = document.getElementById('u-pass').value; const nombre = document.getElementById('u-name').value; const rol_id = document.getElementById('u-rol').value; const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario, password, nombre, rol_id }) }); if (res.ok) { document.getElementById('modal-user').style.display = "none"; document.getElementById('user-form').reset(); loadUsers(); alert('Usuario creado'); } else { alert('Error'); } };
}
async function deleteUser(id) { if (confirm('¿Borrar?')) { await fetch(`/api/users/${id}`, { method: 'DELETE' }); loadUsers(); } }

async function cargarProductosPrecios() {
    const empresa = document.getElementById('empresa-select').value; const tbody = document.querySelector('#precios-table tbody'); tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Cargando...</td></tr>';
    try { const res = await fetch(`/api/precios/${empresa}`); if (!res.ok) throw new Error('Error'); const productos = await res.json(); renderTablaPrecios(productos); } catch (error) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--red-status);">Error</td></tr>'; }
}
function renderTablaPrecios(lista) {
    const tbody = document.querySelector('#precios-table tbody'); tbody.innerHTML = ''; if (lista.length === 0) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No se encontraron productos</td></tr>'; return; }
    lista.forEach(p => { const tr = document.createElement('tr'); const p1 = (p.PreTema1 || 0).toFixed(4); const p2 = (p.PreTema2 || 0).toFixed(4); const p3 = (p.PreTema3 || 0).toFixed(4); const p4 = (p.PreTema4 || 0).toFixed(4); const p5 = (p.PreTema5 || 0).toFixed(4); const p6 = (p.PreTema6 || 0).toFixed(4); tr.innerHTML = `<td><span style="font-weight:bold; font-size:0.85rem; color:var(--text-secondary)">${p.CodPro}</span><br>${p.Nombre}</td><td><input type="number" step="0.0001" class="price-input" id="p1-${p.CodPro}" value="${p1}"></td><td><input type="number" step="0.0001" class="price-input" id="p2-${p.CodPro}" value="${p2}"></td><td><input type="number" step="0.0001" class="price-input" id="p3-${p.CodPro}" value="${p3}"></td><td><input type="number" step="0.0001" class="price-input" id="p4-${p.CodPro}" value="${p4}"></td><td><input type="number" step="0.0001" class="price-input" id="p5-${p.CodPro}" value="${p5}"></td><td><input type="number" step="0.0001" class="price-input" id="p6-${p.CodPro}" value="${p6}"></td><td><button class="btn-update" onclick="guardarPrecio('${p.CodPro}')"><i class="fas fa-save"></i></button></td>`; tbody.appendChild(tr); });
}
function filtrarTablaPrecios() { const texto = document.getElementById('search-product').value.toLowerCase().trim(); const filas = document.querySelectorAll('#precios-table tbody tr'); filas.forEach(fila => { const celda = fila.cells[0]; if (celda) { const contenido = celda.textContent || celda.innerText; fila.style.display = contenido.toLowerCase().includes(texto) ? '' : 'none'; } }); }
async function guardarPrecio(codPro) { const p1 = document.getElementById(`p1-${codPro}`).value; const p2 = document.getElementById(`p2-${codPro}`).value; const p3 = document.getElementById(`p3-${codPro}`).value; const p4 = document.getElementById(`p4-${codPro}`).value; const p5 = document.getElementById(`p5-${codPro}`).value; const p6 = document.getElementById(`p6-${codPro}`).value; const btn = event.currentTarget; const icono = btn.querySelector('i'); icono.className = "fas fa-spinner fa-spin"; try { const res = await fetch(`/api/precios/${codPro}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p1, p2, p3, p4, p5, p6 }) }); if (res.ok) { icono.className = "fas fa-check"; btn.style.backgroundColor = "var(--green-status)"; setTimeout(() => { icono.className = "fas fa-save"; btn.style.backgroundColor = "var(--accent)"; }, 1500); } else { alert("Error"); icono.className = "fas fa-save"; } } catch (e) { alert("Error"); icono.className = "fas fa-save"; } }

async function consultarRevision() {
    const empresa = document.getElementById('rev-empresa').value; const turno = document.getElementById('rev-turno').value; const inicio = document.getElementById('rev-inicio').value; const fin = document.getElementById('rev-fin').value; const grid = document.getElementById('revision-grid'); grid.innerHTML = '<div style="width:100%; text-align:center;"><i class="fas fa-spinner fa-spin fa-3x"></i><br>Consultando...</div>';
    try { const res = await fetch('/api/revision-nube', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ empresa, turno, fechaInicio: inicio, fechaFin: fin }) }); if (!res.ok) throw new Error('Error'); const data = await res.json(); renderRevisionCards(data); } catch (error) { grid.innerHTML = '<div style="color:var(--red-status); text-align:center;">Error</div>'; }
}
function renderRevisionCards(data) { const grid = document.getElementById('revision-grid'); grid.innerHTML = ''; const tables = [{ key: 'doccab', title: 'Doccab' }, { key: 'docdet', title: 'Docdet' }, { key: 'ticket_c', title: 'Ticket_C' }, { key: 'ticket_d', title: 'Ticket_D' }, { key: 'pagos', title: 'Pagos Tickets' }, { key: 'caja', title: 'Caja' }]; tables.forEach(t => { const info = data[t.key] || { Total: 0 }; const hasData = info.Total > 0; const card = document.createElement('div'); card.className = 'status-card'; let contentHTML = ''; if (hasData) { contentHTML = `<div class="card-data"><div class="data-row"><span>INICIO:</span> ${info.First}</div><div class="data-row"><span>FIN:</span> ${info.Last}</div><div class="total-row">REGISTROS: ${info.Total} FILAS</div></div>`; } else { contentHTML = `<div class="no-data-state"><i class="fas fa-exclamation-triangle"></i><span class="no-data-text">NO HAY REGISTROS</span><i class="fas fa-person-walking"></i></div>`; } card.innerHTML = `<div class="card-header"><span class="table-name">${t.title}</span><div class="traffic-light ${hasData ? 'light-green' : 'light-red'}"></div></div>${contentHTML}`; grid.appendChild(card); }); }

async function cargarReporte(page) { reportPage = page; const empresa = document.getElementById('rep-empresa').value; const year = document.getElementById('rep-anio').value; const month = document.getElementById('rep-mes').value; const tbody = document.querySelector('#report-table tbody'); tbody.innerHTML = '<tr><td colspan="9" style="text-align:center">Cargando...</td></tr>'; try { const res = await fetch('/api/reports/salida-insumos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ empresa, year, month, filters: reportFilters, page, pageSize: 50 }) }); if (!res.ok) throw new Error('Error'); const { data, totals } = await res.json(); document.getElementById('sum-registros').innerText = totals.TotalRegistros || 0; document.getElementById('sum-cantidad').innerText = totals.SumCantidad ? totals.SumCantidad.toFixed(2) : 0; document.getElementById('sum-costo').innerText = totals.SumCosto ? totals.SumCosto.toFixed(2) : 0; tbody.innerHTML = ''; if (data.length === 0) { tbody.innerHTML = '<tr><td colspan="9" style="text-align:center">No hay datos</td></tr>'; return; } data.forEach(row => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${row.Linea}</td><td>${row.Documento}</td><td>${row.Fecha}</td><td>${row.Almacen}</td><td>${row.codpro}</td><td>${row.Nombre}</td><td>${row.Razon}</td><td>${row.Cantidad}</td><td>${row.Costo}</td>`; tbody.appendChild(tr); }); document.getElementById('page-info').innerText = `Pág ${page}`; } catch (error) { tbody.innerHTML = '<tr><td colspan="9" style="color:red; text-align:center">Error</td></tr>'; } }
function cambiarPagina(delta) { const newPage = reportPage + delta; if (newPage >= 1) cargarReporte(newPage); }
function limpiarFiltrosReporte() { reportFilters = {}; document.querySelectorAll('.col-filter').forEach(i => i.value = ''); cargarReporte(1); }
async function exportarExcel() { const empresa = document.getElementById('rep-empresa').value; const year = document.getElementById('rep-anio').value; const month = document.getElementById('rep-mes').value; const btn = event.currentTarget; const original = btn.innerHTML; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; btn.disabled = true; try { const res = await fetch('/api/reports/salida-insumos/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ empresa, year, month, filters: reportFilters }) }); if (res.ok) { const blob = await res.blob(); const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `Reporte_${empresa}.xlsx`; document.body.appendChild(a); a.click(); a.remove(); } else { alert('Error'); } } catch (e) { alert('Error'); } finally { btn.innerHTML = original; btn.disabled = false; } }

// ==========================================
//  SEGURIDAD Y DESBLOQUEO (NUEVO)
// ==========================================
function abrirModalPassword(tipo) {
    const modal = document.getElementById('modal-password');
    const input = document.getElementById('pass-input');

    document.getElementById('pass-type').value = tipo;
    input.value = '';
    modal.style.display = 'block';

    // Enfocar input automáticamente
    setTimeout(() => input.focus(), 100);
}

// Validar contraseña
if (document.getElementById('form-validate-pass')) {
    document.getElementById('form-validate-pass').onsubmit = async (e) => {
        e.preventDefault();
        const tipo = document.getElementById('pass-type').value;
        const clave = document.getElementById('pass-input').value;

        try {
            const res = await fetch('/api/validate-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clave, tipo })
            });

            const data = await res.json();

            if (data.success) {
                closeModal('modal-password');

                // Acciones específicas según qué desbloqueamos
                if (tipo === 'COMISION') {
                    const inputCom = document.getElementById('p-comision');
                    inputCom.readOnly = false;
                    inputCom.style.background = 'var(--input-bg)'; // Color normal
                    inputCom.focus();
                    inputCom.select();
                }
            } else {
                alert(data.message || 'Clave incorrecta');
            }
        } catch (error) {
            console.error(error);
            alert('Error de conexión');
        }
    };
}

function lockComision() {
    const input = document.getElementById('p-comision');
    if (input) {
        input.readOnly = true;
        input.style.background = 'var(--input-readonly-bg)'; // Usamos la variable CSS que creamos antes
    }
}

// ==========================================
//  REPORTE: CARGOS DE CAJA
// ==========================================
async function cargarReporteCargos(page) {
    reportCargosPage = page;
    const empresa = document.getElementById('repc-empresa').value;
    const year = document.getElementById('repc-anio').value;
    const month = document.getElementById('repc-mes').value;
    const turno = document.getElementById('repc-turno').value;
    const tbody = document.querySelector('#report-cargos-table tbody');

    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center">Cargando...</td></tr>';

    try {
        const res = await fetch('/api/reports/cargos-caja', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ empresa, year, month, turno, filters: reportCargosFilters, page, pageSize: 50 })
        });

        if (!res.ok) throw new Error('Error datos');
        const { data, totals } = await res.json();

        // Totales
        document.getElementById('sumc-registros').innerText = totals.TotalRegistros || 0;
        document.getElementById('sumc-monto').innerText = totals.SumMonto ? totals.SumMonto.toFixed(2) : '0.00';

        // Tabla
        tbody.innerHTML = '';
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center">No hay datos</td></tr>';
            return;
        }

        data.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${row.Razon}</td>
                <td>${row.Fecha}</td>
                <td>${row.Documento}</td>
                <td>${row.DetalleEmpresa}</td>
                <td>${row.Monto ? row.Monto.toFixed(2) : '0.00'}</td>
                <td>${row.Emp}</td>
                <td>${row.Turno}</td>
            `;
            tbody.appendChild(tr);
        });

        document.getElementById('page-info-cargos').innerText = `Pág ${page}`;

    } catch (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="7" style="color:red; text-align:center">Error de servidor</td></tr>';
    }
}

function cambiarPaginaCargos(delta) {
    const newPage = reportCargosPage + delta;
    if (newPage >= 1) cargarReporteCargos(newPage);
}

function limpiarFiltrosCargos() {
    reportCargosFilters = {};
    document.querySelectorAll('.col-filter-cargos').forEach(i => i.value = '');
    cargarReporteCargos(1);
}

async function exportarExcelCargos() {
    const empresa = document.getElementById('repc-empresa').value;
    const year = document.getElementById('repc-anio').value;
    const month = document.getElementById('repc-mes').value;
    const turno = document.getElementById('repc-turno').value;

    const btn = event.currentTarget;
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; btn.disabled = true;

    try {
        const res = await fetch('/api/reports/cargos-caja/export', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ empresa, year, month, turno, filters: reportCargosFilters })
        });
        if (res.ok) {
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `Reporte_Cargos_${empresa}_${year}.xlsx`;
            document.body.appendChild(a); a.click(); a.remove();
        } else { alert('Error exportar'); }
    } catch (e) { alert('Error conexión'); }
    finally { btn.innerHTML = original; btn.disabled = false; }
}

async function cargarEmpresasReporte() {
    const select = document.getElementById('repc-empresa');
    if (!select) return;

    try {
        const res = await fetch('/api/reports/listas/empresas');
        if (res.ok) {
            const data = await res.json();
            select.innerHTML = ''; // Limpiar "Cargando..."

            data.forEach(item => {
                const opt = document.createElement('option');
                opt.value = item.n_numero; // Esto enviará el ID (ej: 2, 4, 6)
                opt.innerText = item.c_describe; // Esto mostrará el Nombre
                select.appendChild(opt);
            });

            // Una vez cargado el combo, cargamos el reporte por primera vez
            // Seleccionamos el primero por defecto si hay datos
            if (data.length > 0) {
                select.value = data[0].n_numero;
                cargarReporteCargos(1);
            }
        }
    } catch (e) {
        console.error("Error cargando empresas", e);
        select.innerHTML = '<option value="">Error</option>';
    }
}