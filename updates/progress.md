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