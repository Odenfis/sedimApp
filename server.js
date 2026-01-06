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
app.get('/api/structure', isAuthenticated, async (req, res) => {
    try {
        const pool = await getConnection();
        const areas = (await pool.request().query("SELECT * FROM Equipos_Areas ORDER BY id")).recordset;
        const sedes = (await pool.request().query("SELECT * FROM Equipos_Sedes WHERE eliminado=0 ORDER BY id")).recordset;
        const equipos = (await pool.request().query("SELECT * FROM Equipos_Computadoras WHERE eliminado=0 ORDER BY id")).recordset;
        const structure = areas.map(area => ({
            id: area.id, name: area.nombre,
            locations: sedes.filter(s => s.id_area === area.id).map(sede => ({
                id: sede.id, name: sede.nombre,
                computers: equipos.filter(e => e.id_sede === sede.id).map(eq => ({ id: eq.id, name: eq.nombre, hostname: eq.hostname, type: eq.tipo, status: eq.status }))
            }))
        }));
        res.json({ areas: structure });
    } catch (error) { res.status(500).send("Error"); }
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
});

// ==========================================
//  REVISIÓN DE DATOS EN LA NUBE (CÓDIGO DE RENDER RESTAURADO)
// ==========================================
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
        // Consultas idénticas a tu versión de Render
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

// ==========================================
//  NUEVO: MÓDULO PRODUCTOS ALMACÉN (Operaciones)
// ==========================================

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

// 6. Guardar/Editar Producto
app.post('/api/productos', isAuthenticated, async (req, res) => {
    const p = req.body;
    try {
        const pool = await getConnection();
        const request = pool.request()
            .input('cod', sql.Char(10), p.CodPro).input('nom', sql.VarChar(70), p.Nombre).input('bar', sql.Char(15), p.CodBar || '').input('lin', sql.Int, p.Clinea).input('cla', sql.Int, p.Clase).input('pro', sql.Char(4), p.CodProv).input('pes', sql.Decimal(9, 3), p.Peso || 0).input('min', sql.Decimal(9, 2), p.Minimo || 0).input('stk', sql.Decimal(9, 2), p.Stock || 0).input('afe', sql.Bit, p.Afecto).input('tip', sql.Int, p.Tipo).input('cos', sql.Money, p.Costo).input('pvm', sql.Money, p.PventaMa).input('pvi', sql.Money, p.PventaMi || 0).input('uni', sql.Int, p.Unimed).input('com', sql.Float, p.Comision || 0).input('reg', sql.Char(50), p.RegSanit || '').input('tem', sql.Int, p.TempMax || 0).input('tmi', sql.Int, p.TemMin || 0).input('cre', sql.Money, p.CosReal || 0);

        if (p.isNew) {
            await request.query(`INSERT INTO Productos (CodPro, Nombre, CodBar, Clinea, Clase, CodProv, Peso, Minimo, Stock, Afecto, Tipo, Costo, PventaMa, PventaMi, Unimed, Comision, RegSanit, TemMax, TemMin, CosReal, Eliminado) VALUES (@cod, @nom, @bar, @lin, @cla, @pro, @pes, @min, @stk, @afe, @tip, @cos, @pvm, @pvi, @uni, @com, @reg, @tem, @tmi, @cre, 0)`);
        } else {
            await request.query(`UPDATE Productos SET Nombre=@nom, CodBar=@bar, Clinea=@lin, Clase=@cla, CodProv=@pro, Peso=@pes, Minimo=@min, Stock=@stk, Afecto=@afe, Tipo=@tip, Costo=@cos, PventaMa=@pvm, PventaMi=@pvi, Unimed=@uni, Comision=@com, RegSanit=@reg, TemMax=@tem, TemMin=@tmi, CosReal=@cre WHERE CodPro=@cod`);
        }
        res.json({ message: 'Guardado' });
    } catch (e) { res.status(500).send('Error guardando'); }
});

app.delete('/api/productos/:id', isAuthenticated, async (req, res) => {
    try { const pool = await getConnection(); await pool.request().input('id', sql.Char(10), req.params.id).query("UPDATE Productos SET Eliminado = 1 WHERE CodPro = @id"); res.json({ message: 'Eliminado' }); } catch (e) { res.status(500).send('Error eliminando'); }
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

app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));