# Proyecto sediApp — Registro de Progreso

> Este documento revisa el stack y la composición tecnológica del proyecto y se actualizará
> progresivamente conforme el proyecto crezca. Cada mejora o cambio se registrará en el
> historial (sección 6) y se reflejará en las secciones 2 a 5 cuando corresponda.

---

## 1. Descripción del proyecto

Sistema web de gestión empresarial (`sediApp`) orientado a las operaciones de un grupo
de restaurantes (Cocineria, Mar Picante, Abruzzo). Centraliza el **control de equipos**,
el **cambio de precios** con lógica de impuestos (IGV/IGVV), las **operaciones de almacén**
(productos), los **reportes** contables/operativos y módulos de **auditoría** y **recetas**.

Es un backend Node.js/Express que expone una API REST conectada a una base de datos
**Azure SQL**, servida junto a un frontend estático (HTML + JavaScript vanilla) alojado
en la carpeta `public/`.

---

## 2. Stack tecnológico

| Capa | Tecnología | Versión | Notas |
|------|-----------|---------|-------|
| Backend | Node.js | — | No dependencias de sistema |
| Framework HTTP | Express | ^5.2.1 | API REST, CommonJS |
| Sesiones | `express-session` | ^1.18.2 | Sesiones en memoria (`saveUninitialized:false`) |
| Hash de contraseñas | `bcryptjs` | ^3.0.3 | Login y creación de usuarios |
| Base de datos | Azure SQL (SQL Server) | — | Cliente `mssql` ^12.2.0 |
| Exportación Excel | `exceljs` | ^4.4.0 | Reportes `.xlsx` |
| Variables de entorno | `dotenv` | ^17.2.3 | Config en `.env` |
| Middleware HTTP | `body-parser` / `cors` | ^2.2.1 / ^2.8.5 | — |
| Archivos temporales | `tmp` | ^0.2.5 | — |
| Frontend | HTML + CSS + JavaScript vanilla | — | Sin framework ni build step |
| Gráficas | Chart.js (CDN) | ^4.4.1 | `dashboard.html` vía `cdn.jsdelivr.net` |
| Datalabels | chartjs-plugin-datalabels (CDN) | ^2.2.0 | `dashboard.html` vía `cdn.jsdelivr.net` |
| Repositorio | GitHub | — | `Odenfis/sedimApp`, ramas `main` / `testing` |

**Scripts (`package.json`):**
- `npm start` → `node server.js` (puerto `PORT` o 3000)
- `npm test` → no configurado aún

---

## 3. Arquitectura

```
[Navegador]
    │  sirve archivos estáticos (public/)
    ▼
[Express — server.js]   API REST /api/*
    │  express-session (RBAC por permisos)
    ▼
[Azure SQL  ─  db.js]   cliente mssql
```

- **Frontend estático** en `public/`: `login.html`, `dashboard.html` (SPA en un único HTML),
  `script.js` (lógica y llamadas `fetch`), `style.css`, assets de marca.
- **API REST** en `server.js`: rutas bajo `/api/*`, protección mediante `isAuthenticated`
  (verifica `req.session.user`) y permisos de módulo.
- **Conexión a BD** centralizada en `db.js` (`getConnection`, `sql`) con configuración
  desde `.env` (`DB_USER`, `DB_PASS`, `DB_SERVER`, `DB_NAME`, `SESSION_SECRET`).
- **Autorización**: los permisos por rol se cargan al iniciar sesión desde
  `Roles_Permisos` + `Modulos` y se guardan en sesión como arreglo de claves
  (`permisos`), consultado en cada endpoint para control de acceso.

---

## 4. Base de datos (Azure SQL)

### Tablas principales

| Tabla | Uso |
|-------|-----|
| `usuariosweb` | Usuarios del sistema web (credenciales + rol) |
| `Roles`, `Roles_Permisos`, `Modulos` | Roles, permisos y módulos (RBAC). `Modulos` = (id, clave, nombre NOT NULL) |
| `Equipos_Areas` | Áreas (ej. Atención al cliente, Producción) |
| `Equipos_Sedes` | Sedes por área |
| `Equipos_Computadoras` | Computadoras por sede (tipo, hostname, estado) |
| `Productos` | Catálogo (insumos → productos), precios, comisiones, afecto IGV |
| `Precios` | Precios por tema (PreTema1..6) vinculados a producto |
| `Lineas` / `Clases` | Clasificación de productos |
| `Proveedores` | Proveedores (razón social, saldo) |
| `Tablas` | Catálogos genéricos (n_codtabla: 9, 15, 49, 200, 201, 221, 536, 603...) |
| `Valores` | Parámetros (`Igv`, `Igvv`, `AutorizaTurnoWeb`) |
| `Transacciones` | Movimientos de almacén (salidas de insumos) |
| `Doccab` / `Docdet` | Cabecera y detalle de documentos |
| `Caja` | Movimientos de caja / cargos |
| `Ticket_c` / `Ticket_d` | Cabecera/detalle de tickets |
| `Pagos_Tickets` | Pagos de tickets |
| `Recetas` | Recetas de productos (ingredientes) |
| `CtaProveedor` | Cuentas por pagar de proveedores |
| `Actualizaciones_ERP` | Historial del Configurador de Actualizaciones (enlace Drive, SHA256, nota, activo) |

### Store procedures

| SP | Uso |
|----|-----|
| `sp_aud_Tickets_NOpagados` | Auditoría: tickets no pagados |
| `sp_aud_Doc_sinDetalle` | Auditoría: documentos sin detalle |
| `sp_aud_CorrigeCarga` | Auditoría: corrección de carga |
| `sp_aud_NumFactura` | Auditoría: subida a la nube (validación de numeración por empresa/turno) |
| `sp_Ventas_estadistica` | Reporte: estadística de ventas por tipo de cobro (empresa, turno, fecha) |

---

## 5. Módulos / Funcionalidades

| Módulo | Endpoints clave | Estado |
|--------|-----------------|--------|
| **Login / Sesión** | `POST /api/login`, `POST /api/logout`, `GET /api/session`, `GET /api/roles` | ✅ Implementado |
| **Usuarios** | `GET/POST/DELETE /api/users` | ✅ Implementado |
| **Control de Equipos** | `GET /api/structure`, CRUD `/api/equipos`, `/api/sedes` | ✅ Implementado |
| **Cambio de Precios (IGV)** | `GET/PUT /api/precios/:empresa\|:codpro` | ✅ Implementado (factor IGVV dinámico) |
| **Revisión Datos en la Nube** | `POST /api/revision-nube` | ✅ Implementado |
| **Validación de Seguridad** | `POST /api/validate-password` | ✅ Implementado |
| **Productos Almacén (Operaciones)** | `get /api/productos/*` (listas, clases, buscar, nuevo-codigo, CRUD) | ✅ Implementado |
| **Reportes — Salida Insumos** | `POST /api/reports/salida-insumos` (+`/export`) | ✅ Implementado |
| **Reportes — Cargos de Caja** | `POST /api/reports/cargos-caja` (+`/export`) | ✅ Implementado |
| **Cargo Caja Resultado (Dashboard + Matriz)** | `POST /api/cargos/dashboard`, `/api/cargos/detalle`, `/api/cargos/export` | ✅ Implementado |
| **Reportes — Saldo Proveedores** | `POST /api/reports/saldo-proveedores` (+`/export`) | ✅ Implementado |
| **Gestión de Claves (Admin)** | `GET/PUT /api/admin/claves` | ✅ Implementado |
| **Recetas** | `GET/POST /api/recetas`, búsqueda de productos/insumos | ✅ Implementado |
| **Auditoría** | `GET /api/auditoria/*` (tickets, doc-sin-detalle, corregir-carga, subida-nube) | ✅ Implementado |
| **Cierre de Turnos (Operaciones)** | `get /api/operaciones/turnos`, `PUT /api/operaciones/turnos/:id` | ✅ Implementado |
| **Actualizar Sistema ERP Nube (Herramientas)** | `GET /api/herramientas/actualizar-erp` | ✅ Implementado |
| **Configurador de Actualizaciones (Admin)** | `GET/POST /api/admin/config-actualizaciones`, generación dinámica del .bat en `/api/herramientas/actualizar-erp` | ✅ Implementado |
| **Reportes — Estadística de Venta** | `GET /api/reports/ventas-estadistica`, `GET /api/reports/ventas-estadistica/rango` | ✅ Implementado |

---

## 6. Historial de mejoras

> Registrar aquí cada mejora futura con fecha / descripción. Formato sugerido por entrada:

```
**Fecha** — Breve título
- Descripción del cambio
- Archivos: `...`
- Estado: ✅ / 🚧
```

### Inicial (basado en historial de git)

| Fecha | Descripción |
|-------|-------------|
| — | Corrección cambio de turnos |
| — | Implementación reporte proveedores (cuentas por cobrar) |
| — | Reparo de comisión para productos |
| — | Update cierre de operaciones |
| — | Nuevo módulo de auditoría (SP) |
| — | Actualización frontend cambio precios |
| — | Mejora relación IGV + cambio de precios |
| — | Actualización IGV 10.5% (solo testeo) |
| — | Implementación Recetas y corrección de errores |

*(Las fechas de estas entradas históricas se pueden precisar desde `git log`.)*

**06/08/2026** — Nuevo módulo "Cargo Caja Resultado" (dashboard + matriz tipo Dinámica)
- Replica de la hoja "Dinamica" del archivo de referencia `referencias/CargoDeCaja resu.xlsx`
  (matriz `TipoCargo × Mes` de la vista `v_CargosDeCaja`).
- Backend: `POST /api/cargos/dashboard` (KPIs + matriz + totales), `POST /api/cargos/detalle`
  (drill-down a Razón estilo FICO + movimientos), `POST /api/cargos/export` (Excel con `exceljs`).
  Todo agregado en SQL (la vista tiene ~117k filas).
- Frontend: nueva sección bajo "Saldo Proveedores" en `dashboard.html` con filtros
  (Sede/Empresa, Año, Turno, TipoDoc, rango de fechas), tarjetas KPI, gráficas con
  Chart.js (CDN) y matriz clicable que abre modal con desglose por Razón.
- Permisos: reutiliza `reportes`.
- Archivos: `server.js`, `public/dashboard.html`, `public/script.js`.

**06/08/2026** — Mejoras de UI en "Cargo Caja Resultado"
- Alineación de la barra de filtros usando la clase existente `.report-filters-group`
  (filtros agrupados a la izquierda, botones Consultar/Exportar a la derecha vía
  `justify-content: space-between` de `.report-top-bar`).
- Toast de carga no intrusivo (`#cc-toast` / `.cc-toast`, fijo abajo-centro con fade):
  se muestra al pulsar **Consultar** y el botón se deshabilita con "Consultando…"
  hasta recibir la respuesta (evita doble clic y da feedback del proceso).
- Tooltips de las gráficas: en la torta/dona `boxPadding: 18` + formato de moneda;
  en las barras `boxPadding: 8` + formato de moneda (`fmtMoneda`).
- Leyenda del gráfico de dona alineada a la derecha (cuadrados de 12px, `padding: 12`).
- Archivos: `public/dashboard.html`, `public/script.js`, `public/style.css`.

**14/08/2026** — Auditoría Subida Nube (sp_aud_NumFactura)
- Nuevo ítem en el submenú Auditoría ("Auditoria Subida Nube") debajo de "Docs Sin Detalle".
- El SP usa `PRINT` en lugar de `SELECT`; el backend captura esos mensajes con
  `request.on('info')` (evento del driver `mssql` 12) y los estructura por documento.
- Backend: `GET /api/auditoria/subida-nube?emp=&tur=` (permiso `auditoria`) que ejecuta
  `sp_aud_NumFactura` y devuelve `{ resultados, resumen }` (Facturas, Boletas, Notas de
  venta, Tickets → estado ok/error).
- Frontend: vista `#view-subida-nube` con filtros Empresa (tabla 200) + Turno (1/2) y
  botón Ejecutar; visualización tipo semáforo (tarjetas por documento: verde OK / rojo
  Error) + franja de resumen global con conteos.
- Archivos: `server.js`, `public/dashboard.html`, `public/script.js`, `updates/progress.md`.

**24/08/2026** — Nuevo módulo "Actualizar Sistema ERP Nube" (Herramientas)
- Objetivo: distribuir a los clientes la actualización del ERP (RES_*.exe al Escritorio,
  Res*.dll a `C:\Windows\SysWOW64` + registro con regsvr32 de 32 bits) sin intervención
  técnica manual.
- Nuevo script autocontenido `updates/Actualizar_ERP_Nube.bat` (ASCII, CRLF):
  auto-elevación admin vía PowerShell (`fltmc` + `Start-Process -Verb RunAs`), descarga
  del ZIP desde Google Drive con `curl.exe` (fallback `Invoke-WebRequest`, URL pública con
  `confirm=t`), validación SHA256 fijada en el script (`certutil`), extracción con `tar.exe`,
  cierre de procesos RES_*.exe (`taskkill`), copia de EXE al Escritorio real del usuario
  (`[Environment]::GetFolderPath('Desktop')`, OneDrive-safe) y DLLs a SysWOW64, registro
  con `C:\Windows\SysWOW64\regsvr32.exe /s`, log en `%TEMP%\sedim_instalador.log`,
  resumen OK/ERRORES y limpieza. Requiere Windows 10 (1803+)/11.
- Backend: `GET /api/herramientas/actualizar-erp` (permiso `herramientas`) que sirve el
  .bat con `res.download` (no queda expuesto como estático).
- Frontend: ítem "Actualizar Sistema ERP Nube" en submenú Herramientas
  (`data-module="herramientas"`, sin migración BD) y vista `#view-actualizar-erp`
  con instrucciones y botón de descarga (ancla directa, sesión vía cookie).
- Hash actual del ZIP: `aaf342cb0cdb1fa5d0e021a2750bd127ece3138d813e54dc53b4e62a79b38cc4`
  (regenerar con `certutil -hashfile actualizacionSedim.zip SHA256` si cambia el ZIP).
- Probado en PC cliente Windows real (24/08/2026): funcionó muy bien, todo salió
  excelente — descarga desde Drive, validación SHA256, EXE al Escritorio, DLLs a
  SysWOW64 y registro con regsvr32 correctos.
- Archivos: `updates/Actualizar_ERP_Nube.bat`, `server.js`, `public/dashboard.html`,
  `updates/progress.md`.
- **Fix 24/08/2026**: el script se detenía tras el banner con solo "Presione una tecla":
  paréntesis sin escapar `(no es de 64 bits)` dentro del bloque `if not exist SysWOW64`
  cerraban el bloque antes de tiempo, dejando `pause`/`exit /b` huérfanos que se ejecutaban
  siempre. Corregido (mensaje con guiones) + fallback `Expand-Archive` cuando falta
  `tar.exe` (Windows 10 < 1803). Auditados todos los bloques del archivo.
- Estado: ✅

**24/08/2026** — Configurador de Actualizaciones (solo rol Administrador)
- Objetivo: eliminar la edición manual del `.bat`. El administrador pega solo el enlace
  de Google Drive del `.zip` en una nueva vista y el servidor genera el instalador
  dinámicamente al descargarlo.
- BD (script re-ejecutable `sql/setup_configurador_actualizaciones.sql`):
  tabla `Actualizaciones_ERP` (drive_id, drive_url, zip_name, sha256 NULL, nota,
  activo, creado_por, fecha_creacion), módulo nuevo `config_actualizaciones` asignado
  SOLO al rol 'Administrador' vía `Roles_Permisos`, y seed con los valores vigentes.
  SHA256 es opcional: si queda vacío, el .bat generado omite la validación de integridad
  (queda el chequeo de tamaño > 1MB).
- Plantilla: `updates/Actualizar_ERP_Nube.bat` ahora usa marcadores `@@DRIVE_ID@@`,
  `@@ZIP_NAME@@`, `@@ZIP_SHA256@@`; el paso [2/6] quedó condicional (`if "%ZIP_SHA256%"==""`
  → salta a `:skip_hash`). Se preservó ASCII + CRLF.
- Backend (`server.js`): middleware `requiereConfigActualizaciones`,
  `GET /api/admin/config-actualizaciones` (config activa + historial TOP 20) y
  `POST /api/admin/config-actualizaciones` (extrae el ID del enlace con regex que soporta
  `/file/d/ID`, `?id=ID`, `/d/ID`; valida ID `[A-Za-z0-9_-]{10,}` y SHA256 hex-64;
  transacción: desactiva anterior + inserta nuevo). `GET /api/herramientas/actualizar-erp`
  ahora lee la config activa, sustituye los marcadores y sirve el .bat generado; si no hay
  config en BD o falla, usa valores por defecto / sirve el archivo original (fallback).
- Frontend: ítem independiente "Configurador de Actualizaciones" debajo de
  "Usuarios Sistema" (`data-module="config_actualizaciones"`, se oculta solo para roles
  sin el permiso vía `aplicarPermisos()`); vista `#view-config-actualizaciones` con
  formulario (enlace, SHA256 opcional, nota), tarjeta "Configuración vigente" y tabla de
  historial. Funciones `cargarConfigActualizacion()` / `guardarConfigActualizacion()`
  (+ helper `escapeHtmlCfg`) en `script.js`.
- Archivos: `sql/setup_configurador_actualizaciones.sql`, `updates/Actualizar_ERP_Nube.bat`,
  `server.js`, `public/dashboard.html`, `public/script.js`, `updates/progress.md`.
- **Ejecución 24/08/2026**: script aplicado a Azure SQL (tabla creada, módulo + permiso
  asignado solo al rol 'administrador' — en minúscula en la BD, se usa `LOWER(nombre)`
  para no depender del collation, y seed insertado). Ajuste del script: `Modulos`
  requiere la columna `nombre` (NOT NULL), el INSERT inicial sin ella fallaba.
  Verificado: login de administrador devuelve `config_actualizaciones`; otros roles no.
- Estado: ✅

**24/08/2026** — Rediseño visual del sidebar
- Objetivo: menú ordenado con textos largos ("Configurador de Actualizaciones",
  "Actualizar Sistema ERP Nube", etc.), que antes se cortaban abruptamente.
- Textos: ahora envuelven a 2 líneas limpias (`white-space: normal` +
  `overflow-wrap`) con el ícono alineado a la primera línea.
- Contenedor: ancho 260px → 284px (`--sidebar-width`); menú con scroll propio
  (scrollbar fina discreta) para cuando hay submenús abiertos; móvil (≤1024px)
  alineado con la variable en lugar de números fijos (`left`/`translateX`/`width`).
- Ítem activo: barra de acento izquierda (`box-shadow inset 3px`) + tinte suave
  (`color-mix(in srgb, var(--accent) 14%, transparent)` con fallback); aplica también
  a ítems activos de submenú. Funciona en tema claro y oscuro.
- Submenús: jerarquía visual con línea guía vertical izquierda, fuente menor
  (0.88rem), color secundario y micro-animación fade al desplegar (`@keyframes submenuIn`).
- HTML: `title` en los 21 ítems del menú (tooltip con nombre completo, clave en modo
  colapsado) y estilos inline del `submenu-toggle` reemplazados por clase `.submenu-label`.
- Sin cambios de JavaScript (`aplicarPermisos()`, `toggleSubmenu()`, `showView()` intactos).
- Archivos: `public/dashboard.html`, `public/style.css`.
- Estado: ✅

**24/08/2026** — Pulido de alineación del sidebar (solo CSS)
- Variables de ritmo dentro de `.sidebar`: `--sb-pad-x` (13px), `--sb-icon-box`
  (24px columna fija de ícono) y `--sb-gap` (12px hueco ícono→texto uniforme en los
  3 niveles; el submenú usaba 10px).
- Centrado vertical exacto de íconos: cajas de altura igual a una línea de texto
  (`1.283rem` nivel principal/toggles = 0.95rem×1.35; `1.188rem` submenús = 0.88rem×1.35)
  con flex centering — sustituye el parche `margin-top: 3px`; funciona con texto de
  1 o 2 líneas.
- Línea guía del submenú alineada al eje central del ícono del grupo padre vía
  `calc(var(--sb-pad-x) + var(--sb-icon-box) / 2 - 1px)`.
- Modo colapsado intacto (sus overrides `!important` siguen teniendo prioridad);
  sin cambios en HTML ni JS.
- Archivos: `public/style.css`.
- Estado: ✅

**26/08/2026** — Nuevo módulo "Estadística de Venta" (Reportes)
- Objetivo: dashboard visual para el administrador de sedes que resuma ventas por tipo
  de cobro (Efectivo vs Depósitos) con gráficas interactivas, KPIs y tabla resumen.
- SP utilizado: `sp_Ventas_estadistica` (empresa char(40), turno int, dia/mes/anio int).
  Devuelve `tipo`, `tDeposito` (resuelto desde tabla 537) y `Soles` (suma por grupo).
- Sedes permitidas (tabla 200, n_numero 2/4/6): **Cocineria**, **Mar Picante 1**,
  **Inversiones Abruzzo Sac** — selector en UI con `c_describe` como valor enviado al SP.
- Turnos limitados a 1 y 2.
- Backend (`server.js`):
  - `GET /api/reports/ventas-estadistica?empresa=&turno=&dia=&mes=&anio=` — ejecuta el SP
    para un solo día, devuelve `{ data: [{ tipo, tDeposito, Soles }] }`.
  - `GET /api/reports/ventas-estadistica/rango?empresa=&turno=&fInicio=&fFin=` — itera
    por cada día del rango, ejecuta el SP por día y agrega resultados: `{ data, diario, totalGeneral }`.
  - Validación de empresa (white list) y turno (1|2) en ambos endpoints.
  - Permisos: reutiliza `reportes`.
- Frontend (`public/dashboard.html`):
  - Nuevo ítem en submenú Reportes: "Estadística de Venta" (`fa-chart-bar`).
  - Vista `#view-reporte-ventas-estadistica` con filtros: Sede (select 3 opciones),
    Turno (1/2), Desde/Hasta (rango de fechas), botones Consultar y Exportar.
  - 4 tarjetas KPI con iconos: Total Ventas, Efectivo, Depósitos, % Efectivo.
  - 3 gráficas Chart.js: barras por tipo de cobro, dona efectivo vs depósitos,
    evolución diaria (se oculta si es un solo día).
  - Tabla resumen con barra de progreso por tipo y total general.
- Frontend (`public/script.js`):
  - `cargarEstadisticaVentas()` — detecta single-day vs rango, llama al endpoint
    correspondiente y delega render.
  - `renderKPIsVentas()` — actualiza las 4 tarjetas KPI.
  - `renderChartsVentas()` — destruye/recrea Chart.js (barras, dona, línea).
  - `renderTablaVentas()` — tabla dinámica con porcentajes visuales.
  - `exportarEstadisticaVentas()` — exporta a CSV.
  - Integración en `showView()` con `setDefaultVentasFechas()`.
- Frontend (`public/style.css`):
  - Clases `.ve-kpi-grid`, `.ve-kpi-card`, `.ve-kpi-icon`, `.ve-kpi-label`, `.ve-kpi-value`.
  - Hover effects en tarjetas KPI (`translateY(-2px)` + shadow).
  - Responsive: grid de KPIs a 2 columnas en móvil (`≤768px`).
- **Fix 26/08/2026**: la vista se colocó inicialmente fuera del `<div class="content">`,
  por lo que `getElementById` no la encontraba. Reposicionada correctamente dentro del
  contenedor `.content`, al mismo nivel que las demás vistas.
- Archivos: `server.js`, `public/dashboard.html`, `public/script.js`, `public/style.css`.
- Estado: ✅

**26/08/2026** — Responsive completo (tablet + móvil)
- Objetivo: adaptar toda la plataforma a tablets (10 pulgadas) y móviles sin romper
  el comportamiento en desktop.
- **login.html**: agregado `<meta name="viewport">` — el login ahora escala correctamente.
- **Sidebar**: breakpoint 1024px → 992px; off-canvas en ≤992px con overlay, ancho reducido
  a 260px en ≤768px y 240px en ≤480px; auto-cierre al seleccionar una vista en móvil.
- **5 breakpoints** (de mayor a menor):
  - `≤1200px` — Filtros de revisión a 2 columnas
  - `≤992px` — Sidebar off-canvas, filtros 2×2, modales 85%, KPIs 2 cols (**nuevo**)
  - `≤768px` — Sidebar 260px, filtros 1 col, modales 95%, charts apilados,
    overflow-x corregido en `.dashboard-container` (`visible` → `hidden`)
  - `≤480px` — KPIs 1 col, login compacto, toast ancho completo (**nuevo**)
  - `≤800px alto` — Modales con `max-height: 95vh`
- **Modales**: transiciones suaves (85% → 95% → 98%)
- **Filtros**: progresión `2 por fila → 1 columna` en vez del salto abrupto anterior
- **Componentes**: paginación con `flex-wrap`, recetas con `flex-wrap`, computer-grid
  reducido, tablas con `min-width` reducido, toast responsive, botones compactos.
- **script.js**: `toggleSidebar()` y resize listener usan 992px; `showView()` cierra
  sidebar automáticamente en ≤992px.
- Archivos: `public/login.html`, `public/style.css`, `public/script.js`.
- Estado: ✅

**26/08/2026** — Fix gráfico de barras "Ventas por Tipo de Cobro"
- **Problema**: las barras se solapaban entre sí al tener pocos tipos de cobro
  (ej: Cocineria, Turno 2). Causa: `barThickness: 40` fijo sin `barPercentage` ni
  `categoryPercentage`, provocando que Chart.js agrandara las barras para llenar
  el espacio disponible.
- **Solución**:
  - Dataset: `barThickness: 40` → `maxBarThickness: 80` + `barPercentage: 0.7` +
    `categoryPercentage: 0.8` (barras con separación del 30%, crecen libremente
    hasta 80px máximo).
  - Scales: nuevo `scales.x` con `autoSkip: false`, `maxRotation: 45°`, grid vertical
    oculto; `scales.y` con grid horizontal sutil (`rgba(0,0,0,0.06)`).
  - Canvas: height `130` → `180` para más respiro vertical.
  - Plugin `chartjs-plugin-datalabels@2.2.0` (CDN): muestra monto exacto encima
    de cada barra (`anchor: 'end'`, `align: 'top'`, bold 11px, se adapta al tema
    dark/light vía `--text-color`). Registrado globalmente en DOMContentLoaded.
  - Datalabels desactivado en gráfico de dona y evolución (evitar ruido visual).
- Archivos: `public/dashboard.html` (CDN + canvas height), `public/script.js`
  (config chart, scales, plugins, registro).
- Estado: ✅

**26/08/2026** — Fix títulos de gráficas superpuestos con datalabels
- **Problema**: los montos de los datalabels (encima de las barras) se mezclaban
  con el título del gráfico ("Ventas por Tipo de Cobro") renderizado por el plugin
  `title` de Chart.js dentro del mismo canvas, especialmente con barras altas.
- **Solución (Opción B)**: títulos como HTML `<h3>` fuera del canvas, eliminando
  la superposición de forma definitiva.
  - Títulos movidos a `<h3>` con estilo inline (`font-size: 0.95rem`, `font-weight: 700`,
    `color: var(--text-color)`) dentro del `.card-simple` de cada gráfico, separados
    del canvas con `padding-bottom: 8px`.
  - Plugin `title` eliminado de los 3 charts (barras, dona, evolución).
  - Canvas de barras: height `180` → `200`; dona: `130` → `160`.
  - `layout.padding.top: 35` en chart de barras (respiro para datalabels).
  - Limpieza: `layout.padding` incorrecto removido del chart de evolución.
- Archivos: `public/dashboard.html`, `public/script.js`.
- Estado: ✅

**27/08/2026** — Fixes de responsive móvil/tablet (sidebar + Configuración Vigente)
- **Problema**: a ~440×956 el sidebar quedaba desalineado, "Admin Panel" se recortaba y
  la "Configuración Vigente" del Configurador de Actualizaciones desbordaba la vista.
- **Sidebar desalineado**: `.sidebar` usaba `box-sizing: content-box`, por lo que
  `width: 240px` móvil realmente ocupaba 261px (240 + padding + borde). Añadido
  `box-sizing: border-box` para que `width` sea el ancho real y `translateX`/`left`
  coincidan sin que el menú sobresalga ni se descuadre.
- **"Admin Panel" recortado**: se añadió `flex-shrink: 0` a `header-tools`/botones y
  `min-width: 0` + `text-overflow` en `.brand`; el brand vuelve a caber completo
  (verificado `clip=false`).
- **Configuración Vigente con overflow**: el `<code>` del SHA256 y el `<a>` del enlace
  largo usaban `nowrap` y desbordaban el card horizontalmente (medido 658px contra 376px
  del card). Reglas para que enlaces y `code` partan la línea
  (`word-break: break-all` + `overflow-wrap: anywhere`) — sin overflow, `scrollW == clientW`.
- Archivos: `public/style.css`.
- Estado: ✅

**27/08/2026** — Sidebar móvil como drawer ancho (85-90%) + reinicio de submenús
- **Problema**: a pesar de los fixes previos, el menú seguía percibiéndose "recortado"
  porque el sidebar era demasiado angosto (240px) para el contenido real (submenús con
  textos largos como "Configurador de Actualizaciones", "Actualizar Sistema ERP Nube").
- **Drawer ancho** (patrón estándar de apps móviles): el sidebar ahora ocupa ~85-90% del
  ancho del viewport mediante la variable `--drawer-width` coherente entre `width`,
  `left` y `translateX`:
  - `≤992px`: `min(88vw, 380px)`
  - `≤768px`: `min(90vw, 340px)`
  - `≤480px`: `min(92vw, 320px)`
  - "Configurador de Actualizaciones" ahora cabe en UNA línea a 440px (antes 2-3 líneas).
- **Reinicio de submenús al abrir**: en `toggleSidebar()` (modo móvil), al abrir el drawer
  se cierran todos los submenús (`submenu.open` → sin clase) y se resetean sus flechas a
  `rotate(0deg)`; el menú se muestra limpio desde el estado plegado.
- Auto-cierre al elegir una opción ya existía en `showView()` (≤992px), se mantuvo.
- Verificado por emulación con viewport real (440/390/320/768/800px): drawer desplegado
  completo (`translateX` correcto, `x=0`) y submenús cerrados al abrir.
- Archivos: `public/style.css`, `public/script.js`.
- Estado: ✅

**27/08/2026** — "Ambos Turnos" en Estadística de Venta (sin tocar el SP)
- **Objetivo**: a la vista de Estadística de Venta faltaba poder ver la estadística
  sumando ambos turnos (1 y 2) por sede. Se pidió hacerlo sin modificar el SP
  `sp_Ventas_estadistica` (que solo acepta un turno 1|2 por llamada y devuelve filas
  `tipo/tDeposito/Soles` sin columna de turno).
- **Solución (suma en backend)**: se ejecuta el SP una vez por turno y se acumulan los
  `Soles` por `tipo` (y por día en el rango). Retrocompatible (`turno=1|2` intacto).
- `server.js`:
  - `GET /api/reports/ventas-estadistica`: ahora acepta `turno=0` (ambos). La validación
    pasó de `1|2` a `0|1|2`. Si `turno=0`, ejecuta el SP con turno 1 y turno 2 y fusiona
    las filas por `tipo` (suma `Soles`).
  - `GET /api/reports/ventas-estadistica/rango`: acepta `turno=0`; por cada día iterar
    turno 1 y turno 2, acumulando en `acumulado[tipo]`, `diario` y `totalGeneral`.
- `public/dashboard.html`: opción `<option value="0">Ambos Turnos</option>` al inicio del
  selector `#ve-turno`.
- `public/script.js`: sin cambios de render ni export — `getVentasFiltros()` ya pasa el
  turno 0 y KPIs/gráficas/tabla/CSV agregan por `tipo` (compatible con la suma de turnos).
- Verificado por prueba aislada de la lógica de acumulación (un día y rango): turno 0
  suma correctamente ambos turnos. Servidor arranca y sirve los archivos (200).
- Archivos: `server.js`, `public/dashboard.html`.
- Estado: ✅

**27/08/2026** — Barras "Ventas por Tipo de Cobro" sin mezclarse (gráfico híbrido)
- **Problema**: al haber varios tipos de cobro (p. ej. con "Ambos Turnos") las barras
  verticales se comprimían hasta pegarse entre sí y perdían la separación, percibiéndose
  "mezcladas"; en pantallas angostas (celular) era peor por el canvas estrecho y las
  etiquetas largas rotadas 45°.
- **Solución (gráfico híbrido automático)** en `renderChartsVentas()` (`public/script.js`):
  - Con `> 4` tipos de cobro cambia a **barras horizontales** (`indexAxis: 'y'`), donde
    cada tipo es una fila con su nombre legible sin rotación y las barras no se pisan.
    Con `≤ 4` tipos se mantiene el gráfico vertical original (limpio en turnos individuales).
  - Se calcula `numTipos` y `horizontal` según `data.length`.
  - Altura del canvas adaptada (`maintainAspectRatio: false`):
    `height = max(220, n*46)` horizontal / `max(200, n*50)` vertical → cada barra con aire.
  - Dataset: `maxBarThickness` `36` horizontal / `90` vertical; `barPercentage`/`categoryPercentage`
    ajustados por orientación.
  - Datalabels: vertical `anchor:'end'/align:'top'`; horizontal `anchor:'center'/align:'end'`/`offset:8`.
  - Tooltip: usa `parsed.x` (horizontal) o `parsed.y` (vertical) según `horizontal`.
  - Escalas: en horizontal el eje de valores es `x` (`beginAtZero`, formato S/) y la
    categoría `y` (labels sin rotación, `autoSkip:false`); en vertical se mantiene el actual.
- Solo frontend; no se toca backend ni el SP. Chart.js v4.4.1 (CDN) soporta
  `indexAxis:'y'` nativamente.
- Verificado por probe con Chart.js: el canvas no colapsa y mantiene el alto dinámico
  en ambas orientaciones (vertical 2 tipos=200, 7 tipos=350; horizontal 2=220, 7=322).
  Servidor arranca y sirve los archivos (200).
- Archivos: `public/script.js`.
- Estado: ✅

**27/08/2026** — Fix "efecto de bajada que nunca acaba" en barras horizontales
- **Problema**: tras el gráfico híbrido, el canvas comprimido con `maintainAspectRatio:false`
  hacía que el contenedor creciera en altura sin fin (efecto "bajada que nunca acaba").
  Causa: el canvas es hijo directo de `.card-simple` (sin altura fija); con
  `responsive:true` + `maintainAspectRatio:false`, Chart.js re-medía el contenedor y lo
  hacía crecer en un bucle.
- **Solución**: envolver el canvas en un `<div id="ve-chart-depositos-wrap">` con
  `position:relative; height:200px;` (`public/dashboard.html`) y desde
  `renderChartsVentas()` (`public/script.js`) fijar la altura dinámica en ese wrapper:
  `height = max(220, n*46)` horizontal / `max(200, n*50)` vertical. Con el wrap de altura
  explícita, Chart.js llena exactamente esa altura y ya no re-crece el contenedor.
- Verificado por probe: con wrapper de altura fija el alto (200px vertical / 322px
  horizontal) permanece **estable** tras redimensionar (sin crecimiento infinito).
- Archivos: `public/dashboard.html`, `public/script.js`.
- Estado: ✅

**27/08/2026** — Mejora de barras "Ventas por Tipo de Cobro" (grosor proporcional + alineación horizontal)
- **Problemas**: (1) en desktop las barras verticales se veían muy pequeñas/delgadas con
  pocos tipos de cobro; (2) en modo horizontal (varios tipos) las descripciones/valores
  no quedaban bien alineados (el monto se dibujaba dentro de barras cortas y se salía).
- **Solución** en `renderChartsVentas()` (`public/script.js`):
  - **Grosor proporcional** con `maxBarThickness` según orientación: `150` vertical /
    `40` horizontal, con `barPercentage` `0.55` (v) / `0.7` (h) y `categoryPercentage`
    `0.9` (v) / `0.8` (h). Barras nunca delgadas y equilibradas en desktop y móvil.
  - **Alturas adaptadas**: `Math.max(260, n*85)` vertical / `Math.max(240, n*46)`
    horizontal, fijadas en el wrapper (sin bucle de crecimiento).
  - **Datalabel horizontal** reposicionado a `anchor:'end'/align:'end'/offset:6/clamp:true`
    → el monto queda **fuera de la barra**, alineado a la derecha y sin salirse del lienzo.
  - `layout.padding.right: 60` en horizontal y `suggestedMax = max*1.3` en el eje X para
    reservar espacio al monto más largo (formato "S/ 1,234.00").
  - Vertical: `layout.padding.top: 40` para los datalabels superiores.
- Verificado por probe con Chart.js real:
  - Vertical 3 tipos: grosor 72px (desktop 480px) / 46px (móvil 320px); no delgadas.
  - Horizontal 8 tipos: grosor 23px por fila; 60px reservados a la derecha del chart
    para el valor (datalabel fuera, no cortado).
  - Alturas estables (260px v / 368px h) tras redimensionar, sin bucle.
  - Servidor arranca y sirve los archivos (200).
- Archivos: `public/script.js`.
- Estado: ✅

**27/08/2026** — Ajuste fino barras "Ventas por Tipo de Cobro" (alineación horizontal + alto compacto)
- **Problemas**: (1) en modo horizontal la etiqueta "Efectivo" se desplazaba un poco a la
  derecha respecto a las demás (labels centrados por defecto); (2) sobraba espacio en la
  parte inferior de la tarjeta tras generarse la gráfica.
- **Solución** en `renderChartsVentas()` (`public/script.js`):
  - Alineación uniforme de los labels del eje de categorías horizontal con
    `ticks.align: 'start'` → todos los nombres quedan alineados por el mismo borde
    izquierdo (ya no se "mueven" por el centrado por defecto).
  - Alto vertical del gráfico horizontal más compacto: `Math.max(240, n*46)` →
    `Math.max(200, n*40)`, y `barPercentage` `0.7→0.75` / `categoryPercentage` `0.8→0.9`
    para que las barras usen mejor el alto (menos vacío abajo y entre filas).
  - Vertical sin cambios en su altura.
- Verificado por probe con Chart.js: con 5 tipos el wrapper pasa de 240px a 200px y las
  barras usan el alto de forma más eficiente (rango barras 158px en 200px de wrapper);
  con 8 tipos wrapper 320px, barras 277px. Grosor de barra horizontal ~23-24px (legible).
- Archivos: `public/script.js`.
- Estado: ✅

**27/08/2026** — Alineación final de la vista horizontal "Ventas por Tipo de Cobro"
- **Problema persistente**: la etiqueta "Efectivo" se desplazaba a la derecha y no se
  alineaba con los demás ítems de la vista horizontal (a pesar del intento previo con
  `align:'start'`, que la dejaba hacia la izquierda y no satisfacía el look buscado).
- **Solución** en `renderChartsVentas()` (`public/script.js`):
  - `ticks.align: 'start'` → **`'end'`** en el eje de categorías horizontal: todos los
    nombres ("Efectivo", etc.) quedan alineados **por el borde derecho, junto al gráfico**,
    parejos entre sí (apariencia estándar de gráficos de barras horizontales).
  - **Ordenación de datos por monto descendente** en el gráfico de barras (creando una
    copia `dataBarras` con `[...data].sort(...)` antes de mapear a labels/valores), por lo
    que las barras se muestran de mayor a menor. No afecta a la dona ni a la tabla
    (siguen usando `data` original).
- Verificado por probe con Chart.js: el modo horizontal con `align:'end'` renderiza sin
  errores, con zona de labels de 57px y grosor de barra de 42px (3 ítems). La ordenación
  por monto produce el orden correcto (Plin 700 → Efectivo 400 → Yape 120 → Tarjeta 50).
  Servidor arranca y sirve los archivos (200).
- Archivos: `public/script.js`.
- Estado: ✅

**27/08/2026** — Mejora integral de vista vertical "Ventas por Tipo de Cobro" + fix labels
- **Problemas**: (1) en modo vertical las barras eran demasiado anchas y los labels rotados
  45° aparecían muy lejos del eje y desalineados; (2) labels largos (p.ej. "Tarjeta de
  Crédito") desbordaban sin truncar; (3) el eje X mostraba números (0,1,2...) en lugar de
  las descripciones de tipo de cobro ("Niubiz", "Yape", etc.).
- **Solución** en `renderChartsVentas()` (`public/script.js`):
  - **Grosor reducido**: `maxBarThickness: 150→50`, `barPercentage: 0.55→0.45`,
    `categoryPercentage: 0.9→0.7` — barras más estrechas, mucho más espacio para labels.
  - **Rotación reducida**: `45°→30°` para mayor legibilidad.
  - **Fuente reducida**: `11→10px`.
  - **Alineación de labels rotados**: `align:'center'→'end'` + `padding: 4` — ancla el
    final del texto rotado al eje, evitando la separación excesiva.
  - **Grid sutil en X restaurado**: `grid: { display: true, color: 'rgba(0,0,0,0.03)',
    drawTicks: true, tickLength: 8 }` — referencia visual sin ruido.
  - **Padding inferior aumentado**: `bottom: 30→50` para aire suficiente bajo labels rotados.
  - **Truncado de labels largos**: `callback: function(value, index) { ... }` que usa
    `labels[index]` para tratar labels > 15 chars con `substring(0,12)+'…'`.
  - **Type category explícito**: `type: 'category'` en eje X vertical para que Chart.js
    trate los labels como categorías en vez de interpretarlos como índices numéricos.
  - **Type linear explícito**: `type: 'linear'` en eje X horizontal (eje de valores).
- **Fix raíz del bug "números en vez de labels"**: el `tick.callback` de Chart.js recibe
  el valor numérico del tick (índice), no el string del label. La arrow function anterior
  `v => v.length > 15` operaba sobre un número (`number.length` es `undefined`), devolviendo
  siempre el índice crudo. Se reemplazó por `function(value, index) { const l = labels[index]; ... }`
  que busca el label real vía el parámetro `index`.
- Verificado por probe con Chrome headless: labels renderizados correctamente
  ("Efectivo", "Niubiz", "Yape", "Plin", "Tarjeta Crédito"), grosor de barra ~33px,
  chart area 181px en wrapper de 300px.
- Archivos: `public/script.js`.
- Estado: ✅

---

## 7. Próximos pasos

> (Pendiente — se completará con las próximas mejoras del proyecto.)

_(en blanco)_

---

## 8. Notas

- El archivo `data.json` en la raíz contiene datos legacy/hardcodeados del
  "Control de Equipos" (áreas/sedes/computadoras) que parece preexistir a la migración
  a Azure SQL; el backend lee de BD vía `/api/structure`.
- La autenticación usa sesiones en memoria (no persistidas): reiniciar el servidor
  cierra todas las sesiones; considerar `connect-session-store` para producción.
- No existen tests ni linter configurados en `package.json` (a mejorar).