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

// Variables Recetas
let recetaItems = []; // Array temporal de la receta actual
let debounceReceta;

//Variables para reporte de CtaProveedores
let spPage = 1;
let spDebounceTimer;


// ==========================================
//  INICIO
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    // Registrar plugin datalabels globalmente
    if (typeof Chart !== 'undefined' && typeof ChartDataLabels !== 'undefined') {
        Chart.register(ChartDataLabels);
    }

    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateIcon(savedTheme);

    const today = new Date().toISOString().split('T')[0];
    document.querySelectorAll('input[type="date"]').forEach(input => input.value = today);

    // CORRECCIÓN: Aplicar fecha de hoy solo a inputs que NO sean del reporte de saldos
    document.querySelectorAll('input[type="date"]').forEach(input => {
        if (input.id !== 'sp-fecha-inicio' && input.id !== 'sp-fecha-fin') {
            input.value = today;
        }
    });

    // Año reporte
    const yearSelect = document.getElementById('rep-anio');
    const audAnioSelect = document.getElementById('aud-anio');

    if (yearSelect) {
        const currentYear = new Date().getFullYear();
        for (let i = 0; i < 5; i++) {
            const opt = document.createElement('option');
            opt.value = currentYear - i; opt.innerText = currentYear - i;
            yearSelect.appendChild(opt);
        }
    }

    if (audAnioSelect) {
        const currentYear = new Date().getFullYear();
        for (let i = 0; i < 5; i++) {
            const opt = document.createElement('option');
            opt.value = currentYear - i;
            opt.innerText = currentYear - i;
            audAnioSelect.appendChild(opt);
        }
    }

    // Llenar combo de empresas para la nueva vista
    cargarEmpresasAuditoria();
    // Llenar selector de año para la nueva vista
    const audDocAnio = document.getElementById('aud-doc-anio');
    if (audDocAnio) {
        const currentYear = new Date().getFullYear();
        for (let i = 0; i < 5; i++) {
            const opt = document.createElement('option');
            opt.value = currentYear - i; opt.innerText = currentYear - i;
            audDocAnio.appendChild(opt);
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
            aplicarPermisos(user.permisos, user.rol);
            aplicarAlcanceEmpresas(user.empresas || []);
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

    // Actualizar labels del select Turno (Día/Noche) según sede seleccionada
    const veEmpresa = document.getElementById('ve-empresa');
    if (veEmpresa) {
        veEmpresa.addEventListener('change', actualizarTurnoLabels);
        actualizarTurnoLabels();
    }

    setupSidebarNavigation();

});

// ==========================================
//  NAVEGACIÓN
// ==========================================
function aplicarPermisos(permisos, rol = '') {
    const menuItems = document.querySelectorAll('.sidebar li[data-module]');
    menuItems.forEach(item => item.classList.add('permission-hidden'));

    // Mapeo manual para asegurar compatibilidad
    // Se usó data-module en el HTML anterior --> esto funciona directo
    // Si no, agregamos un fallback simple por nombres
    const permisosUsuario = permisos || [];
    menuItems.forEach(item => {
        const mod = item.getAttribute('data-module');
        if (permisosUsuario.includes(mod)) item.classList.remove('permission-hidden');
    });

    document.querySelectorAll('[data-admin-only]').forEach(item => {
        const admin = String(rol).trim().toLowerCase() === 'administrador';
        item.hidden = !admin;
        item.classList.toggle('permission-hidden', !admin);
    });

    updateSidebarSectionVisibility();
}

function aplicarAlcanceEmpresas(empresas) {
    const codigos = new Set(empresas.map(e => String(e.codigo_producto)));
    const ventas = new Set(empresas.map(e => String(e.nombre_ventas)));
    const selectsPorCodigo = ['empresa-select', 'rev-empresa', 'prod-filter-empresa', 'rec-filter-empresa', 'rep-empresa', 'p-empresa-gen'];

    selectsPorCodigo.forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        [...select.options].forEach(option => {
            if (option.value) option.hidden = !codigos.has(option.value);
        });
        const primera = [...select.options].find(option => option.value && codigos.has(option.value));
        if (primera && (!codigos.has(select.value) || select.selectedOptions[0]?.hidden)) select.value = primera.value;
        if (empresas.length === 1) select.disabled = true;
    });

    const ventasSelect = document.getElementById('ve-empresa');
    if (ventasSelect) {
        [...ventasSelect.options].forEach(option => { if (option.value) option.hidden = !ventas.has(option.value); });
        const primera = [...ventasSelect.options].find(option => option.value && ventas.has(option.value));
        if (primera && !ventas.has(ventasSelect.value)) ventasSelect.value = primera.value;
        if (empresas.length === 1) ventasSelect.disabled = true;
    }
}

function updateSidebarSectionVisibility() {
    document.querySelectorAll('.nav-section').forEach(section => {
        const visibleItems = [...section.querySelectorAll('.nav-list > li')]
            .some(item => !item.classList.contains('permission-hidden'));
        section.hidden = !visibleItems;
    });
}

function setSubmenuOpen(submenu, shouldOpen) {
    if (!submenu) return;

    if (shouldOpen) {
        document.querySelectorAll('.sidebar .submenu.open').forEach(openSubmenu => {
            if (openSubmenu !== submenu) {
                openSubmenu.classList.remove('open');
                const toggle = openSubmenu.previousElementSibling;
                if (toggle) toggle.setAttribute('aria-expanded', 'false');
            }
        });
    }

    submenu.classList.toggle('open', shouldOpen);
    const toggle = submenu.previousElementSibling;
    if (toggle) toggle.setAttribute('aria-expanded', String(shouldOpen));
}

function clearSidebarSearch() {
    const input = document.getElementById('sidebar-search-input');
    if (!input) return;
    input.value = '';
    filterSidebarNavigation('');
}

function filterSidebarNavigation(rawQuery) {
    const query = rawQuery.trim().toLocaleLowerCase('es-PE');
    const search = document.querySelector('.sidebar-search');
    if (search) search.classList.toggle('has-query', Boolean(query));

    document.querySelectorAll('.nav-section').forEach(section => {
        let sectionHasMatch = false;

        section.querySelectorAll('.nav-list > li').forEach(item => {
            if (item.classList.contains('permission-hidden')) return;

            const label = item.querySelector(':scope > span, :scope > .submenu-toggle span')?.textContent || '';
            const submenu = item.querySelector(':scope > .submenu');
            const ownMatch = label.toLocaleLowerCase('es-PE').includes(query);
            let childMatch = false;

            if (submenu) {
                submenu.querySelectorAll(':scope > li').forEach(child => {
                    const canSeeChild = !child.classList.contains('permission-hidden');
                    const matches = canSeeChild && child.textContent.toLocaleLowerCase('es-PE').includes(query);
                    child.hidden = Boolean(query) && !matches;
                    childMatch ||= matches;
                });
                const showSubmenu = Boolean(query) && (ownMatch || childMatch);
                submenu.classList.toggle('open', showSubmenu);
                const toggle = submenu.previousElementSibling;
                if (toggle) toggle.setAttribute('aria-expanded', String(showSubmenu));
            }

            const matches = !query || ownMatch || childMatch;
            item.hidden = !matches;
            sectionHasMatch ||= matches;
        });

        section.hidden = !sectionHasMatch;
    });
}

function closeSidebarFlyout() {
    const flyout = document.getElementById('sidebar-flyout');
    if (!flyout) return;
    flyout.classList.remove('open');
    flyout.setAttribute('aria-hidden', 'true');
    flyout.innerHTML = '';
}

function openSidebarFlyout(toggle) {
    const sidebar = document.getElementById('sidebar');
    const submenu = toggle?.nextElementSibling;
    const flyout = document.getElementById('sidebar-flyout');
    if (!sidebar?.classList.contains('collapsed') || !submenu || !flyout) return;

    const title = toggle.querySelector('span')?.textContent?.trim() || 'Opciones';
    flyout.innerHTML = `<p class="sidebar-flyout-title">${title}</p><ul>${submenu.innerHTML}</ul>`;
    const rect = toggle.getBoundingClientRect();
    flyout.classList.add('open');
    const maxTop = window.innerHeight - Math.min(flyout.offsetHeight, 300) - 12;
    flyout.style.left = `${rect.right + 10}px`;
    flyout.style.top = `${Math.max(12, Math.min(rect.top, maxTop))}px`;
    flyout.setAttribute('aria-hidden', 'false');
}

function setupSidebarNavigation() {
    const input = document.getElementById('sidebar-search-input');
    const clearButton = document.getElementById('sidebar-search-clear');
    const sidebar = document.getElementById('sidebar');
    const flyout = document.getElementById('sidebar-flyout');
    if (!input || !sidebar) return;

    input.addEventListener('input', () => filterSidebarNavigation(input.value));
    clearButton?.addEventListener('click', () => {
        clearSidebarSearch();
        input.focus();
    });

    document.querySelectorAll('.submenu-toggle').forEach(toggle => {
        toggle.addEventListener('mouseenter', () => openSidebarFlyout(toggle));
        toggle.addEventListener('focus', () => openSidebarFlyout(toggle));
    });

    document.querySelectorAll('.sidebar li[onclick]').forEach(item => {
        item.setAttribute('role', 'button');
        item.tabIndex = 0;
    });

    sidebar.addEventListener('mouseleave', () => {
        window.setTimeout(() => {
            if (!flyout?.matches(':hover')) closeSidebarFlyout();
        }, 120);
    });
    sidebar.addEventListener('focusout', () => {
        window.setTimeout(() => {
            const activeElement = document.activeElement;
            if (!sidebar.contains(activeElement) && !flyout?.contains(activeElement)) closeSidebarFlyout();
        }, 0);
    });
    flyout?.addEventListener('mouseleave', closeSidebarFlyout);
    document.addEventListener('keydown', event => {
        const menuItem = event.target.closest('.sidebar li[onclick], .sidebar-flyout li[onclick]');
        if (menuItem && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            menuItem.click();
        }
        if (event.key === 'Escape') closeSidebarFlyout();
    });
}

// ==========================================
//  NAVEGACIÓN (ACTUALIZADA PARA SUBMENÚS)
// ==========================================
function showView(viewName) {
    // 1. Ocultar todas las secciones
    document.querySelectorAll('.view-section').forEach(el => {
        el.style.display = 'none';
    });

    // 2. Resetear 'active' del menú
    document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active'));

    // 3. Mostrar la vista deseada
    const target = document.getElementById(`view-${viewName}`);
    if (target) {
        target.style.display = 'block';

        // --- LÓGICA DE CARGA SEGÚN LA VISTA ---
        if (viewName === 'precios') cargarProductosPrecios();
        if (viewName === 'prod-almacen') buscarProductos();

        if (viewName === 'cierre-turnos') {
            cargarTurnosControl();
        }

        if (viewName === 'reportes-saldo-prov') {
            const fInicio = document.getElementById('sp-fecha-inicio');
            const fFin = document.getElementById('sp-fecha-fin');
            if (fInicio) fInicio.value = "";
            if (fFin) fFin.value = "";
            cargarReporteSaldoProv(1);
        }

        if (viewName === 'cargo-caja-resultado') {
            cargarComboSedeCargo().then(() => cargarCargoResultado());
        }

        if (viewName === 'config-actualizaciones') {
            cargarConfigActualizacion();
        }

        if (viewName === 'reporte-ventas-estadistica') {
            setDefaultVentasFechas();
            cargarEstadisticaVentas();
        }
    }

    // 4. Activar visualmente el ítem
    const activeLink = document.querySelector(`.sidebar li[onclick="showView('${viewName}')"]`);
    if (activeLink) {
        activeLink.classList.add('active');
        const parentUl = activeLink.closest('ul.submenu');
        if (parentUl) {
            setSubmenuOpen(parentUl, true);
        }
    }

    closeSidebarFlyout();

    // 5. Cerrar sidebar automáticamente en móvil/tablet
    if (window.innerWidth <= 992) {
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('mobile-overlay').classList.remove('active');
    }
}

function toggleSubmenu(element) {
    const submenu = element.nextElementSibling;
    if (window.innerWidth > 992 && document.getElementById('sidebar').classList.contains('collapsed')) {
        openSidebarFlyout(element);
        return;
    }
    setSubmenuOpen(submenu, !submenu.classList.contains('open'));
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');
    const isMobile = window.innerWidth <= 992;
    if (isMobile) {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('active');
        if (sidebar.classList.contains('open')) {
            clearSidebarSearch();
            document.querySelectorAll('.sidebar .submenu.open').forEach(s => setSubmenuOpen(s, false));
        }
    }
    else {
        sidebar.classList.toggle('collapsed');
        closeSidebarFlyout();
        const icon = document.querySelector('.toggle-btn i');
        if (sidebar.classList.contains('collapsed')) { icon.classList.remove('fa-bars'); icon.classList.add('fa-arrow-right'); }
        else { icon.classList.remove('fa-arrow-right'); icon.classList.add('fa-bars'); }
    }
}
window.addEventListener('resize', () => {
    if (window.innerWidth > 992) {
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('mobile-overlay').classList.remove('active');
    }
    closeSidebarFlyout();
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
        lockComision(); // Función helper que se creo mas abajo
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
    try {
        // Importante: encodeURIComponent por si el código tiene caracteres raros
        const res = await fetch(`/api/productos/${encodeURIComponent(id)}`, { method: 'DELETE' });

        if (res.ok) {
            alert("Producto eliminado correctamente");
            buscarProductos(); // Recargar la tabla
        } else {
            const err = await res.json(); // Intentar leer mensaje del servidor
            alert("Error: " + (err.message || "No se pudo eliminar"));
        }
    } catch (e) {
        console.error(e);
        alert("Error de conexión");
    }
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

// =============================================
//  RESTO DE MODULOS (EQUIPOS, PRECIOS, NUBE...)
// =============================================

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

        // Si existe el elemento título, lo actualizamos. Si no, no pasa nada :)
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
    try {
        const res = await fetch('/api/users'); if (!res.ok) return;
        const users = await res.json(); const tbody = document.querySelector('#users-table tbody'); if (!tbody) return;
        tbody.innerHTML = '';
        usuariosSistema = users;
        users.forEach(u => {
            const tr = document.createElement('tr');
            const esAdmin = String(u.rol || '').trim().toLowerCase() === 'administrador';
            const estado = u.activo ? 'Activo' : 'Inactivo';
            const accionEstado = esAdmin ? '' : ` <button class="btn-save" style="padding:5px 10px;" onclick="cambiarEstadoUsuario(${u.id}, ${u.activo ? 'false' : 'true'})">${u.activo ? 'Desactivar' : 'Reactivar'}</button>`;
            tr.innerHTML = `<td>${u.id}</td><td>${u.usuario}</td><td>${u.nombre}</td><td><span style="background:var(--accent); color:white; padding:2px 6px; border-radius:4px; font-size:0.8rem;">${u.rol || 'N/A'}</span></td><td>${u.empresas || '—'}</td><td>${estado}</td><td><button class="btn-save" style="padding:5px 10px;" onclick="openUserModalById(${u.id})">Editar</button>${accionEstado} <button class="btn-delete" style="padding:5px 10px;" onclick="deleteUser(${u.id})">Eliminar</button></td>`;
            tbody.appendChild(tr);
        });
    } catch (e) { console.error(e); }
}
let rolesSistema = [];
let empresasSistema = [];
let usuariosSistema = [];
async function loadRolesSelect() {
    try {
        const [rolesRes, empresasRes] = await Promise.all([fetch('/api/roles'), fetch('/api/empresas-permitidas')]);
        if (!rolesRes.ok || !empresasRes.ok) return;
        rolesSistema = await rolesRes.json(); empresasSistema = await empresasRes.json();
        const select = document.getElementById('u-rol'); if (!select) return;
        select.innerHTML = rolesSistema.map(r => `<option value="${r.id}">${r.nombre}</option>`).join('');
        renderEmpresasUsuario([]);
    } catch (e) { console.error(e); }
}
function renderEmpresasUsuario(seleccionadas) {
    const list = document.getElementById('u-empresas-list'); if (!list) return;
    const seleccion = new Set(seleccionadas.map(String));
    list.innerHTML = empresasSistema.map(e => `<label class="empresa-option"><input type="checkbox" name="u-empresa" value="${e.id}" ${seleccion.has(String(e.id)) ? 'checked' : ''}><span>${e.nombre_visible}</span></label>`).join('');
}
function actualizarAyudaEmpresas() {
    const select = document.getElementById('u-rol');
    const help = document.getElementById('u-empresas-help');
    if (!select || !help) return;
    const rol = select.selectedOptions[0]?.textContent.trim().toLowerCase();
    help.textContent = rol === 'operador' || rol === 'supervisor'
        ? 'Obligatorio: seleccione al menos una empresa para limitar su alcance.'
        : 'Opcional para Administrador; su alcance se mantiene global.';
}
function openUserModal(user = null) {
    const editando = Boolean(user);
    document.getElementById('modal-user-title').textContent = editando ? 'Editar Usuario' : 'Nuevo Usuario';
    document.getElementById('u-submit').textContent = editando ? 'Guardar cambios' : 'Crear Usuario';
    document.getElementById('u-id').value = user?.id || '';
    document.getElementById('u-user').value = user?.usuario || '';
    document.getElementById('u-user').disabled = editando;
    document.getElementById('u-pass').value = '';
    document.getElementById('u-pass').required = !editando;
    document.getElementById('u-pass').style.display = editando ? 'none' : '';
    document.getElementById('u-pass-label').style.display = editando ? 'none' : '';
    document.getElementById('u-name').value = user?.nombre || '';
    const role = rolesSistema.find(r => String(r.nombre).toLowerCase() === String(user?.rol || '').toLowerCase());
    if (role) document.getElementById('u-rol').value = role.id;
    actualizarAyudaEmpresas();
    const asignadas = String(user?.empresas_asignadas || user?.empresas || '').split(',').map(v => v.trim());
    renderEmpresasUsuario(empresasSistema.filter(e => asignadas.includes(e.nombre_visible)).map(e => e.id));
    document.getElementById('modal-user').style.display = 'block';
}
document.getElementById('u-rol')?.addEventListener('change', actualizarAyudaEmpresas);
function openUserModalById(id) {
    openUserModal(usuariosSistema.find(user => Number(user.id) === Number(id)) || null);
}
if (document.getElementById('user-form')) {
    document.getElementById('user-form').onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('u-id').value;
        const empresa_ids = [...document.querySelectorAll('input[name="u-empresa"]:checked')].map(input => Number(input.value));
        const actual = usuariosSistema.find(user => String(user.id) === String(id));
        const payload = { nombre: document.getElementById('u-name').value, rol_id: Number(document.getElementById('u-rol').value), empresa_ids };
        if (id && actual) payload.activo = Boolean(actual.activo);
        if (!id) { payload.usuario = document.getElementById('u-user').value; payload.password = document.getElementById('u-pass').value; }
        const res = await fetch(id ? `/api/users/${id}` : '/api/users', { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (res.ok) { document.getElementById('modal-user').style.display = 'none'; loadUsers(); }
        else { const error = await res.json().catch(() => ({})); alert(error.message || 'Error guardando usuario'); }
    };
}
async function deleteUser(id) { if (confirm('¿Borrar?')) { await fetch(`/api/users/${id}`, { method: 'DELETE' }); loadUsers(); } }
async function cambiarEstadoUsuario(id, activo) {
    const accion = activo ? 'reactivar' : 'desactivar';
    if (!confirm(`¿Desea ${accion} este usuario?`)) return;
    const res = await fetch(`/api/users/${id}/estado`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activo }) });
    if (!res.ok) { const error = await res.json().catch(() => ({})); alert(error.message || 'No se pudo actualizar el estado'); }
    loadUsers();
}

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

        if (tipo === 'COMISION') {
            try {
                const res = await fetch('/api/validate-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clave, tipo })
                });
                const data = await res.json();
                if (data.success) {
                    closeModal('modal-password');
                    const inputCom = document.getElementById('p-comision');
                    inputCom.readOnly = false;
                    inputCom.style.background = 'var(--input-bg)';
                    inputCom.focus();
                } else { alert(data.message || 'Clave incorrecta'); }
            } catch (error) { alert('Error de conexión'); }
        }
        else if (tipo === 'TURNO') {
            try {
                const res = await fetch('/api/operaciones/validar-clave-turno', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: clave })
                });
                const data = await res.json();
                if (data.success) {
                    closeModal('modal-password');
                    ejecutarCambioTurno();
                } else { alert(data.message || 'Clave incorrecta'); }
            } catch (err) { alert('Error de conexión'); }
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
//  AUDITORIA: TICKETS NO PAGADOS
// ==========================================
async function consultarTicketsNoPagados() {
    const anio = document.getElementById('aud-anio').value;
    const tbody = document.querySelector('#aud-tickets-table tbody');

    // UI Loading
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center"><i class="fas fa-spinner fa-spin"></i> Procesando...</td></tr>';

    try {
        const res = await fetch(`/api/auditoria/tickets-no-pagados/${anio}`);
        if (!res.ok) throw new Error('Error en servidor');

        const data = await res.json();

        tbody.innerHTML = '';
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center">No se encontraron tickets pendientes de pago para este año.</td></tr>';
            return;
        }

        data.forEach(row => {
            const tr = document.createElement('tr');
            // Formatear fecha
            const fecha = row.Fecha ? new Date(row.Fecha).toLocaleString() : '---';

            tr.innerHTML = `
                <td>${fecha}</td>
                <td><span class="badge-code">${row.NroTicket}</span></td>
                <td>${row.numero || '---'}</td>
                <td>${row.Empresa || '---'}</td>
                <td>${row.turno || '---'}</td>
                <td style="font-weight:bold; color:var(--red-status)">${parseFloat(row.Total).toFixed(2)}</td>
                <td><span style="color:var(--red-status)"><i class="fas fa-clock"></i> Pendiente</span></td>
            `;
            tbody.appendChild(tr);
        });

    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--red-status)">Error al cargar la auditoría.</td></tr>';
    }
}

// Cargar empresas desde n_codtabla = 200
async function cargarEmpresasAuditoria() {
    const selects = ['aud-doc-empresa', 'sub-empresa']
        .map(id => document.getElementById(id))
        .filter(Boolean);
    if (selects.length === 0) return;
    try {
        const res = await fetch('/api/reports/listas/empresas'); // Reutilizamos endpoint existente
        const data = await res.json();
        selects.forEach(select => {
            select.innerHTML = '';
            data.forEach(item => {
                const opt = document.createElement('option');
                opt.value = item.n_numero;
                opt.innerText = item.c_describe;
                select.appendChild(opt);
            });
        });
    } catch (e) { console.error("Error cargando empresas auditoria", e); }
}

async function consultarDocSinDetalle() {
    const emp = document.getElementById('aud-doc-empresa').value;
    const tur = document.getElementById('aud-doc-turno').value;
    const anio = document.getElementById('aud-doc-anio').value;
    const tbody = document.querySelector('#aud-doc-table tbody');
    const containerCorrige = document.getElementById('container-corrige');

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center"><i class="fas fa-spinner fa-spin"></i> Consultando...</td></tr>';
    containerCorrige.style.display = 'none';

    try {
        const res = await fetch(`/api/auditoria/doc-sin-detalle?emp=${emp}&tur=${tur}&anio=${anio}`);
        const data = await res.json();

        tbody.innerHTML = '';
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">No se encontraron documentos sin detalle. Todo está correcto.</td></tr>';
        } else {
            data.forEach(row => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${row.Numero}</td>
                    <td>${new Date(row.Fecha).toLocaleDateString()}</td>
                    <td>${row.empresa}</td>
                    <td>${row.turno}</td>
                    <td>${row.NroPedido}</td>
                    <td>${parseFloat(row.total).toFixed(2)}</td>
                `;
                tbody.appendChild(tr);
            });
            // Si hay datos, mostramos el botón de corregir
            containerCorrige.style.display = 'block';
        }
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="6" style="color:red; text-align:center">Error en consulta</td></tr>';
    }
}

async function ejecutarCorrigeCarga() {
    const emp = document.getElementById('aud-doc-empresa').value;
    const tur = document.getElementById('aud-doc-turno').value;
    const anio = document.getElementById('aud-doc-anio').value;
    const btn = document.getElementById('btn-corregir-carga');

    if (!confirm("¿Está seguro de ejecutar la corrección? Esto insertará los detalles faltantes y cargará transacciones.")) return;

    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';
    btn.disabled = true;

    try {
        const res = await fetch('/api/auditoria/corregir-carga', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emp, tur, anio })
        });

        if (res.ok) {
            const data = await res.json();
            alert(data.message);
            // Volver a consultar para verificar que ya no hay errores
            consultarDocSinDetalle();
        } else {
            alert("Error durante el proceso de corrección.");
        }
    } catch (e) {
        alert("Error de conexión al servidor.");
    } finally {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
    }
}

// ==========================================
//  AUDITORIA: SUBIDA A LA NUBE (sp_aud_NumFactura)
// ==========================================
async function ejecutarAudSubidaNube() {
    const emp = document.getElementById('sub-empresa').value;
    const tur = document.getElementById('sub-turno').value;
    const btn = document.getElementById('sub-btn-ejecutar');
    const resumenEl = document.getElementById('sub-resumen');
    const tarjetasEl = document.getElementById('sub-tarjetas');

    if (!emp) { alert('Seleccione una empresa.'); return; }

    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Ejecutando...';
    btn.disabled = true;

    resumenEl.style.display = 'none';
    tarjetasEl.style.display = 'none';

    try {
        const res = await fetch(`/api/auditoria/subida-nube?emp=${emp}&tur=${tur}`);
        if (!res.ok) throw new Error('Error en servidor');
        const data = await res.json();
        renderAudSubidaNube(data);
    } catch (e) {
        console.error(e);
        tarjetasEl.style.display = 'block';
        tarjetasEl.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--red-status);"><i class="fas fa-triangle-exclamation"></i> Error al ejecutar la auditoría.</div>';
    } finally {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
    }
}

function renderAudSubidaNube(data) {
    const resumenEl = document.getElementById('sub-resumen');
    const tarjetasEl = document.getElementById('sub-tarjetas');
    const { resultados, resumen } = data;

    if (!resultados || resultados.length === 0) {
        resumenEl.style.display = 'none';
        tarjetasEl.style.display = 'block';
        tarjetasEl.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">La empresa seleccionada no devuelve verificaciones para esta auditoría.</div>';
        return;
    }

    // Resumen global
    const ok = resumen.ok || 0;
    const err = resumen.errores || 0;
    const todoOk = resumen.todoOk;
    const color = todoOk ? 'var(--green-status)' : 'var(--red-status)';
    const icono = todoOk ? 'fa-circle-check' : 'fa-triangle-exclamation';
    const texto = todoOk ? 'Todo correcto en la nube' : 'Errores detectados en la nube';

    resumenEl.style.display = 'block';
    resumenEl.innerHTML = `
        <div style="display: flex; align-items: center; gap: 20px; padding: 16px 22px; border-radius: 10px; background: var(--card-bg); border: 1px solid ${color}; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 12px; font-size: 1.1rem; font-weight: bold; color: ${color};">
                <i class="fas ${icono}" style="font-size: 1.6rem;"></i> ${texto}
            </div>
            <div style="font-size: .9rem; color: var(--text-secondary);">
                <span style="color: var(--green-status); font-weight: bold;">${ok} OK</span> ·
                <span style="color: var(--red-status); font-weight: bold;">${err} ERROR</span> ·
                ${resumen.total} verificaciones
            </div>
        </div>`;

    // Tarjetas semáforo por documento
    const iconos = {
        'Facturas': 'fa-file-invoice',
        'Boletas': 'fa-receipt',
        'Notas de venta': 'fa-store',
        'Tickets': 'fa-ticket'
    };

    tarjetasEl.style.display = 'grid';
    tarjetasEl.innerHTML = '';
    resultados.forEach(r => {
        const col = r.ok ? 'var(--green-status)' : 'var(--red-status)';
        const ic = (r.ok ? 'fa-circle-check' : 'fa-circle-xmark');
        const card = document.createElement('div');
        card.className = 'kpi-card';
        card.style.cssText = `background: var(--card-bg); border: 1px solid ${col}; border-radius: 8px; padding: 18px;`;
        card.innerHTML = `
            <div style="font-size: .8rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: .5px;">
                <i class="fas ${iconos[r.documento] || 'fa-file-circle-check'}" style="margin-right: 6px;"></i>${r.documento}
            </div>
            <div style="display: flex; align-items: center; gap: 10px; margin-top: 10px; font-size: 1.3rem; font-weight: bold; color: ${col};">
                <i class="fas ${ic}"></i> ${r.ok ? 'Ok' : 'Error'}
            </div>`;
        tarjetasEl.appendChild(card);
    });
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

// --- Actualizacion para reporte de CTAPROVEEDORES
async function cargarReporteSaldoProv(page) {
    spPage = page;

    const vSaldo = document.getElementById('sp-ver-saldo').value;
    const fIni = document.getElementById('sp-fecha-inicio').value;
    const fFi = document.getElementById('sp-fecha-fin').value;
    const busqueda = document.getElementById('sp-search').value;

    const tbody = document.querySelector('#sp-table tbody');
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center"><i class="fas fa-spinner fa-spin"></i> Cargando información...</td></tr>';

    try {
        const res = await fetch('/api/reports/saldo-proveedores', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filters: { verSaldo: vSaldo, fInicio: fIni, fFin: fFi, q: busqueda },
                page,
                pageSize: 50
            })
        });

        const result = await res.json();
        const data = result.data;
        tbody.innerHTML = '';

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center">No hay registros para mostrar</td></tr>';
            return;
        }

        data.forEach(row => {
            const tr = document.createElement('tr');

            // Lógica de Estado
            const isCancelado = row.Saldo <= 0;
            const estadoHTML = isCancelado
                ? '<span style="background: var(--green-status); color: white; padding: 3px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: bold;">CANCELADO</span>'
                : '<span style="color: var(--text-secondary); font-size: 0.7rem; font-weight: bold;">PENDIENTE</span>';

            // Lógica Días Vencidos (Estandarizada)
            let diasHTML = '-';
            if (!isCancelado && row.DiasVencidos !== null) {
                const d = row.DiasVencidos;
                diasHTML = d > 0
                    ? `<span style="color: var(--red-status); font-weight: bold;">${d} días venc.</span>`
                    : `<span style="color: var(--green-status); font-weight: bold;">${Math.abs(d)} días x venc.</span>`;
            }

            const saldoStyle = row.Saldo < 0 ? 'color: var(--red-status); font-weight: bold;' : 'font-weight: bold;';

            tr.innerHTML = `
                <td style="font-size: 0.8rem; font-weight: 600; white-space: normal; max-width: 250px;">${row.Proveedor}</td>
                <td style="font-family: monospace;">${row.Documento}</td>
                <td><span class="badge-code">${row.TipoProveedor}</span></td>
                <td>${row.FechaF_Str || '-'}</td> <!-- Ya viene formateado de SQL -->
                <td>${row.FechaV_Str || '-'}</td> <!-- Ya viene formateado de SQL -->
                <td style="text-align: center;">${diasHTML}</td>
                <td style="text-align: right;">${row.Importe.toFixed(2)}</td>
                <td style="text-align: right; ${saldoStyle}">${row.Saldo.toFixed(2)}</td>
                <td style="text-align: center;">${estadoHTML}</td>
            `;
            tbody.appendChild(tr);
        });

        document.getElementById('sp-page-info').innerText = `Pág ${page}`;

    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="9" style="color:red; text-align:center">Error de red o servidor</td></tr>';
    }
}


function debounceSaldoProv() {
    clearTimeout(spDebounceTimer);
    spDebounceTimer = setTimeout(() => cargarReporteSaldoProv(1), 500);
}

function cambiarPaginaSaldoProv(delta) {
    const newPage = spPage + delta;
    if (newPage >= 1) cargarReporteSaldoProv(newPage);
}

async function exportarExcelSaldoProv() {
    const filters = {
        verSaldo: document.getElementById('sp-ver-saldo').value,
        fInicio: document.getElementById('sp-fecha-inicio').value,
        fFin: document.getElementById('sp-fecha-fin').value,
        q: document.getElementById('sp-search').value
    };

    const btn = event.currentTarget;
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        const res = await fetch('/api/reports/saldo-proveedores/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filters })
        });

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Saldos_Proveedores_${new Date().getTime()}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    } catch (e) { alert("Error al exportar"); }
    finally { btn.innerHTML = original; }
}
// ----


// ==========================================
//  MÓDULO: GESTIÓN RECETAS
// ==========================================

// 1. Buscar Producto Maestro (Tipo 3) - CON FILTRO EMPRESA
async function buscarProdReceta(texto) {
    const box = document.getElementById('rec-prod-suggestions');
    const empresa = document.getElementById('rec-filter-empresa').value; // Obtener empresa

    if (texto.length < 2) { box.style.display = 'none'; return; }

    clearTimeout(debounceReceta);
    debounceReceta = setTimeout(async () => {
        try {
            // Enviamos el parámetro empresa en la URL
            const res = await fetch(`/api/recetas/productos/buscar?q=${encodeURIComponent(texto)}&empresa=${empresa}`);
            const data = await res.json();

            box.innerHTML = '';
            if (data.length > 0) {
                box.style.display = 'block';
                data.forEach(p => {
                    const div = document.createElement('div');
                    div.className = 'suggestion-item';
                    div.innerText = `${p.CodPro} - ${p.Nombre}`;
                    div.onclick = () => seleccionarProductoReceta(p);
                    box.appendChild(div);
                });
            } else {
                box.style.display = 'none';
            }
        } catch (e) { console.error(e); }
    }, 300);
}

// Función auxiliar para limpiar si cambia el combo
function limpiarBusquedaReceta() {
    document.getElementById('rec-prod-search').value = '';
    document.getElementById('rec-prod-id').value = '';
    document.getElementById('rec-prod-suggestions').style.display = 'none';
    document.getElementById('btn-cargar-receta').disabled = true;
    document.getElementById('rec-prod-selected-name').style.display = 'none';
    document.getElementById('receta-workspace').style.display = 'none';
}

function seleccionarProductoReceta(p) {
    document.getElementById('rec-prod-search').value = `${p.CodPro} - ${p.Nombre}`;
    document.getElementById('rec-prod-id').value = p.CodPro;
    document.getElementById('rec-prod-suggestions').style.display = 'none';
    document.getElementById('btn-cargar-receta').disabled = false;

    // Resetear vista inferior si cambia producto
    document.getElementById('receta-workspace').style.display = 'none';
}

// 2. Cargar Receta Existente
async function cargarRecetaActual() {
    const codProd = document.getElementById('rec-prod-id').value;
    if (!codProd) return;

    // Mostrar workspace
    document.getElementById('receta-workspace').style.display = 'block';

    // Limpiar array local
    recetaItems = [];

    try {
        const res = await fetch(`/api/recetas/${codProd}`);
        const data = await res.json();

        // Mapear datos BD a nuestro array local
        data.forEach(row => {
            recetaItems.push({
                codInsumo: row.CodInsumo,
                nombreInsumo: row.InsumoNombre,
                unimed: row.unimed,
                nombreUnidad: row.UnidadNombre,
                cantidad: row.Cantidad
            });
        });

        renderTablaReceta();
    } catch (e) { console.error(e); alert('Error al cargar receta existente'); }
}

// 3. Buscar Insumo (Tipo 1)
// 3. Buscar Insumo (Tipo 1) - CON FILTRO EMPRESA
async function buscarInsumoReceta(texto) {
    const box = document.getElementById('rec-ins-suggestions');
    // Obtenemos la empresa seleccionada arriba
    const empresa = document.getElementById('rec-filter-empresa').value;

    if (texto.length < 2) { box.style.display = 'none'; return; }

    clearTimeout(debounceReceta);
    debounceReceta = setTimeout(async () => {
        try {
            // Enviamos el parámetro empresa
            const res = await fetch(`/api/recetas/insumos/buscar?q=${encodeURIComponent(texto)}&empresa=${empresa}`);
            const data = await res.json();

            box.innerHTML = '';
            if (data.length > 0) {
                box.style.display = 'block';
                data.forEach(ins => {
                    const div = document.createElement('div');
                    div.className = 'suggestion-item';
                    div.innerText = `${ins.CodPro} - ${ins.Nombre}`; // Muestro el código para que verifiques
                    div.onclick = () => seleccionarInsumoReceta(ins);
                    box.appendChild(div);
                });
            } else { box.style.display = 'none'; }
        } catch (e) { console.error(e); }
    }, 300);
}

function seleccionarInsumoReceta(ins) {
    document.getElementById('rec-ins-search').value = ins.Nombre;
    document.getElementById('rec-ins-id').value = ins.CodPro;
    document.getElementById('rec-ins-unimed-id').value = ins.Unimed;
    document.getElementById('rec-ins-unimed-name').value = ins.UnidadNombre || 'UND';
    document.getElementById('rec-ins-suggestions').style.display = 'none';
    document.getElementById('rec-ins-cant').focus();
}

// 4. Agregar Insumo a la Tabla Local
function agregarInsumoALista() {
    const id = document.getElementById('rec-ins-id').value;
    const nombre = document.getElementById('rec-ins-search').value;
    const unidId = document.getElementById('rec-ins-unimed-id').value;
    const unidName = document.getElementById('rec-ins-unimed-name').value;
    const cant = parseFloat(document.getElementById('rec-ins-cant').value);

    if (!id || !cant || cant <= 0) {
        alert("Seleccione un insumo y una cantidad válida");
        return;
    }

    // Verificar si ya existe para sumar cantidad o avisar
    const existente = recetaItems.find(i => i.codInsumo === id);
    if (existente) {
        if (confirm("El insumo ya está en la receta. ¿Desea actualizar la cantidad?")) {
            existente.cantidad = cant;
        }
    } else {
        recetaItems.push({
            codInsumo: id,
            nombreInsumo: nombre,
            unimed: parseInt(unidId),
            nombreUnidad: unidName,
            cantidad: cant
        });
    }

    renderTablaReceta();

    // Limpiar inputs detalle
    document.getElementById('rec-ins-search').value = '';
    document.getElementById('rec-ins-id').value = '';
    document.getElementById('rec-ins-unimed-name').value = '';
    document.getElementById('rec-ins-cant').value = '';
}

// 5. Renderizar Tabla
function renderTablaReceta() {
    const tbody = document.querySelector('#tabla-receta-detalle tbody');
    const msg = document.getElementById('receta-empty-msg');

    tbody.innerHTML = '';

    if (recetaItems.length === 0) {
        msg.style.display = 'block';
    } else {
        msg.style.display = 'none';

        recetaItems.forEach((item, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.codInsumo}</td>
                <td>${item.nombreInsumo}</td>
                <td>${item.nombreUnidad}</td>
                <td>${item.cantidad.toFixed(2)}</td>
                <td>
                    <button class="btn-delete btn-sm" onclick="eliminarInsumoReceta(${index})">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
}

function eliminarInsumoReceta(index) {
    recetaItems.splice(index, 1);
    renderTablaReceta();
}

// 6. Guardar Todo en BD
async function guardarRecetaDB() {
    const codProd = document.getElementById('rec-prod-id').value;

    if (!codProd) { alert("Error: No hay producto seleccionado"); return; }
    // Nota: Permitimos guardar receta vacía (sería como borrar la receta)

    if (!confirm("¿Guardar cambios en la receta? Se sobrescribirá la receta anterior.")) return;

    try {
        const res = await fetch('/api/recetas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                codProd: codProd,
                items: recetaItems
            })
        });

        if (res.ok) {
            alert("Receta guardada correctamente");
        } else {
            alert("Error al guardar");
        }
    } catch (e) {
        console.error(e);
        alert("Error de conexión");
    }
}

// --- FUNCIONES CIERRE DE TURNOS ---

async function cargarTurnosControl() {
    const container = document.getElementById('turnos-container');
    container.innerHTML = '<div style="text-align:center; width:100%;"><i class="fas fa-spinner fa-spin fa-3x"></i></div>';

    try {
        const res = await fetch('/api/operaciones/turnos');
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            const mensaje = res.status === 403
                ? 'No tiene permiso para consultar el cierre de turnos.'
                : (data.message || 'Error al cargar los turnos.');
            container.innerHTML = `<p>${mensaje}</p>`;
            return;
        }

        container.innerHTML = '';
        if (data.length === 0) {
            container.innerHTML = '<p>No tiene empresas activas asignadas para el cierre de turnos.</p>';
            return;
        }
        data.forEach(t => {
            const turnoActual = parseInt(t.conversion);
            const card = document.createElement('div');
            card.className = 'status-card';
            card.style.textAlign = 'center';
            card.style.justifyContent = 'space-between';

            // Estética según el turno
            const icon = turnoActual === 1 ? 'fa-sun' : 'fa-moon';
            const color = turnoActual === 1 ? '#f59e0b' : '#3b82f6';
            const labelTurno = turnoActual === 1 ? 'PRIMER TURNO' : 'SEGUNDO TURNO';

            card.innerHTML = `
                <div class="card-header" style="justify-content: center; border:none;">
                    <span class="table-name" style="font-size: 1.2rem;">${t.c_describe.trim()}</span>
                </div>
                <div style="margin: 15px 0;">
                    <i class="fas ${icon}" style="font-size: 4rem; color: ${color}; transition: 0.3s;"></i>
                </div>
                <div class="card-data">
                    <div style="font-size: 1.5rem; font-weight: 800; color: var(--text-color);">${labelTurno}</div>
                    <div style="color: var(--text-secondary); font-size: 0.8rem;">CÓDIGO SEDE: ${t.n_numero}</div>
                </div>
                <button class="btn-save" onclick="prepararCambioTurno(${t.n_numero}, ${turnoActual})" 
                        style="margin-top: 20px; width: 100%; background: var(--accent);">
                    <i class="fas fa-right-left"></i> Cambiar a Turno ${turnoActual === 1 ? '2' : '1'}
                </button>
            `;
            container.appendChild(card);
        });
    } catch (e) { container.innerHTML = '<p>Error de conexión al cargar los turnos.</p>'; }
}

// Variables temporales para el cambio
let turnoPendiente = { id: null, nuevoValor: null };

function prepararCambioTurno(id, turnoActual) {
    turnoPendiente.id = id;
    turnoPendiente.nuevoValor = turnoActual === 1 ? 2 : 1;

    // Reutilizamos el modal de password que ya tienes en el proyecto
    abrirModalPassword('TURNO');
}

// MODIFICACIÓN A LA FUNCIÓN EXISTENTE DE VALIDACIÓN EN script.js
// Busca tu función document.getElementById('form-validate-pass').onsubmit y actualízala:

/* ACTUALIZAR EL ONSUBMIT DEL MODAL DE PASSWORD */
/*
if (document.getElementById('form-validate-pass')) {
    document.getElementById('form-validate-pass').onsubmit = async (e) => {
        e.preventDefault();
        const tipo = document.getElementById('pass-type').value;
        const clave = document.getElementById('pass-input').value;

        // Lógica para COMISION (Ya la tienes)
        if (tipo === 'COMISION') {
            // ... tu código existente de comisión ...
        }

        // NUEVA LÓGICA PARA TURNO
        else if (tipo === 'TURNO') {
            try {
                const res = await fetch('/api/operaciones/validar-clave-turno', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: clave })
                });
                const data = await res.json().catch(() => ({}));

                if (!res.ok) {
                    alert(res.status === 403
                        ? 'No tiene permiso para autorizar cambios de turno.'
                        : (data.message || 'No se pudo validar la autorización.'));
                    return;
                }

                if (data.success) {
                    closeModal('modal-password');
                    ejecutarCambioTurno();
                } else {
                    alert(data.message);
                }
            } catch (err) { alert('Error de validación'); }
        }
    };
}*/
/* ==========================================
   UNIFICACIÓN DE VALIDACIÓN DE CLAVES
   ========================================== */
if (document.getElementById('form-validate-pass')) {
    document.getElementById('form-validate-pass').onsubmit = async (e) => {
        e.preventDefault();

        const tipo = document.getElementById('pass-type').value; // 'COMISION' o 'TURNO'
        const clave = document.getElementById('pass-input').value;

        // --- CASO 1: DESBLOQUEAR COMISIÓN EN PRODUCTOS ---
        if (tipo === 'COMISION') {
            try {
                const res = await fetch('/api/validate-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clave, tipo })
                });
                const data = await res.json();

                if (data.success) {
                    closeModal('modal-password');
                    // Acción específica: Desbloquear el input de comisión
                    const inputCom = document.getElementById('p-comision');
                    inputCom.readOnly = false;
                    inputCom.style.background = 'var(--input-bg)';
                    inputCom.focus();
                    inputCom.select();
                } else {
                    alert(data.message || 'Clave incorrecta');
                }
            } catch (error) {
                alert('Error de conexión al validar comisión');
            }
        }

        // --- CASO 2: AUTORIZAR CAMBIO DE TURNO ---
        else if (tipo === 'TURNO') {
            try {
                const res = await fetch('/api/operaciones/validar-clave-turno', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: clave })
                });
                const data = await res.json();

                if (data.success) {
                    closeModal('modal-password');
                    // Acción específica: Ejecutar el cambio en la BD
                    ejecutarCambioTurno();
                } else {
                    alert(data.message || 'Clave incorrecta');
                }
            } catch (err) {
                alert('Error de conexión al validar turno');
            }
        }
    };
}

async function ejecutarCambioTurno() {
    try {
        const res = await fetch(`/api/operaciones/turnos/${turnoPendiente.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nuevoTurno: turnoPendiente.nuevoValor })
        });
        const data = await res.json().catch(() => ({}));

        if (res.ok) {
            alert(data.message || 'Turno actualizado correctamente');
            cargarTurnosControl(); // Recargar tarjetas
        } else {
            alert(res.status === 403
                ? 'No tiene acceso a la empresa solicitada.'
                : (data.message || 'No se pudo actualizar el turno.'));
        }
    } catch (e) { alert('Error de conexión al actualizar el turno.'); }
}

// ==========================================
//  MÓDULO: CARGO CAJA RESULTADO (Dashboard + Matriz Dinamica)
// ==========================================
const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MESES_LARGO = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

let ccChartMensual = null;
let ccChartTipos = null;

// Variables gráficas Estadística de Venta
let veChartDeposit = null;
let veChartDona = null;
let veChartEvolucion = null;

function fmtMoneda(val) {
    return 'S/ ' + (parseFloat(val) || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getCargoResultadoFilters() {
    return {
        sede: document.getElementById('cc-sede').value,
        anio: document.getElementById('cc-anio').value || new Date().getFullYear(),
        turno: document.getElementById('cc-turno').value,
        tipoDoc: document.getElementById('cc-tipo-doc').value,
        fInicio: document.getElementById('cc-fecha-inicio').value,
        fFin: document.getElementById('cc-fecha-fin').value
    };
}

async function cargarComboSedeCargo() {
    const select = document.getElementById('cc-sede');
    if (!select) return;
    select.innerHTML = '<option value="all">Todas</option>';
    try {
        const res = await fetch('/api/reports/listas/empresas');
        if (res.ok) {
            const data = await res.json();
            data.forEach(item => {
                const opt = document.createElement('option');
                opt.value = item.n_numero;
                opt.innerText = item.c_describe;
                select.appendChild(opt);
            });
        }
    } catch (e) {
        console.error('Error cargando sedes', e);
    }
}

function mostrarToast(msg) {
    const el = document.getElementById('cc-toast');
    const txt = document.getElementById('cc-toast-msg');
    if (!el) return;
    if (txt) txt.innerText = msg || 'Consultando…';
    el.classList.add('show');
}

function ocultarToast() {
    const el = document.getElementById('cc-toast');
    if (el) el.classList.remove('show');
}

async function cargarCargoResultado() {
    const filters = getCargoResultadoFilters();
    const btn = document.getElementById('cc-btn-consultar');
    const btnOriginal = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Consultando…';
    }
    mostrarToast();
    try {
        const res = await fetch('/api/cargos/dashboard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filters })
        });
        if (!res.ok) {
            alert(res.status === 403 ? 'Sin permisos de Reportes' : 'Error al consultar');
            return;
        }
        const data = await res.json();

        document.getElementById('cc-total').innerText = fmtMoneda(data.kpis.total);
        document.getElementById('cc-registros').innerText = data.kpis.registros.toLocaleString('es-PE');
        document.getElementById('cc-total-general').innerText = fmtMoneda(data.totalGeneral);

        renderMatrizCargo(data.matrix, data.porMes);
        renderChartsCargo(data.porMes, data.matrix);
    } catch (e) {
        console.error(e);
        alert('Error al consultar el dashboard');
    } finally {
        ocultarToast();
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = btnOriginal;
        }
    }
}

function renderMatrizCargo(matrix, porMes) {
    const table = document.getElementById('cc-matriz');
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    if (!table || !tbody) return;

    let head = '<tr><th style="text-align:left; padding:10px; border:1px solid var(--border-color); background:var(--accent); color:#fff;">TIPO DE CARGO</th>';
    MESES_CORTO.forEach(m => { head += `<th style="padding:10px; border:1px solid var(--border-color); background:var(--accent); color:#fff;">${m}</th>`; });
    head += '<th style="padding:10px; border:1px solid var(--border-color); background:var(--accent); color:#fff;">TOTAL GENERAL</th></tr>';
    thead.innerHTML = head;

    if (!matrix || matrix.length === 0) {
        tbody.innerHTML = '<tr><td colspan="14" style="text-align:center; padding:20px;">No hay datos para los filtros seleccionados</td></tr>';
        return;
    }

    let rows = '';
    let colTotals = new Array(12).fill(0);
    let grandTotal = 0;

    matrix.forEach(row => {
        rows += `<tr style="cursor:pointer;">`;
        rows += `<td style="padding:8px 10px; border:1px solid var(--border-color); font-weight:600;">${row.tipoCargo}</td>`;
        row.meses.forEach((val, i) => {
            colTotals[i] += val;
            rows += `<td onclick="abrirDetalleCargo('${row.tipoCargo.replace(/'/g, "\\'")}', ${i + 1})" style="padding:8px 10px; border:1px solid var(--border-color); text-align:right; font-variant-numeric: tabular-nums;">${val ? fmtMoneda(val) : '-'}</td>`;
        });
        grandTotal += row.total;
        rows += `<td onclick="abrirDetalleCargo('${row.tipoCargo.replace(/'/g, "\\'")}', 0)" style="padding:8px 10px; border:1px solid var(--border-color); text-align:right; font-weight:bold; background:var(--accent-light, rgba(0,0,0,.03));">${fmtMoneda(row.total)}</td>`;
        rows += '</tr>';
    });

    let foot = '<tr style="font-weight:bold;">';
    foot += '<td style="padding:8px 10px; border:1px solid var(--border-color); background:rgba(0,0,0,.05);">TOTAL GENERAL</td>';
    colTotals.forEach(t => { foot += `<td style="padding:8px 10px; border:1px solid var(--border-color); text-align:right; background:rgba(0,0,0,.05);">${t ? fmtMoneda(t) : '-'}</td>`; });
    foot += `<td style="padding:8px 10px; border:1px solid var(--border-color); text-align:right; background:rgba(0,0,0,.05);">${fmtMoneda(grandTotal)}</td>`;
    foot += '</tr>';

    tbody.innerHTML = rows + foot;
}

function renderChartsCargo(porMes, matrix) {
    if (typeof Chart === 'undefined') return;

    const ctxM = document.getElementById('cc-chart-mensual');
    const ctxT = document.getElementById('cc-chart-tipos');
    if (!ctxM || !ctxT) return;

    if (ccChartMensual) ccChartMensual.destroy();
    if (ccChartTipos) ccChartTipos.destroy();

    ccChartMensual = new Chart(ctxM, {
        type: 'bar',
        data: {
            labels: MESES_CORTO,
            datasets: [{ label: 'Monto por mes', data: porMes, backgroundColor: '#2563eb', borderRadius: 4 }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    boxPadding: 8,
                    padding: 10,
                    callbacks: {
                        label: ctx => ` ${ctx.label}: ${fmtMoneda(ctx.parsed.y)}`
                    }
                },
                title: { display: true, text: 'Monto por Mes' }
            },
            scales: { y: { beginAtZero: true } }
        }
    });

    const top = [...matrix].sort((a, b) => b.total - a.total).slice(0, 8);
    const paleta = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];
    ccChartTipos = new Chart(ctxT, {
        type: 'doughnut',
        data: {
            labels: top.map(r => r.tipoCargo),
            datasets: [{ data: top.map(r => r.total), backgroundColor: paleta }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { boxWidth: 12, boxHeight: 12, padding: 12, usePointStyle: false, font: { size: 11 } }
                },
                tooltip: {
                    boxPadding: 18,
                    padding: 12,
                    callbacks: {
                        label: ctx => ` ${ctx.label}: ${fmtMoneda(ctx.parsed)}`
                    }
                },
                title: { display: true, text: 'Distribución por Tipo de Cargo (Top 8)' }
            }
        }
    });
}

async function abrirDetalleCargo(tipoCargo, mes) {
    const mesLabel = mes === 0 ? 'Todo el año' : MESES_LARGO[mes - 1];
    document.getElementById('cc-detalle-titulo').innerText = `${tipoCargo} — ${mesLabel}`;
    document.getElementById('modal-cargo-detalle').style.display = 'block';

    const tR = document.querySelector('#cc-detalle-razones tbody');
    const tD = document.querySelector('#cc-detalle-registros tbody');
    tR.innerHTML = '<tr><td colspan="3" style="text-align:center"><i class="fas fa-spinner fa-spin"></i> Cargando...</td></tr>';
    tD.innerHTML = '<tr><td colspan="8" style="text-align:center"><i class="fas fa-spinner fa-spin"></i> Cargando...</td></tr>';

    try {
        const res = await fetch('/api/cargos/detalle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tipoCargo, mes, filters: getCargoResultadoFilters() })
        });
        if (!res.ok) return;
        const data = await res.json();

        tR.innerHTML = '';
        if (data.razones.length === 0) {
            tR.innerHTML = '<tr><td colspan="3" style="text-align:center">Sin datos</td></tr>';
        } else {
            data.razones.forEach(r => {
                tR.innerHTML += `<tr>
                    <td style="padding:8px; border:1px solid var(--border-color);">${r.razon}</td>
                    <td style="padding:8px; border:1px solid var(--border-color); text-align:right; font-weight:bold;">${fmtMoneda(r.monto)}</td>
                    <td style="padding:8px; border:1px solid var(--border-color); text-align:center;">${r.n}</td>
                </tr>`;
            });
        }

        tD.innerHTML = '';
        if (data.registros.length === 0) {
            tD.innerHTML = '<tr><td colspan="8" style="text-align:center">Sin registros</td></tr>';
        } else {
            data.registros.forEach(r => {
                tD.innerHTML += `<tr>
                    <td style="padding:8px; border:1px solid var(--border-color); font-family:monospace;">${r.Documento}</td>
                    <td style="padding:8px; border:1px solid var(--border-color);">${r.tipoDoc}</td>
                    <td style="padding:8px; border:1px solid var(--border-color);">${r.fecha}</td>
                    <td style="padding:8px; border:1px solid var(--border-color);">${r.razon}</td>
                    <td style="padding:8px; border:1px solid var(--border-color);">${r.destinatario}</td>
                    <td style="padding:8px; border:1px solid var(--border-color);">${r.empresa}</td>
                    <td style="padding:8px; border:1px solid var(--border-color);">${r.emp}</td>
                    <td style="padding:8px; border:1px solid var(--border-color); text-align:right; font-weight:bold;">${fmtMoneda(r.Monto)}</td>
                </tr>`;
            });
        }
    } catch (e) {
        console.error(e);
        tR.innerHTML = '<tr><td colspan="3" style="color:red; text-align:center">Error</td></tr>';
        tD.innerHTML = '<tr><td colspan="8" style="color:red; text-align:center">Error</td></tr>';
    }
}

async function exportarCargoResultado() {
    const btn = event.currentTarget;
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        const res = await fetch('/api/cargos/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filters: getCargoResultadoFilters() })
        });
        if (!res.ok) { alert('Error al exportar'); return; }
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'CargoCajaResultado.xlsx';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    } catch (e) {
        console.error(e);
        alert('Error al exportar');
    } finally {
        btn.innerHTML = original;
    }
}

// ==========================================
//  CONFIGURADOR DE ACTUALIZACIONES (ADMIN)
// ==========================================

function escapeHtmlCfg(texto) {
    return String(texto == null ? '' : texto)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function cargarConfigActualizacion() {
    try {
        const res = await fetch('/api/admin/config-actualizaciones');
        if (!res.ok) return;
        const data = await res.json();

        const cont = document.getElementById('cfg-vigente');
        if (cont) {
            if (data.activo) {
                const f = data.activo.fecha_creacion ? new Date(data.activo.fecha_creacion).toLocaleString() : '-';
                cont.innerHTML = `
                    <p style="margin:4px 0;"><strong>Nota / Versión:</strong> ${data.activo.nota ? escapeHtmlCfg(data.activo.nota) : '—'}</p>
                    <p style="margin:4px 0;"><strong>Enlace:</strong> <a href="${escapeHtmlCfg(data.activo.drive_url)}" target="_blank" rel="noopener">${escapeHtmlCfg(data.activo.drive_url)}</a></p>
                    <p style="margin:4px 0;"><strong>SHA256:</strong> ${data.activo.sha256 ? '<code>' + escapeHtmlCfg(data.activo.sha256) + '</code>' : '<em>No configurado (la instalación omite la validación de integridad)</em>'}</p>
                    <p style="margin:4px 0;"><strong>Registrado por:</strong> ${escapeHtmlCfg(data.activo.creado_por)} — ${f}</p>`;
            } else {
                cont.innerHTML = '<em>Sin configuración registrada. Se usarán los valores por defecto.</em>';
            }
        }

        const tbody = document.querySelector('#cfg-historial-table tbody');
        if (tbody) {
            tbody.innerHTML = '';
            (data.historial || []).forEach(h => {
                const f = h.fecha_creacion ? new Date(h.fecha_creacion).toLocaleString() : '-';
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${f}</td>
                    <td>${h.nota ? escapeHtmlCfg(h.nota) : '—'}</td>
                    <td style="max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtmlCfg(h.drive_url)}</td>
                    <td>${h.sha256 ? escapeHtmlCfg(h.sha256.substring(0, 12)) + '…' : '—'}</td>
                    <td>${escapeHtmlCfg(h.creado_por)}</td>`;
                tbody.appendChild(tr);
            });
            if (!data.historial || data.historial.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#888;">Sin registros</td></tr>';
            }
        }
    } catch (e) { console.error(e); }
}

async function guardarConfigActualizacion() {
    const drive_url = document.getElementById('cfg-drive-url').value.trim();
    const sha256 = document.getElementById('cfg-sha256').value.trim();
    const nota = document.getElementById('cfg-nota').value.trim();

    if (!drive_url) { alert('Ingrese el enlace de Google Drive del archivo .zip'); return; }
    if (!confirm('¿Guardar esta configuración? El instalador .BAT que descargan los usuarios se generará con este enlace.')) return;

    try {
        const res = await fetch('/api/admin/config-actualizaciones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ drive_url, sha256: sha256 || null, nota: nota || null })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
            alert(data.message || 'Configuración guardada');
            document.getElementById('cfg-drive-url').value = '';
            document.getElementById('cfg-sha256').value = '';
            document.getElementById('cfg-nota').value = '';
            cargarConfigActualizacion();
        } else {
            alert(data.message || 'Error al guardar');
        }
    } catch (e) { console.error(e); alert('Error de conexión'); }
}

// ==========================================
//  ESTADÍSTICA DE VENTA
// ==========================================

function actualizarTurnoLabels() {
    const empresa = document.getElementById('ve-empresa').value;
    const turnoSelect = document.getElementById('ve-turno');
    if (!turnoSelect) return;
    const map = {
        'Cocineria':               { 1: 'Noche', 2: 'Día' },
        'Mar Picante 1':           { 1: 'Día',   2: 'Noche' },
        'Inversiones Abruzzo Sac': { 1: 'Día',   2: 'Noche' }
    };
    const labels = map[empresa] || { 1: 'Turno 1', 2: 'Turno 2' };
    turnoSelect.querySelectorAll('option').forEach(opt => {
        if (opt.value === '1') opt.textContent = labels[1];
        else if (opt.value === '2') opt.textContent = labels[2];
    });
}

function setDefaultVentasFechas() {
    const today = new Date().toISOString().split('T')[0];
    const fInicio = document.getElementById('ve-fecha-inicio');
    const fFin = document.getElementById('ve-fecha-fin');
    if (fInicio && !fInicio.value) fInicio.value = today;
    if (fFin && !fFin.value) fFin.value = today;
}

function getVentasFiltros() {
    return {
        empresa: document.getElementById('ve-empresa').value,
        turno: document.getElementById('ve-turno').value,
        fInicio: document.getElementById('ve-fecha-inicio').value,
        fFin: document.getElementById('ve-fecha-fin').value
    };
}

async function cargarEstadisticaVentas() {
    const f = getVentasFiltros();
    const btn = document.getElementById('ve-btn-consultar');
    if (!f.fInicio || !f.fFin) { alert('Seleccione rango de fechas'); return; }

    const inicio = new Date(f.fInicio + 'T00:00:00');
    const fin = new Date(f.fFin + 'T00:00:00');
    if (fin < inicio) { alert('La fecha fin no puede ser menor que la fecha inicio'); return; }

    const textoBtn = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Consultando...';
    btn.disabled = true;

    try {
        const esRango = f.fInicio !== f.fFin;
        let result;

        if (esRango) {
            const params = new URLSearchParams({
                empresa: f.empresa, turno: f.turno,
                fInicio: f.fInicio, fFin: f.fFin
            });
            const res = await fetch(`/api/reports/ventas-estadistica/rango?${params}`);
            if (!res.ok) throw new Error(res.statusText);
            result = await res.json();
        } else {
            const d = inicio;
            const params = new URLSearchParams({
                empresa: f.empresa, turno: f.turno,
                dia: d.getDate(), mes: d.getMonth() + 1, anio: d.getFullYear()
            });
            const res = await fetch(`/api/reports/ventas-estadistica?${params}`);
            if (!res.ok) throw new Error(res.statusText);
            const raw = await res.json();
            result = {
                data: raw.data || [],
                diario: [{ fecha: f.fInicio, total: (raw.data || []).reduce((s, r) => s + (parseFloat(r.Soles) || 0), 0) }],
                totalGeneral: (raw.data || []).reduce((s, r) => s + (parseFloat(r.Soles) || 0), 0)
            };
        }

        renderKPIsVentas(result.data, result.totalGeneral);
        renderChartsVentas(result.data, result.diario);
        renderTablaVentas(result.data, result.totalGeneral);

    } catch (e) {
        console.error('Error cargando estadística de venta:', e);
        alert('Error al consultar la estadística de venta');
    } finally {
        btn.innerHTML = textoBtn;
        btn.disabled = false;
    }
}

function renderKPIsVentas(data, totalGeneral) {
    let efectivo = 0, depositos = 0;
    data.forEach(r => {
        const soles = parseFloat(r.Soles) || 0;
        if (r.tipo === 0) efectivo = soles;
        else depositos += soles;
    });
    const total = efectivo + depositos;
    const pctEfectivo = total > 0 ? ((efectivo / total) * 100).toFixed(1) : 0;

    document.getElementById('ve-kpi-total').innerText = fmtMoneda(total);
    document.getElementById('ve-kpi-efectivo').innerText = fmtMoneda(efectivo);
    document.getElementById('ve-kpi-depositos').innerText = fmtMoneda(depositos);
    document.getElementById('ve-kpi-pct-efectivo').innerText = pctEfectivo + '%';
}

function renderChartsVentas(data, diario) {
    if (typeof Chart === 'undefined') return;

    const ctxDep = document.getElementById('ve-chart-depositos');
    const ctxDon = document.getElementById('ve-chart-dona');
    const ctxEvo = document.getElementById('ve-chart-evolucion');
    if (!ctxDep || !ctxDon || !ctxEvo) return;

    if (veChartDeposit) veChartDeposit.destroy();
    if (veChartDona) veChartDona.destroy();
    if (veChartEvolucion) veChartEvolucion.destroy();

    // Ordenar por monto descendente para que las barras se vean de mayor a menor
    // (no afecta a la dona ni a la tabla, que siguen usando `data`).
    const dataBarras = [...data].sort((a, b) => (parseFloat(b.Soles) || 0) - (parseFloat(a.Soles) || 0));
    const labels = dataBarras.map(r => r.tDeposito);
    const valores = dataBarras.map(r => parseFloat(r.Soles) || 0);
    const paleta = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316'];

    const numTipos = labels.length;
    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim() || '#1f2937';

    // El ranking siempre es horizontal: prioriza nombres legibles y mantiene una fila
    // estable por tipo de cobro. La altura explícita evita el crecimiento recursivo de
    // Chart.js al redimensionar con maintainAspectRatio:false.
    const rankingHeight = Math.max(240, numTipos * 44);
    const wrapDep = document.getElementById('ve-chart-depositos-wrap');
    if (wrapDep) {
        wrapDep.style.height = rankingHeight + 'px';
    }
    ctxDep.height = rankingHeight;
    const maxValue = Math.max(...valores, 0);

    veChartDeposit = new Chart(ctxDep, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Soles',
                data: valores,
                backgroundColor: paleta.slice(0, labels.length),
                borderRadius: 6,
                maxBarThickness: 34,
                barPercentage: 0.76,
                categoryPercentage: 0.9
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 6, right: 76, bottom: 4, left: 4 } },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => ` ${fmtMoneda(ctx.parsed.x)}` } },
                datalabels: {
                    display: true,
                    anchor: 'end',
                    align: 'end',
                    offset: 6,
                    clamp: true,
                    color: textColor,
                    font: { weight: 'bold', size: 11 },
                    formatter: v => fmtMoneda(v)
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    beginAtZero: true,
                    suggestedMax: Math.max(maxValue * 1.28, 100),
                    ticks: { callback: v => 'S/ ' + v.toLocaleString(), font: { size: 11 } },
                    grid: { color: 'rgba(0,0,0,0.06)' }
                },
                y: {
                    ticks: {
                        font: { size: 11 },
                        autoSkip: false,
                        align: 'end',
                        textAlign: 'right',
                        padding: 8,
                        crossAlign: 'far',
                        callback: function(value) {
                            const label = this.getLabelForValue(value);
                            return label && label.length > 22 ? label.substring(0, 19) + '…' : label;
                        }
                    },
                    grid: { display: false }
                }
            }
        }
    });

    const total = valores.reduce((a, b) => a + b, 0);
    const efectivoVal = data.filter(r => r.tipo === 0).reduce((s, r) => s + (parseFloat(r.Soles) || 0), 0);
    const depositoVal = total - efectivoVal;
    const efectivoPct = total > 0 ? (efectivoVal / total) * 100 : 0;
    const depositoPct = total > 0 ? (depositoVal / total) * 100 : 0;
    const donutPct = document.getElementById('ve-donut-pct');
    const donutLegend = document.getElementById('ve-donut-legend');
    if (donutPct) donutPct.textContent = efectivoPct.toFixed(1) + '%';
    if (donutLegend) {
        donutLegend.innerHTML = [
            { label: 'Efectivo', value: efectivoVal, pct: efectivoPct, color: '#10b981' },
            { label: 'Depósitos', value: depositoVal, pct: depositoPct, color: '#f59e0b' }
        ].map(item => `
            <div class="ve-donut-legend-item">
                <span class="ve-donut-legend-swatch" style="background:${item.color}"></span>
                <span class="ve-donut-legend-label">${item.label}</span>
                <span class="ve-donut-legend-value">${fmtMoneda(item.value)}<span>${item.pct.toFixed(1)}%</span></span>
            </div>`).join('');
    }

    veChartDona = new Chart(ctxDon, {
        type: 'doughnut',
        data: {
            labels: ['Efectivo', 'Depósitos'],
            datasets: [{
                data: [efectivoVal, depositoVal],
                backgroundColor: ['#10b981', '#f59e0b'],
                borderWidth: 2,
                borderColor: getComputedStyle(document.documentElement).getPropertyValue('--card-bg').trim() || '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            rotation: -90,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmtMoneda(ctx.parsed)}` } },
                datalabels: { display: false }
            }
        }
    });

    if (diario && diario.length > 1) {
        const evoLabels = diario.map(d => d.fecha);
        const evoData = diario.map(d => d.total);
        veChartEvolucion = new Chart(ctxEvo, {
            type: 'line',
            data: {
                labels: evoLabels,
                datasets: [{
                    label: 'Total diario',
                    data: evoData,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37,99,235,0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 4,
                    pointBackgroundColor: '#2563eb'
                }]
            },
        options: {
            responsive: true,
            plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: ctx => ` ${fmtMoneda(ctx.parsed.y)}` } },
                    datalabels: { display: false }
                },
                scales: {
                    y: { beginAtZero: true, ticks: { callback: v => 'S/ ' + v.toLocaleString() } },
                    x: { ticks: { maxRotation: 45, font: { size: 10 } } }
                }
            }
        });
        document.getElementById('ve-chart-evolucion').parentElement.style.display = 'block';
    } else {
        document.getElementById('ve-chart-evolucion').parentElement.style.display = 'none';
    }
}

function renderTablaVentas(data, totalGeneral) {
    const tbody = document.getElementById('ve-tabla-body');
    const tfoot = document.getElementById('ve-tabla-footer');
    if (!tbody) return;

    tbody.innerHTML = '';
    const total = totalGeneral || data.reduce((s, r) => s + (parseFloat(r.Soles) || 0), 0);

    data.forEach(r => {
        const soles = parseFloat(r.Soles) || 0;
        const pct = total > 0 ? ((soles / total) * 100).toFixed(1) : '0.0';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="padding:10px; border:1px solid var(--border-color); font-weight:600;">${r.tDeposito}</td>
            <td style="padding:10px; border:1px solid var(--border-color); text-align:right; font-family:Consolas,monospace; font-weight:bold; color:var(--accent);">${fmtMoneda(soles)}</td>
            <td style="padding:10px; border:1px solid var(--border-color); text-align:center;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <div style="flex:1; height:8px; background:var(--border-color); border-radius:4px; overflow:hidden;">
                        <div style="width:${pct}%; height:100%; background:var(--accent); border-radius:4px;"></div>
                    </div>
                    <span style="font-size:0.85rem; min-width:45px; text-align:right;">${pct}%</span>
                </div>
            </td>`;
        tbody.appendChild(tr);
    });

    if (tfoot) {
        tfoot.innerHTML = `<tr style="font-weight:bold; background:var(--table-header-bg);">
            <td style="padding:10px; border:1px solid var(--border-color);">TOTAL GENERAL</td>
            <td style="padding:10px; border:1px solid var(--border-color); text-align:right; font-family:Consolas,monospace; color:var(--accent); font-size:1.05rem;">${fmtMoneda(total)}</td>
            <td style="padding:10px; border:1px solid var(--border-color); text-align:center;">100%</td>
        </tr>`;
    }

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="empty-state-message"><i class="fas fa-inbox"></i> No hay datos para los filtros seleccionados</td></tr>';
    }
}

async function exportarEstadisticaVentas() {
    const f = getVentasFiltros();
    if (!f.fInicio || !f.fFin) { alert('Seleccione rango de fechas'); return; }

    try {
        let result;
        const esRango = f.fInicio !== f.fFin;

        if (esRango) {
            const params = new URLSearchParams({
                empresa: f.empresa, turno: f.turno,
                fInicio: f.fInicio, fFin: f.fFin
            });
            const res = await fetch(`/api/reports/ventas-estadistica/rango?${params}`);
            if (!res.ok) throw new Error(res.statusText);
            result = await res.json();
        } else {
            const d = new Date(f.fInicio + 'T00:00:00');
            const params = new URLSearchParams({
                empresa: f.empresa, turno: f.turno,
                dia: d.getDate(), mes: d.getMonth() + 1, anio: d.getFullYear()
            });
            const res = await fetch(`/api/reports/ventas-estadistica?${params}`);
            if (!res.ok) throw new Error(res.statusText);
            const raw = await res.json();
            result = { data: raw.data || [], totalGeneral: (raw.data || []).reduce((s, r) => s + (parseFloat(r.Soles) || 0), 0) };
        }

        let csv = 'Tipo de Cobro,Soles,Porcentaje\n';
        const total = result.totalGeneral || 0;
        result.data.forEach(r => {
            const soles = parseFloat(r.Soles) || 0;
            const pct = total > 0 ? ((soles / total) * 100).toFixed(1) : '0.0';
            csv += `"${r.tDeposito}",${soles.toFixed(2)},${pct}%\n`;
        });
        csv += `"TOTAL GENERAL",${total.toFixed(2)},100%\n`;

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `EstadisticaVenta_${f.empresa}_${f.fInicio}_${f.fFin}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);

    } catch (e) {
        console.error('Error exportando:', e);
        alert('Error al exportar');
    }
}
