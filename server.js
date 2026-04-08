const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const ExcelJS = require('exceljs');
const { getConnection, sql } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, maxAge: 1000 * 60 * 60 * 24 }
}));

function isAuthenticated(req, res, next) {
    if (req.session.user) return next();
    res.status(401).json({ message: 'No autorizado' });
}

app.get('/', (req, res) => res.redirect('/login.html'));

// ==========================================
//  LOGIN Y SESIÓN
// ==========================================
app.post('/api/login', async (req, res) => {
    const { usuario, password } = req.body;
    try {
        const pool = await getConnection();
        const result = await pool.request().input('usuario', sql.NVarChar, usuario)
            .query('SELECT u.*, r.nombre as rol_nombre FROM usuariosweb u LEFT JOIN Roles r ON u.rol_id = r.id WHERE u.usuario = @usuario');

        if (result.recordset.length === 0) return res.status(400).json({ message: 'Usuario no encontrado' });
        const user = result.recordset[0];
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ message: 'Contraseña incorrecta' });

        const permisosResult = await pool.request().input('rol_id', sql.Int, user.rol_id)
            .query('SELECT m.clave FROM Roles_Permisos rp JOIN Modulos m ON rp.modulo_id = m.id WHERE rp.rol_id = @rol_id');

        req.session.user = {
            id: user.id, usuario: user.usuario, nombre: user.nombre,
            rol: user.rol_nombre, permisos: permisosResult.recordset.map(row => row.clave)
        };
        req.session.save(() => res.json({ message: 'Login exitoso', user: req.session.user }));
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ message: 'Sesión cerrada' }); });
app.get('/api/session', (req, res) => { req.session.user ? res.json({ user: req.session.user }) : res.status(401).send(); });
app.get('/api/roles', isAuthenticated, async (req, res) => {
    try { const pool = await getConnection(); const result = await pool.request().query('SELECT id, nombre FROM Roles'); res.json(result.recordset); } catch (e) { res.status(500).send(e.message); }
});

// ==========================================
//  USUARIOS
// ==========================================
app.get('/api/users', isAuthenticated, async (req, res) => {
    if (!req.session.user.permisos.includes('usuarios')) return res.status(403).json({ message: 'Sin permisos' });
    const pool = await getConnection();
    const result = await pool.request().query(`SELECT u.id, u.usuario, u.nombre, r.nombre as rol FROM usuariosweb u LEFT JOIN Roles r ON u.rol_id = r.id`);
    res.json(result.recordset);
});
app.post('/api/users', isAuthenticated, async (req, res) => {
    const { usuario, password, nombre, rol_id } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    try {
        const pool = await getConnection();
        await pool.request().input('u', sql.NVarChar, usuario).input('p', sql.NVarChar, hashedPassword).input('n', sql.NVarChar, nombre).input('r', sql.Int, rol_id)
            .query('INSERT INTO usuariosweb (usuario, password, nombre, rol_id) VALUES (@u, @p, @n, @r)');
        res.json({ message: 'Creado' });
    } catch (err) { res.status(500).json({ message: 'Error' }); }
});
app.delete('/api/users/:id', isAuthenticated, async (req, res) => {
    const pool = await getConnection(); await pool.request().input('id', sql.Int, req.params.id).query('DELETE FROM usuariosweb WHERE id = @id'); res.json({ message: 'Eliminado' });
});

// ==========================================
//  CONTROL DE EQUIPOS
// ==========================================
// --- EQUIPOS (CONTROL DE EQUIPOS) ---
app.get('/api/structure', isAuthenticated, async (req, res) => {
    try {
        const pool = await getConnection();
        const areas = (await pool.request().query("SELECT * FROM Equipos_Areas ORDER BY id")).recordset;
        const sedes = (await pool.request().query("SELECT * FROM Equipos_Sedes WHERE eliminado=0 ORDER BY id")).recordset;
        const equipos = (await pool.request().query("SELECT * FROM Equipos_Computadoras WHERE eliminado=0 ORDER BY id")).recordset;

        const structure = areas.map(area => ({
            id: area.id,
            name: area.nombre || area.Nombre, // Aseguramos que lea el nombre
            locations: sedes.filter(s => s.id_area === area.id).map(sede => ({
                id: sede.id,
                name: sede.nombre || sede.Nombre, // Aseguramos que lea el nombre
                computers: equipos.filter(e => e.id_sede === sede.id).map(eq => ({
                    id: eq.id,
                    // AQUÍ ESTÁ EL CAMBIO IMPORTANTE:
                    name: eq.nombre || eq.Nombre || '',
                    hostname: eq.hostname || eq.Hostname || '',
                    type: eq.tipo || eq.Tipo || 'desktop',
                    status: eq.status
                }))
            }))
        }));
        res.json({ areas: structure });
    } catch (error) {
        console.error("Error structure:", error); // Log para ver errores en consola
        res.status(500).send("Error");
    }
});

app.post('/api/equipos', isAuthenticated, async (req, res) => {
    const { name, hostname, type, status, sede_id } = req.body;
    try { const pool = await getConnection(); await pool.request().input('n', sql.NVarChar, name).input('h', sql.NVarChar, hostname).input('t', sql.NVarChar, type).input('s', sql.Bit, status).input('sid', sql.Int, sede_id).query("INSERT INTO Equipos_Computadoras (nombre, hostname, tipo, status, id_sede) VALUES (@n, @h, @t, @s, @sid)"); res.json({ message: 'Ok' }); } catch (e) { res.status(500).send(e.message); }
});
app.put('/api/equipos/:id', isAuthenticated, async (req, res) => {
    const { name, hostname, type, status } = req.body;
    try { const pool = await getConnection(); await pool.request().input('id', sql.Int, req.params.id).input('n', sql.NVarChar, name).input('h', sql.NVarChar, hostname).input('t', sql.NVarChar, type).input('s', sql.Bit, status).query("UPDATE Equipos_Computadoras SET nombre=@n, hostname=@h, tipo=@t, status=@s WHERE id=@id"); res.json({ message: 'Ok' }); } catch (e) { res.status(500).send(e.message); }
});
app.delete('/api/equipos/:id', isAuthenticated, async (req, res) => {
    try { const pool = await getConnection(); await pool.request().input('id', sql.Int, req.params.id).query("UPDATE Equipos_Computadoras SET eliminado=1 WHERE id=@id"); res.json({ message: 'Ok' }); } catch (e) { res.status(500).send(e.message); }
});
app.post('/api/sedes', isAuthenticated, async (req, res) => {
    const { name, area_id } = req.body; try { const pool = await getConnection(); await pool.request().input('n', sql.NVarChar, name).input('aid', sql.Int, area_id).query("INSERT INTO Equipos_Sedes (nombre, id_area) VALUES (@n, @aid)"); res.json({ message: 'Ok' }); } catch (e) { res.status(500).send(e.message); }
});
app.put('/api/sedes/:id', isAuthenticated, async (req, res) => { try { const pool = await getConnection(); await pool.request().input('id', sql.Int, req.params.id).input('n', sql.NVarChar, req.body.name).query("UPDATE Equipos_Sedes SET nombre=@n WHERE id=@id"); res.json({ message: 'Ok' }); } catch (e) { res.status(500).send(e.message); } });
app.delete('/api/sedes/:id', isAuthenticated, async (req, res) => { try { const pool = await getConnection(); await pool.request().input('id', sql.Int, req.params.id).query("UPDATE Equipos_Sedes SET eliminado=1 WHERE id=@id; UPDATE Equipos_Computadoras SET eliminado=1 WHERE id_sede=@id"); res.json({ message: 'Ok' }); } catch (e) { res.status(500).send(e.message); } });

// ==========================================
//  CAMBIO DE PRECIOS
// ==========================================
app.get('/api/precios/:empresa', isAuthenticated, async (req, res) => {
    const { empresa } = req.params;
    if (!['02', '04', '06'].includes(empresa)) return res.status(400).json({ message: 'Empresa no válida' });

    try {
        const pool = await getConnection();

        // 1. Obtener el factor IGVV (Ej: 10.50)
        const valResult = await pool.request().query("SELECT TOP 1 n_valor FROM Valores WHERE c_valor = 'Igvv'");
        let igvvPct = 10.00; // Default por seguridad
        if (valResult.recordset.length > 0) igvvPct = valResult.recordset[0].n_valor;

        // Factor matemático (Ej: 1.105)
        const factor = 1 + (igvvPct / 100);

        // 2. Consulta principal con cálculo en caliente
        // Si es Afecto, multiplicamos por el factor. Si no, mostramos tal cual.
        // Usamos ROUND(x, 4) para visualización precisa.
        const query = `
            DECLARE @factor DECIMAL(10, 4) = ${factor};
            
            SELECT 
                p.CodPro, 
                p.Nombre, 
                p.Afecto,
                ROUND(ISNULL(pr.PreTema1, 0) * (CASE WHEN p.Afecto = 1 THEN @factor ELSE 1 END), 4) as PreTema1,
                ROUND(ISNULL(pr.PreTema2, 0) * (CASE WHEN p.Afecto = 1 THEN @factor ELSE 1 END), 4) as PreTema2,
                ROUND(ISNULL(pr.PreTema3, 0) * (CASE WHEN p.Afecto = 1 THEN @factor ELSE 1 END), 4) as PreTema3,
                ROUND(ISNULL(pr.PreTema4, 0) * (CASE WHEN p.Afecto = 1 THEN @factor ELSE 1 END), 4) as PreTema4,
                ROUND(ISNULL(pr.PreTema5, 0) * (CASE WHEN p.Afecto = 1 THEN @factor ELSE 1 END), 4) as PreTema5,
                ROUND(ISNULL(pr.PreTema6, 0) * (CASE WHEN p.Afecto = 1 THEN @factor ELSE 1 END), 4) as PreTema6
            FROM Productos p 
            LEFT JOIN Precios pr ON p.CodPro = pr.Codpro 
            WHERE p.Tipo = 3 
              AND p.CodPro LIKE @prefix + '%' 
              AND p.Eliminado = 0 
            ORDER BY p.Nombre ASC
        `;

        const result = await pool.request().input('prefix', sql.VarChar, empresa).query(query);
        res.json(result.recordset);
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Error BD' });
    }
});

app.put('/api/precios/:codpro', isAuthenticated, async (req, res) => {
    const { codpro } = req.params;
    // Los precios que llegan aquí (p1...p6) son los que vio el usuario (CON IGVV)
    const { p1, p2, p3, p4, p5, p6 } = req.body;

    try {
        const pool = await getConnection();

        // 1. Obtener Factor IGVV y Estado Afecto del Producto
        const datosPrevios = await pool.request()
            .input('cod', sql.Char(10), codpro)
            .query(`
                SELECT TOP 1 
                    (SELECT TOP 1 n_valor FROM Valores WHERE c_valor = 'Igvv') as Igvv,
                    p.Afecto
                FROM Productos p
                WHERE p.CodPro = @cod
            `);

        let factor = 1;
        if (datosPrevios.recordset.length > 0) {
            const row = datosPrevios.recordset[0];
            // Solo aplicamos la división si el producto es Afecto
            if (row.Afecto) {
                const igvv = row.Igvv || 10.00;
                factor = 1 + (igvv / 100);
            }
        }

        // 2. Calcular precios BASE (Sin IGVV) para guardar
        // Dividimos el input del usuario entre el factor
        const v1 = parseFloat(p1 || 0) / factor;
        const v2 = parseFloat(p2 || 0) / factor;
        const v3 = parseFloat(p3 || 0) / factor;
        const v4 = parseFloat(p4 || 0) / factor;
        const v5 = parseFloat(p5 || 0) / factor;
        const v6 = parseFloat(p6 || 0) / factor;

        // 3. Guardar en Base de Datos (Insert o Update)
        const check = await pool.request().input('cod', sql.Char(10), codpro).query("SELECT Codpro FROM Precios WHERE Codpro = @cod");

        const request = pool.request()
            .input('cod', sql.Char(10), codpro)
            // Usamos Decimal(19, 4) para asegurar los 4 decimales pedidos
            .input('p1', sql.Decimal(19, 4), v1)
            .input('p2', sql.Decimal(19, 4), v2)
            .input('p3', sql.Decimal(19, 4), v3)
            .input('p4', sql.Decimal(19, 4), v4)
            .input('p5', sql.Decimal(19, 4), v5)
            .input('p6', sql.Decimal(19, 4), v6);

        if (check.recordset.length === 0) {
            await request.query(`INSERT INTO Precios (Codpro, PreTema1, PreTema2, PreTema3, PreTema4, PreTema5, PreTema6) VALUES (@cod, @p1, @p2, @p3, @p4, @p5, @p6)`);
        } else {
            await request.query(`UPDATE Precios SET PreTema1=@p1, PreTema2=@p2, PreTema3=@p3, PreTema4=@p4, PreTema5=@p5, PreTema6=@p6 WHERE Codpro=@cod`);
        }

        res.json({ message: 'Ok' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Error' });
    }
});
/*
endpoint anterior
app.get('/api/precios/:empresa', isAuthenticated, async (req, res) => {
    const { empresa } = req.params; if (!['02', '04', '06'].includes(empresa)) return res.status(400).json({ message: 'Empresa no válida' });
    try { const pool = await getConnection(); const result = await pool.request().input('prefix', sql.VarChar, empresa).query(`SELECT p.CodPro, p.Nombre, pr.PreTema1, pr.PreTema2, pr.PreTema3, pr.PreTema4, pr.PreTema5, pr.PreTema6 FROM Productos p LEFT JOIN Precios pr ON p.CodPro = pr.Codpro WHERE p.Tipo = 3 AND p.CodPro LIKE @prefix + '%' AND p.Eliminado = 0 ORDER BY p.Nombre ASC`); res.json(result.recordset); } catch (e) { res.status(500).json({ message: 'Error BD' }); }
});
app.put('/api/precios/:codpro', isAuthenticated, async (req, res) => {
    const { codpro } = req.params; const { p1, p2, p3, p4, p5, p6 } = req.body;
    try {
        const pool = await getConnection(); const check = await pool.request().input('cod', sql.Char(10), codpro).query("SELECT Codpro FROM Precios WHERE Codpro = @cod");
        if (check.recordset.length === 0) await pool.request().input('cod', sql.Char(10), codpro).input('p1', sql.Money, p1).input('p2', sql.Money, p2).input('p3', sql.Money, p3).input('p4', sql.Money, p4).input('p5', sql.Money, p5).input('p6', sql.Money, p6).query(`INSERT INTO Precios (Codpro, PreTema1, PreTema2, PreTema3, PreTema4, PreTema5, PreTema6) VALUES (@cod, @p1, @p2, @p3, @p4, @p5, @p6)`);
        else await pool.request().input('cod', sql.Char(10), codpro).input('p1', sql.Money, p1).input('p2', sql.Money, p2).input('p3', sql.Money, p3).input('p4', sql.Money, p4).input('p5', sql.Money, p5).input('p6', sql.Money, p6).query(`UPDATE Precios SET PreTema1=@p1, PreTema2=@p2, PreTema3=@p3, PreTema4=@p4, PreTema5=@p5, PreTema6=@p6 WHERE Codpro=@cod`);
        res.json({ message: 'Ok' });
    } catch (e) { res.status(500).json({ message: 'Error' }); }
});*/

// ==============================================================
//  REVISIÓN DE DATOS EN LA NUBE (CÓDIGO DE RENDER RESTAURADO)
// ==============================================================
app.post('/api/revision-nube', isAuthenticated, async (req, res) => {
    const { empresa, turno, fechaInicio, fechaFin } = req.body;
    let idEmpresa, idCajero, prefixTicket;
    if (empresa === '02') { idEmpresa = 2; idCajero = 2; prefixTicket = 'T001'; }
    else if (empresa === '04') { idEmpresa = 4; idCajero = 4; prefixTicket = 'T002'; }
    else if (empresa === '06') { idEmpresa = 6; idCajero = 6; prefixTicket = 'T005'; }
    else { return res.status(400).json({ message: 'Empresa no válida' }); }

    const idTurno = parseInt(turno);
    try {
        const pool = await getConnection();
        // Consultas
        const qDoccab = await pool.request().input('emp', sql.Int, idEmpresa).input('turno', sql.Int, idTurno).input('f1', sql.VarChar, fechaInicio).input('f2', sql.VarChar, fechaFin)
            .query(`SELECT MIN(Numero) as First, MAX(Numero) as Last, COUNT(*) as Total FROM Doccab WHERE Empresa = @emp AND Turno = @turno AND Eliminado = 0 AND CAST(Fecha AS DATE) BETWEEN @f1 AND @f2`);

        const qDocdet = await pool.request().input('emp', sql.Int, idEmpresa).input('turno', sql.Int, idTurno).input('f1', sql.VarChar, fechaInicio).input('f2', sql.VarChar, fechaFin)
            .query(`SELECT MIN(Numero) as First, MAX(Numero) as Last, COUNT(*) as Total FROM Docdet WHERE Empresa = @emp AND Turno = @turno AND Numero IN (SELECT Numero FROM Doccab WHERE Empresa=@emp AND Turno=@turno AND CAST(Fecha AS DATE) BETWEEN @f1 AND @f2)`);

        const qCaja = await pool.request().input('cajero', sql.Int, idCajero).input('tipoCaja', sql.Int, idTurno).input('f1', sql.VarChar, fechaInicio).input('f2', sql.VarChar, fechaFin)
            .query(`SELECT MIN(Numero) as First, MAX(Numero) as Last, COUNT(*) as Total FROM Caja WHERE Cajero = @cajero AND TipoCaja = @tipoCaja AND Tipo = 2 AND Eliminado = 0 AND CAST(Fecha AS DATE) BETWEEN @f1 AND @f2`);

        const qTicketC = await pool.request().input('prefix', sql.VarChar, prefixTicket + '%').input('turno', sql.Int, idTurno).input('f1', sql.VarChar, fechaInicio).input('f2', sql.VarChar, fechaFin)
            .query(`SELECT MIN(NroTicket) as First, MAX(NroTicket) as Last, COUNT(*) as Total FROM Ticket_c WHERE NroTicket LIKE @prefix AND Turno = @turno AND CAST(Fecha AS DATE) BETWEEN @f1 AND @f2`);

        const rangeTickets = qTicketC.recordset[0];
        let qTicketD = { recordset: [{ First: null, Last: null, Total: 0 }] };
        let qPagos = { recordset: [{ First: null, Last: null, Total: 0 }] };

        if (rangeTickets.Total > 0) {
            qTicketD = await pool.request().input('minT', sql.VarChar, rangeTickets.First).input('maxT', sql.VarChar, rangeTickets.Last)
                .query(`SELECT MIN(NroTicket) as First, MAX(NroTicket) as Last, COUNT(*) as Total FROM Ticket_d WHERE NroTicket >= @minT AND NroTicket <= @maxT`);
            qPagos = await pool.request().input('minT', sql.VarChar, rangeTickets.First).input('maxT', sql.VarChar, rangeTickets.Last)
                .query(`SELECT MIN(NroTicket) as First, MAX(NroTicket) as Last, COUNT(*) as Total FROM Pagos_Tickets WHERE NroTicket >= @minT AND NroTicket <= @maxT`);
        }
        res.json({ doccab: qDoccab.recordset[0], docdet: qDocdet.recordset[0], caja: qCaja.recordset[0], ticket_c: rangeTickets, ticket_d: qTicketD.recordset[0], pagos: qPagos.recordset[0] });
    } catch (error) { res.status(500).json({ message: 'Error' }); }
});

// ==========================================
//  VALIDACIONES DE SEGURIDAD (NUEVO)
// ==========================================
app.post('/api/validate-password', isAuthenticated, async (req, res) => {
    const { clave, tipo } = req.body; // tipo='COMISION'
    try {
        const pool = await getConnection();

        // Buscamos la clave en la tabla Tablas (n_codtabla 603)
        // Asumimos que la clave numérica está en 'conversion' como 1302.00
        const result = await pool.request()
            .input('nombreClave', sql.VarChar, 'CLAVE' + tipo) // Ej: CLAVECOMISION
            .query("SELECT conversion FROM Tablas WHERE n_codtabla = 603 AND c_describe = @nombreClave");

        if (result.recordset.length === 0) {
            return res.json({ success: false, message: 'Configuración no encontrada' });
        }

        const claveCorrecta = result.recordset[0].conversion; // 1302

        // Comparamos (convertimos a string para asegurar)
        if (parseFloat(clave) === parseFloat(claveCorrecta)) {
            res.json({ success: true });
        } else {
            res.json({ success: false, message: 'Contraseña incorrecta' });
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: 'Error de servidor' });
    }
});

// ==============================================
//  NUEVO: MÓDULO PRODUCTOS ALMACÉN (Operaciones)
// ==============================================

//Middleware o validación de rutas
const checkOperaciones = (req, res, next) => {
    // Permitir si tiene permiso 'operaciones' O 'equipos' (por si acaso) o es admin
    // En tu lógica actual:
    if (req.session.user && req.session.user.permisos.includes('operaciones')) {
        next();
    } else {
        res.status(403).send('Sin permisos de Operaciones');
    }
};


// 1. Cargar Listas Auxiliares (ACTUALIZADO CON VALORES)
app.get('/api/productos/listas', isAuthenticated, async (req, res) => {
    try {
        const pool = await getConnection();

        // Consultas paralelas
        const pLineas = pool.request().query("SELECT CodLinea, Descripcion FROM Lineas ORDER BY Descripcion");
        const pProveedores = pool.request().query("SELECT CodProv, Razon FROM Proveedores WHERE Eliminado = 0 ORDER BY Razon");
        const pUnidades = pool.request().query("SELECT n_numero, c_describe FROM Tablas WHERE n_codtabla = 536 ORDER BY c_describe");
        // NUEVO: Consultar tabla Valores
        const pValores = pool.request().query("SELECT c_valor, n_valor FROM Valores WHERE c_valor IN ('Igv', 'Igvv')");

        const [lineas, proveedores, unidades, valores] = await Promise.all([pLineas, pProveedores, pUnidades, pValores]);

        const tiposProducto = [{ id: 1, nombre: 'Insumo' }, { id: 2, nombre: 'Insumo - Producto' }, { id: 3, nombre: 'Producto' }, { id: 4, nombre: 'Servicio' }];

        res.json({
            lineas: lineas.recordset,
            proveedores: proveedores.recordset,
            unidades: unidades.recordset,
            tipos: tiposProducto,
            valores: valores.recordset // Enviamos los porcentajes al front
        });
    } catch (e) { res.status(500).send('Error listas'); }
});

// 2. Clases
app.get('/api/productos/clases/:codLinea', isAuthenticated, async (req, res) => {
    try {
        const pool = await getConnection();
        const result = await pool.request().input('linea', sql.Int, req.params.codLinea).query("SELECT CodClase, Descripcion FROM Clases WHERE CodLinea = @linea ORDER BY Descripcion");
        res.json(result.recordset);
    } catch (e) { res.status(500).send('Error clases'); }
});

// 3. Nuevo Código
app.get('/api/productos/nuevo-codigo/:empresa', isAuthenticated, async (req, res) => {
    const { empresa } = req.params;
    try {
        const pool = await getConnection();
        const result = await pool.request().input('prefijo', sql.VarChar, empresa + '%').query("SELECT TOP 1 CodPro FROM Productos WHERE CodPro LIKE @prefijo ORDER BY CodPro DESC");
        let nuevoCodigo = result.recordset.length === 0 ? `${empresa}0000` : (() => {
            const numero = parseInt(result.recordset[0].CodPro.substring(2), 10) + 1;
            return empresa + String(numero).padStart(4, '0');
        })();
        res.json({ codigo: nuevoCodigo });
    } catch (e) { res.status(500).send('Error código'); }
});

// 4. Buscar Productos
app.get('/api/productos/buscar', isAuthenticated, async (req, res) => {
    const { q, empresa, page } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const pageSize = 50;
    const offset = (pageNum - 1) * pageSize;

    try {
        const pool = await getConnection();
        const request = pool.request();

        let query = `
            SELECT P.CodPro, P.Nombre, L.Descripcion as Linea, P.Stock, P.Costo, P.PventaMa 
            FROM Productos P
            LEFT JOIN Lineas L ON P.Clinea = L.CodLinea
            WHERE P.Eliminado = 0 
        `;

        if (empresa && empresa !== 'undefined' && empresa !== 'null' && empresa.trim() !== '') {
            query += " AND P.CodPro LIKE @empresaLike";
            request.input('empresaLike', sql.VarChar, `${empresa}%`);
        }

        if (q && q !== 'undefined' && q.trim() !== '') {
            query += " AND (P.Nombre LIKE @qLike OR P.CodPro LIKE @qLike)";
            request.input('qLike', sql.VarChar, `%${q}%`);
        }

        query += " ORDER BY P.Nombre ASC OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY";
        request.input('offset', sql.Int, offset);
        request.input('pageSize', sql.Int, pageSize);

        const result = await request.query(query);
        res.json(result.recordset);
    } catch (e) {
        console.error("Error búsqueda:", e);
        res.status(500).send('Error buscar');
    }
});

// 5. Obtener Producto por ID
app.get('/api/productos/:id', isAuthenticated, async (req, res) => {
    try {
        const pool = await getConnection();
        const result = await pool.request().input('id', sql.Char(10), req.params.id).query("SELECT * FROM Productos WHERE CodPro = @id");
        if (result.recordset.length > 0) res.json(result.recordset[0]);
        else res.status(404).send('No encontrado');
    } catch (e) { res.status(500).send('Error producto'); }
});

// 6. Guardar/Editar Producto (CON LÓGICA DE PRECIOS Y COMISIONES)
app.post('/api/productos', isAuthenticated, async (req, res) => {
    const p = req.body;
    try {
        const pool = await getConnection();

        // --- PASO 1: OBTENER FACTOR IGVV DE LA BD ---
        // Consultamos el porcentaje actual (Ej: 10.50)
        const valResult = await pool.request()
            .query("SELECT TOP 1 n_valor FROM Valores WHERE c_valor = 'Igvv'");

        let igvvPct = 10.50; // Valor de respaldo por seguridad
        if (valResult.recordset.length > 0) {
            igvvPct = valResult.recordset[0].n_valor;
        }

        // Calculamos el factor (Ej: 1 + 10.5/100 = 1.105)
        const factor = 1 + (igvvPct / 100);

        // --- REGLA 2: CÁLCULO DE PRECIOS ---
        const precioFinal = parseFloat(p.PventaMa) || 0;

        // Calculamos la base dividiendo por el factor dinámico
        let valorVentaBase = precioFinal;

        // Solo dividimos si el producto es Afecto al impuesto
        if (p.Afecto) {
            valorVentaBase = precioFinal / factor;
        }

        // --- REGLA 3: COMISIONES ---
        const comision = parseFloat(p.Comision) || 0;
        let comH = 0, comV = 0, comR = 0; // Inicializar en 0 por defecto

        // Si hay comisión, replicamos el valor (o 0 si así se requiere)
        if (comision !== 0) {
            comH = comision; comV = comision; comR = comision;
        }

        const request = pool.request()
            .input('cod', sql.Char(10), p.CodPro)
            .input('nom', sql.VarChar(70), p.Nombre)
            .input('bar', sql.Char(15), p.CodBar || '')
            .input('lin', sql.Int, p.Clinea)
            .input('cla', sql.Int, p.Clase)
            .input('pro', sql.Char(4), p.CodProv)
            .input('pes', sql.Decimal(9, 3), p.Peso || 0)
            .input('min', sql.Decimal(9, 2), p.Minimo || 0)
            .input('stk', sql.Decimal(9, 2), p.Stock || 0)
            .input('afe', sql.Bit, p.Afecto)
            .input('tip', sql.Int, p.Tipo)
            .input('cos', sql.Money, p.Costo)

            // USAMOS EL VALOR CALCULADO DINÁMICAMENTE
            .input('pvm', sql.Money, valorVentaBase)
            .input('pvi', sql.Money, valorVentaBase)

            .input('uni', sql.Int, p.Unimed)
            .input('com', sql.Float, comision)

            // COMISIONES
            .input('comH', sql.Decimal(9, 2), comH)
            .input('comV', sql.Decimal(9, 2), comV)
            .input('comR', sql.Decimal(9, 2), comR)

            .input('reg', sql.Char(50), p.RegSanit || '')
            .input('tem', sql.Int, p.TempMax || 0)
            .input('tmi', sql.Int, p.TemMin || 0)
            .input('cre', sql.Money, p.CosReal || 0);

        if (p.isNew) {
            await request.query(`
                INSERT INTO Productos (CodPro, Nombre, CodBar, Clinea, Clase, CodProv, Peso, Minimo, Stock, Afecto, Tipo, Costo, PventaMa, PventaMi, Unimed, Comision, ComisionH, ComisionV, ComisionR, RegSanit, TemMax, TemMin, CosReal, Eliminado) 
                VALUES (@cod, @nom, @bar, @lin, @cla, @pro, @pes, @min, @stk, @afe, @tip, @cos, @pvm, @pvi, @uni, @com, @comH, @comV, @comR, @reg, @tem, @tmi, @cre, 0)
            `);
        } else {
            await request.query(`
                UPDATE Productos SET 
                Nombre=@nom, CodBar=@bar, Clinea=@lin, Clase=@cla, CodProv=@pro, Peso=@pes, Minimo=@min, Stock=@stk, Afecto=@afe, Tipo=@tip, 
                Costo=@cos, PventaMa=@pvm, PventaMi=@pvi, Unimed=@uni, Comision=@com, ComisionH=@comH, ComisionV=@comV, ComisionR=@comR, 
                RegSanit=@reg, TemMax=@tem, TemMin=@tmi, CosReal=@cre 
                WHERE CodPro=@cod
            `);
        }
        res.json({ message: 'Guardado' });
    } catch (e) { console.error(e); res.status(500).send('Error guardando'); }
});

// Eliminar Producto (Lógico)
app.delete('/api/productos/:id', isAuthenticated, async (req, res) => {
    try {
        const pool = await getConnection();

        // Ejecutamos el UPDATE
        const result = await pool.request()
            .input('id', sql.Char(10), req.params.id)
            .query("UPDATE Productos SET Eliminado = 1 WHERE CodPro = @id");

        // Verificamos si se actualizó alguna fila
        if (result.rowsAffected[0] > 0) {
            res.json({ message: 'Eliminado correctamente' });
        } else {
            // Si no encontró el producto o ya estaba eliminado
            res.status(404).json({ message: 'Producto no encontrado o no se pudo eliminar' });
        }

    } catch (e) {
        console.error("Error eliminando producto:", e); // Para depuración
        res.status(500).send('Error eliminando producto');
    }
});

// ==========================================
//  REPORTES (SALIDA INSUMOS)
// ==========================================
function buildInsumosQuery(empresa, year, month, filters) {
    let whereClause = "WHERE (YEAR(T.fecha) = @year) AND (P.tipo < 3) AND (T.tipo = 2) AND (T.clase <> 2)";
    let almacenId = parseInt(empresa); whereClause += ` AND (T.Almacen = ${almacenId})`;
    if (month && month !== '0') whereClause += ` AND MONTH(T.fecha) = ${month}`;
    if (filters) {
        if (filters.linea) whereClause += ` AND L.Descripcion LIKE '%${filters.linea}%'`;
        if (filters.documento) whereClause += ` AND T.Documento LIKE '%${filters.documento}%'`;
        if (filters.codpro) whereClause += ` AND T.codpro LIKE '%${filters.codpro}%'`;
        if (filters.nombre) whereClause += ` AND P.Nombre LIKE '%${filters.nombre}%'`;
        if (filters.razon) whereClause += ` AND TB.c_describe LIKE '%${filters.razon}%'`;
    }
    return whereClause;
}

app.post('/api/reports/salida-insumos', isAuthenticated, async (req, res) => {
    if (!req.session.user.permisos.includes('reportes')) return res.status(403).json({ message: 'Sin permisos' });
    const { empresa, year, month, filters, page, pageSize } = req.body;
    const offset = (page - 1) * pageSize;
    try {
        const pool = await getConnection();
        const whereClause = buildInsumosQuery(empresa, year, month, filters);
        const dataQuery = `SELECT L.Descripcion AS Linea, T.Documento, FORMAT(T.Fecha, 'dd/MM/yyyy HH:mm') as Fecha, T.Almacen, T.codpro, P.Nombre, TB.c_describe AS Razon, T.Cantidad, ROUND(T.Cantidad * P.Costo, 2) AS Costo, 0 AS Total FROM dbo.Transacciones AS T INNER JOIN dbo.Productos AS P ON P.codpro = T.codpro INNER JOIN dbo.Tablas AS TB ON TB.n_codtabla = 9 AND TB.n_numero = T.clase INNER JOIN dbo.Lineas AS L ON L.CodLinea = P.Clinea ${whereClause} ORDER BY T.Fecha DESC OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY`;
        const totalsQuery = `SELECT COUNT(*) as TotalRegistros, SUM(T.Cantidad) as SumCantidad, SUM(ROUND(T.Cantidad * P.Costo, 2)) as SumCosto FROM dbo.Transacciones AS T INNER JOIN dbo.Productos AS P ON P.codpro = T.codpro INNER JOIN dbo.Tablas AS TB ON TB.n_codtabla = 9 AND TB.n_numero = T.clase INNER JOIN dbo.Lineas AS L ON L.CodLinea = P.Clinea ${whereClause}`;
        const dataResult = await pool.request().input('year', sql.Int, year).query(dataQuery);
        const totalsResult = await pool.request().input('year', sql.Int, year).query(totalsQuery);
        res.json({ data: dataResult.recordset, totals: totalsResult.recordset[0] });
    } catch (e) { res.status(500).json({ message: 'Error generando reporte' }); }
});

app.post('/api/reports/salida-insumos/export', isAuthenticated, async (req, res) => {
    if (!req.session.user.permisos.includes('reportes')) return res.status(403).send('Sin permisos');
    const { empresa, year, month, filters } = req.body;
    try {
        const pool = await getConnection();
        const whereClause = buildInsumosQuery(empresa, year, month, filters);
        const query = `SELECT L.Descripcion AS Linea, T.Documento, T.Fecha, T.Almacen, T.codpro, P.Nombre, TB.c_describe AS Razon, T.Cantidad, ROUND(T.Cantidad * P.Costo, 2) AS Costo FROM dbo.Transacciones AS T INNER JOIN dbo.Productos AS P ON P.codpro = T.codpro INNER JOIN dbo.Tablas AS TB ON TB.n_codtabla = 9 AND TB.n_numero = T.clase INNER JOIN dbo.Lineas AS L ON L.CodLinea = P.Clinea ${whereClause} ORDER BY T.Fecha DESC`;
        const result = await pool.request().input('year', sql.Int, year).query(query);
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Salida Insumos');
        worksheet.columns = [{ header: 'Línea', key: 'Linea', width: 20 }, { header: 'Documento', key: 'Documento', width: 15 }, { header: 'Fecha', key: 'Fecha', width: 20 }, { header: 'Almacen', key: 'Almacen', width: 10 }, { header: 'CodPro', key: 'codpro', width: 10 }, { header: 'Nombre', key: 'Nombre', width: 30 }, { header: 'Razón', key: 'Razon', width: 25 }, { header: 'Cantidad', key: 'Cantidad', width: 10 }, { header: 'Costo', key: 'Costo', width: 10 }];
        worksheet.addRows(result.recordset);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=Reporte_Salidas.xlsx');
        await workbook.xlsx.write(res);
        res.end();
    } catch (e) { res.status(500).send('Error exportando'); }
});

//SECCION PARA APLICATIVO MÓVIL
//ESTOS SON SERVICIOS POR AHORA EXPLUSIVOS DE LA APP
// ==========================================
//  MÓDULO: GESTIÓN DE CLAVES (ADMIN)
// ==========================================

// 1. Obtener las claves (Solo tabla 603)
app.get('/api/admin/claves', isAuthenticated, async (req, res) => {
    // Verificación de ROL (Opcional pero recomendado en backend)
    // Asumimos que el rol se llama 'Administrador' o 'Sistemas'
    // if (req.session.user.rol !== 'Administrador') return res.status(403).send('Acceso denegado');

    try {
        const pool = await getConnection();
        // n_codtabla 603 son las claves del sistema
        const result = await pool.request()
            .query("SELECT n_numero, c_describe, conversion FROM Tablas WHERE n_codtabla = 603 ORDER BY n_numero");
        res.json(result.recordset);
    } catch (e) {
        console.error(e);
        res.status(500).send('Error al obtener claves');
    }
});

// 2. Actualizar una clave específica
app.put('/api/admin/claves/:id', isAuthenticated, async (req, res) => {
    const { id } = req.params; // Esto será el n_numero
    const { valor } = req.body; // Nuevo valor de 'conversion'

    try {
        const pool = await getConnection();
        await pool.request()
            .input('id', sql.Int, id)
            .input('val', sql.Float, valor) // Float o Decimal según tu DB, Float suele servir para 1302.00
            .query("UPDATE Tablas SET conversion = @val WHERE n_codtabla = 603 AND n_numero = @id");

        res.json({ message: 'Clave actualizada' });
    } catch (e) {
        console.error(e);
        res.status(500).send('Error al actualizar');
    }
});


// Endpoint para llenar el combo de Empresas (Cajeros)
app.get('/api/reports/listas/empresas', isAuthenticated, async (req, res) => {
    try {
        const pool = await getConnection();
        // Consultamos n_codtabla = 200
        const result = await pool.request().query("SELECT n_numero, c_describe FROM Tablas WHERE n_codtabla = 200 ORDER BY c_describe");
        res.json(result.recordset);
    } catch (e) {
        console.error(e);
        res.status(500).send('Error cargando empresas');
    }
});


//nuevo modulo referente a cargo caja reporte
// ==========================================
//  MÓDULO: REPORTES (CARGOS DE CAJA) - NUEVO
// ==========================================

function buildCargosQuery(empresa, year, month, turno, filters) {
    // Mapeo: '02' -> 2, '04' -> 4, '06' -> 6 (Para el campo Cajero)
    let cajeroId = parseInt(empresa);

    // Base de la consulta (Replicando la lógica de VIEW v_CargosDeCaja)
    let whereClause = `
        WHERE (c.Tipo = 1) 
        AND (c.Eliminado = 0) 
        AND (c.Razon <> 61) 
        AND (c.Cajero = ${cajeroId})
        AND (YEAR(c.Fecha) = @year)
    `;

    if (month && month !== '0') whereClause += ` AND MONTH(c.Fecha) = ${month}`;

    if (turno && turno !== '0') whereClause += ` AND c.TipoCaja = ${turno}`;

    // Filtros dinámicos por columna
    if (filters) {
        if (filters.razon) whereClause += ` AND t1.c_describe LIKE '%${filters.razon}%'`;
        if (filters.documento) whereClause += ` AND c.Documento LIKE '%${filters.documento}%'`;
        if (filters.empresa) whereClause += ` AND c.Empresa LIKE '%${filters.empresa}%'`;
        // Se puede agregar mas filtros si es necesario
        //OdenfisNotes
    }
    return whereClause;
}

// Endpoint: Obtener Datos Cargos Caja
app.post('/api/reports/cargos-caja', isAuthenticated, async (req, res) => {
    // Validar Rol (Solo Admin, usa el permiso 'reportes')
    if (!req.session.user.permisos.includes('reportes')) return res.status(403).json({ message: 'Sin permisos' });

    const { empresa, year, month, turno, filters, page, pageSize } = req.body;
    const offset = (page - 1) * pageSize;

    try {
        const pool = await getConnection();
        const whereClause = buildCargosQuery(empresa, year, month, turno, filters);

        // Query Principal (Datos)
        const dataQuery = `
            SELECT 
                t1.c_describe AS Razon,
                FORMAT(c.Fecha, 'dd/MM/yyyy HH:mm') as Fecha,
                c.Documento,
                c.Empresa AS DetalleEmpresa, -- Columna G del excel
                c.Monto,
                t3.c_describe AS Emp,
                c.TipoCaja AS Turno,
                YEAR(c.Fecha) AS Anio
            FROM dbo.Caja AS c 
            INNER JOIN dbo.Tablas AS t1 ON t1.n_codtabla = 15 AND t1.n_numero = c.Razon 
            INNER JOIN dbo.Tablas AS t2 ON t2.n_codtabla = 49 AND t2.n_numero = CONVERT(int, t1.conversion) 
            INNER JOIN dbo.Tablas AS t3 ON t3.n_codtabla = 200 AND t3.n_numero = c.Cajero
            ${whereClause}
            ORDER BY c.Fecha DESC
            OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY
        `;

        // Query Totales
        const totalsQuery = `
            SELECT 
                COUNT(*) as TotalRegistros,
                SUM(c.Monto) as SumMonto
            FROM dbo.Caja AS c 
            INNER JOIN dbo.Tablas AS t1 ON t1.n_codtabla = 15 AND t1.n_numero = c.Razon 
            INNER JOIN dbo.Tablas AS t2 ON t2.n_codtabla = 49 AND t2.n_numero = CONVERT(int, t1.conversion) 
            INNER JOIN dbo.Tablas AS t3 ON t3.n_codtabla = 200 AND t3.n_numero = c.Cajero
            ${whereClause}
        `;

        const dataResult = await pool.request().input('year', sql.Int, year).query(dataQuery);
        const totalsResult = await pool.request().input('year', sql.Int, year).query(totalsQuery);

        res.json({
            data: dataResult.recordset,
            totals: totalsResult.recordset[0]
        });

    } catch (e) {
        console.error("Error reporte cargos:", e);
        res.status(500).json({ message: 'Error generando reporte' });
    }
});

// Endpoint: Exportar Excel Cargos Caja
app.post('/api/reports/cargos-caja/export', isAuthenticated, async (req, res) => {
    if (!req.session.user.permisos.includes('reportes')) return res.status(403).send('Sin permisos');
    const { empresa, year, month, turno, filters } = req.body;

    try {
        const pool = await getConnection();
        const whereClause = buildCargosQuery(empresa, year, month, turno, filters);

        const query = `
            SELECT t1.c_describe AS Razon, c.Fecha, c.Documento, c.Empresa AS DetalleEmpresa, c.Monto, t3.c_describe AS Emp, c.TipoCaja AS Turno
            FROM dbo.Caja AS c 
            INNER JOIN dbo.Tablas AS t1 ON t1.n_codtabla = 15 AND t1.n_numero = c.Razon 
            INNER JOIN dbo.Tablas AS t2 ON t2.n_codtabla = 49 AND t2.n_numero = CONVERT(int, t1.conversion) 
            INNER JOIN dbo.Tablas AS t3 ON t3.n_codtabla = 200 AND t3.n_numero = c.Cajero
            ${whereClause}
            ORDER BY c.Fecha DESC
        `;

        const result = await pool.request().input('year', sql.Int, year).query(query);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Cargos de Caja');

        worksheet.columns = [
            { header: 'Razón', key: 'Razon', width: 25 },
            { header: 'Fecha', key: 'Fecha', width: 20 },
            { header: 'Documento', key: 'Documento', width: 15 },
            { header: 'Empresa / Detalle', key: 'DetalleEmpresa', width: 40 },
            { header: 'Monto', key: 'Monto', width: 15 },
            { header: 'Sede', key: 'Emp', width: 15 },
            { header: 'Turno', key: 'Turno', width: 10 },
        ];

        worksheet.addRows(result.recordset);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=Reporte_CargosCaja.xlsx');

        await workbook.xlsx.write(res);
        res.end();

    } catch (e) { console.error(e); res.status(500).send('Error exportando'); }
});

// ==========================================
//  MÓDULO: GESTIÓN DE RECETAS
// ==========================================

// Middleware de seguridad para recetas
const checkRecetas = (req, res, next) => {
    if (req.session.user && (req.session.user.permisos.includes('recetas') || req.session.user.permisos.includes('operaciones'))) {
        next();
    } else {
        res.status(403).send('Sin permisos de Recetas');
    }
};

// 1. Buscar Productos para Recetas (Con filtro de Empresa)
app.get('/api/recetas/productos/buscar', isAuthenticated, checkRecetas, async (req, res) => {
    const { q, empresa } = req.query; // Recibimos 'empresa'
    try {
        const pool = await getConnection();

        let query = "SELECT TOP 20 CodPro, Nombre FROM Productos WHERE Eliminado = 0 AND Tipo = 3";

        const request = pool.request();

        // Filtro por Empresa (Prefijo)
        if (empresa) {
            query += " AND CodPro LIKE @empresa + '%'";
            request.input('empresa', sql.VarChar, empresa);
        }

        // Filtro por Texto
        if (q) {
            query += " AND (Nombre LIKE @q OR CodPro LIKE @q)";
            request.input('q', sql.VarChar, `%${q}%`);
        }

        const result = await request.query(query + " ORDER BY Nombre");
        res.json(result.recordset);
    } catch (e) {
        console.error(e);
        res.status(500).send('Error buscando productos');
    }
});

// 2. Buscar Insumos (Solo Tipo 1 - Para los ingredientes)
// Nota: Traemos la Unidad de Medida directamente aquí
// 2. Buscar Insumos (Solo Tipo 1) - CON FILTRO DE EMPRESA ESPECIAL
app.get('/api/recetas/insumos/buscar', isAuthenticated, checkRecetas, async (req, res) => {
    const { q, empresa } = req.query; // Recibimos empresa
    try {
        const pool = await getConnection();
        const request = pool.request();

        let query = `
            SELECT TOP 20 P.CodPro, P.Nombre, P.Unimed, T.c_describe as UnidadNombre
            FROM Productos P
            LEFT JOIN Tablas T ON T.n_codtabla = 536 AND T.n_numero = P.Unimed
            WHERE P.Eliminado = 0 AND P.Tipo = 1
        `;

        // LÓGICA DE FILTRADO POR EMPRESA
        if (empresa === '02') {
            // Caso Cocineria: Insumos 02 o 07
            query += " AND (P.CodPro LIKE '02%' OR P.CodPro LIKE '07%')";
        } else if (empresa) {
            // Casos Mar Picante (04) y Abruzzo (06)
            query += " AND P.CodPro LIKE @empresa + '%'";
            request.input('empresa', sql.VarChar, empresa);
        }

        // Filtro por texto (Nombre o Código)
        if (q) {
            query += " AND (P.Nombre LIKE @q OR P.CodPro LIKE @q)";
            request.input('q', sql.VarChar, `%${q}%`);
        }

        const result = await request.query(query + " ORDER BY P.Nombre");
        res.json(result.recordset);
    } catch (e) {
        console.error(e);
        res.status(500).send('Error buscando insumos');
    }
});

// 3. Obtener Receta existente de un Producto
app.get('/api/recetas/:codProd', isAuthenticated, checkRecetas, async (req, res) => {
    const { codProd } = req.params;
    try {
        const pool = await getConnection();
        // Join para traer nombre del insumo y nombre de la unidad
        const query = `
            SELECT R.CodInsumo, P.Nombre as InsumoNombre, R.Cantidad, R.unimed, T.c_describe as UnidadNombre
            FROM Recetas R
            INNER JOIN Productos P ON P.CodPro = R.CodInsumo
            LEFT JOIN Tablas T ON T.n_codtabla = 536 AND T.n_numero = R.unimed
            WHERE R.codProd = @cod
        `;
        const result = await pool.request().input('cod', sql.Char(10), codProd).query(query);
        res.json(result.recordset);
    } catch (e) { res.status(500).send('Error cargando receta'); }
});

// 4. Guardar Receta (Transacción: Borrar anteriores -> Insertar nuevas)
app.post('/api/recetas', isAuthenticated, checkRecetas, async (req, res) => {
    const { codProd, items } = req.body; // items es array: [{codInsumo, cantidad, unimed}, ...]

    if (!codProd) return res.status(400).send("Falta código producto");

    const transaction = new sql.Transaction(await getConnection());

    try {
        await transaction.begin();
        const request = new sql.Request(transaction);

        // A. Eliminar receta anterior de este producto (Limpieza)
        await request.input('prod', sql.Char(10), codProd)
            .query("DELETE FROM Recetas WHERE codProd = @prod");

        // B. Insertar nuevos ingredientes
        if (items && items.length > 0) {
            for (const item of items) {
                const reqItem = new sql.Request(transaction);
                await reqItem
                    .input('prod', sql.Char(10), codProd)
                    .input('ins', sql.Char(10), item.codInsumo)
                    .input('cant', sql.Decimal(9, 2), item.cantidad)
                    .input('uni', sql.Int, item.unimed)
                    .input('cost', sql.Money, 0) // Costo siempre 0 por ahora
                    .query("INSERT INTO Recetas (codProd, CodInsumo, Cantidad, unimed, Costo) VALUES (@prod, @ins, @cant, @uni, @cost)");
            }
        }

        await transaction.commit();
        res.json({ message: 'Receta guardada correctamente' });

    } catch (e) {
        if (transaction) await transaction.rollback();
        console.error(e);
        res.status(500).send('Error al guardar receta');
    }
});


// ==========================================
//  MÓDULO: AUDITORÍA
// ==========================================
app.get('/api/auditoria/tickets-no-pagados/:anio', isAuthenticated, async (req, res) => {
    // Verificación de permiso
    if (!req.session.user.permisos.includes('auditoria')) {
        return res.status(403).json({ message: 'Sin permisos de Auditoría' });
    }

    const { anio } = req.params;
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('anio', sql.Int, parseInt(anio))
            .execute('sp_aud_Tickets_NOpagados'); // Llamada al Store Procedure

        res.json(result.recordset);
    } catch (e) {
        console.error("Error en SP Auditoria:", e);
        res.status(500).json({ message: 'Error al ejecutar la auditoría' });
    }
});

// 1. Consulta de Documentos Sin Detalle
app.get('/api/auditoria/doc-sin-detalle', isAuthenticated, async (req, res) => {
    if (!req.session.user.permisos.includes('auditoria')) return res.status(403).json({ message: 'Sin permisos' });

    const { emp, tur, anio } = req.query;
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('emp', sql.Int, emp)
            .input('tur', sql.Int, tur)
            .input('anio', sql.Int, anio)
            .execute('sp_aud_Doc_sinDetalle');

        // Este SP devuelve múltiples recordsets (selects). Enviamos el primero que es el principal.
        res.json(result.recordsets[0]);
    } catch (e) {
        console.error(e);
        res.status(500).send('Error en sp_aud_Doc_sinDetalle');
    }
});

// 2. Ejecución de Corrección de Carga
app.post('/api/auditoria/corregir-carga', isAuthenticated, async (req, res) => {
    if (!req.session.user.permisos.includes('auditoria')) return res.status(403).json({ message: 'Sin permisos' });

    const { emp, tur, anio } = req.body;
    try {
        const pool = await getConnection();
        await pool.request()
            .input('emp', sql.Int, emp)
            .input('tur', sql.Int, tur)
            .input('anio', sql.Int, anio)
            .execute('sp_aud_CorrigeCarga');

        res.json({ message: 'Proceso de corrección finalizado con éxito' });
    } catch (e) {
        console.error(e);
        res.status(500).send('Error ejecutando corrección');
    }
});

//-------FINAL
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));