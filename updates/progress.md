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
| `Roles`, `Roles_Permisos`, `Modulos` | Roles, permisos y módulos (RBAC) |
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

### Store procedures

| SP | Uso |
|----|-----|
| `sp_aud_Tickets_NOpagados` | Auditoría: tickets no pagados |
| `sp_aud_Doc_sinDetalle` | Auditoría: documentos sin detalle |
| `sp_aud_CorrigeCarga` | Auditoría: corrección de carga |

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
| **Auditoría** | `GET /api/auditoria/*` (tickets, doc-sin-detalle, corregir-carga) | ✅ Implementado |
| **Cierre de Turnos (Operaciones)** | `get /api/operaciones/turnos`, `PUT /api/operaciones/turnos/:id` | ✅ Implementado |

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