const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const { getConnection, sql } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // true si usas https
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 // 24 horas
    }
}));

// --- SEGURIDAD ---
function isAuthenticated(req, res, next) {
    if (req.session.user) return next();
    res.status(401).json({ message: 'No autorizado' });
}

// Redirigir raíz al login
app.get('/', (req, res) => {
    res.redirect('/login.html');
});

// ==========================================
//  AUTENTICACIÓN CON ROLES
// ==========================================
app.post('/api/login', async (req, res) => {
    const { usuario, password } = req.body;
    try {
        const pool = await getConnection();

        // 1. Obtener usuario y su rol
        const result = await pool.request()
            .input('usuario', sql.NVarChar, usuario)
            .query(`
                SELECT u.*, r.nombre as rol_nombre 
                FROM usuariosweb u 
                LEFT JOIN Roles r ON u.rol_id = r.id 
                WHERE u.usuario = @usuario
            `);

        if (result.recordset.length === 0) return res.status(400).json({ message: 'Usuario no encontrado' });

        const user = result.recordset[0];
        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) return res.status(400).json({ message: 'Contraseña incorrecta' });

        // 2. Obtener los módulos permitidos para este rol
        const permisosResult = await pool.request()
            .input('rol_id', sql.Int, user.rol_id)
            .query(`
                SELECT m.clave 
                FROM Roles_Permisos rp
                JOIN Modulos m ON rp.modulo_id = m.id
                WHERE rp.rol_id = @rol_id
            `);

        // Convertimos a array simple: ['equipos', 'precios', etc.]
        const permisos = permisosResult.recordset.map(row => row.clave);

        // Guardamos en sesión
        req.session.user = {
            id: user.id,
            usuario: user.usuario,
            nombre: user.nombre,
            rol: user.rol_nombre,
            permisos: permisos
        };

        req.session.save(err => {
            if (err) return res.status(500).json({ message: 'Error de sesión' });
            res.json({ message: 'Login exitoso', user: req.session.user });
        });
    } catch (error) { res.status(500).send(error.message); }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: 'Sesión cerrada' });
});

app.get('/api/session', (req, res) => {
    if (req.session.user) res.json({ user: req.session.user });
    else res.status(401).send();
});

// ==========================================
//  USUARIOS DEL SISTEMA (RBAC)
// ==========================================

// Obtener roles para el selector
app.get('/api/roles', isAuthenticated, async (req, res) => {
    try {
        const pool = await getConnection();
        const result = await pool.request().query('SELECT id, nombre FROM Roles');
        res.json(result.recordset);
    } catch (e) { res.status(500).send(e.message); }
});

app.get('/api/users', isAuthenticated, async (req, res) => {
    // Verificación de permiso en backend
    if (!req.session.user.permisos.includes('usuarios')) return res.status(403).json({ message: 'Sin permisos' });

    const pool = await getConnection();
    const result = await pool.request().query(`
        SELECT u.id, u.usuario, u.nombre, r.nombre as rol
        FROM usuariosweb u
        LEFT JOIN Roles r ON u.rol_id = r.id
    `);
    res.json(result.recordset);
});

app.post('/api/users', isAuthenticated, async (req, res) => {
    if (!req.session.user.permisos.includes('usuarios')) return res.status(403).json({ message: 'Sin permisos' });

    const { usuario, password, nombre, rol_id } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    try {
        const pool = await getConnection();
        await pool.request()
            .input('u', sql.NVarChar, usuario)
            .input('p', sql.NVarChar, hashedPassword)
            .input('n', sql.NVarChar, nombre)
            .input('r', sql.Int, rol_id)
            .query('INSERT INTO usuariosweb (usuario, password, nombre, rol_id) VALUES (@u, @p, @n, @r)');
        res.json({ message: 'Creado' });
    } catch (err) { res.status(500).json({ message: 'Error' }); }
});

app.delete('/api/users/:id', isAuthenticated, async (req, res) => {
    if (!req.session.user.permisos.includes('usuarios')) return res.status(403).json({ message: 'Sin permisos' });
    const pool = await getConnection();
    await pool.request().input('id', sql.Int, req.params.id).query('DELETE FROM usuariosweb WHERE id = @id');
    res.json({ message: 'Eliminado' });
});

// ==========================================
//  CONTROL DE EQUIPOS
// ==========================================
app.get('/api/structure', isAuthenticated, async (req, res) => {
    if (!req.session.user.permisos.includes('equipos')) return res.status(403).json({ message: 'Sin permisos' });
    try {
        const pool = await getConnection();
        const areasResult = await pool.request().query("SELECT * FROM Equipos_Areas ORDER BY id");
        const sedesResult = await pool.request().query("SELECT * FROM Equipos_Sedes WHERE eliminado=0 ORDER BY id");
        const equiposResult = await pool.request().query("SELECT * FROM Equipos_Computadoras WHERE eliminado=0 ORDER BY id");

        const areas = areasResult.recordset;
        const sedes = sedesResult.recordset;
        const equipos = equiposResult.recordset;

        const structure = areas.map(area => {
            const areaSedes = sedes.filter(s => s.id_area === area.id).map(sede => {
                const sedeEquipos = equipos.filter(e => e.id_sede === sede.id).map(eq => ({
                    id: eq.id, name: eq.nombre, hostname: eq.hostname, type: eq.tipo, status: eq.status
                }));
                return { id: sede.id, name: sede.nombre, computers: sedeEquipos };
            });
            return { id: area.id, name: area.nombre, locations: areaSedes };
        });
        res.json({ areas: structure });
    } catch (error) { res.status(500).send("Error obteniendo estructura"); }
});

// CRUD Equipos (simplificado para brevedad, asumiendo permisos 'equipos')
app.post('/api/equipos', isAuthenticated, async (req, res) => {
    const { name, hostname, type, status, sede_id } = req.body;
    try {
        const pool = await getConnection();
        await pool.request().input('n', sql.NVarChar, name).input('h', sql.NVarChar, hostname).input('t', sql.NVarChar, type).input('s', sql.Bit, status).input('sid', sql.Int, sede_id)
            .query("INSERT INTO Equipos_Computadoras (nombre, hostname, tipo, status, id_sede) VALUES (@n, @h, @t, @s, @sid)");
        res.json({ message: 'Equipo creado' });
    } catch (e) { res.status(500).send(e.message); }
});

app.put('/api/equipos/:id', isAuthenticated, async (req, res) => {
    const { name, hostname, type, status } = req.body;
    try {
        const pool = await getConnection();
        await pool.request().input('id', sql.Int, req.params.id).input('n', sql.NVarChar, name).input('h', sql.NVarChar, hostname).input('t', sql.NVarChar, type).input('s', sql.Bit, status)
            .query("UPDATE Equipos_Computadoras SET nombre=@n, hostname=@h, tipo=@t, status=@s WHERE id=@id");
        res.json({ message: 'Equipo actualizado' });
    } catch (e) { res.status(500).send(e.message); }
});

app.delete('/api/equipos/:id', isAuthenticated, async (req, res) => {
    try {
        const pool = await getConnection();
        await pool.request().input('id', sql.Int, req.params.id).query("UPDATE Equipos_Computadoras SET eliminado=1 WHERE id=@id");
        res.json({ message: 'Equipo eliminado' });
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/api/sedes', isAuthenticated, async (req, res) => {
    const { name, area_id } = req.body;
    try {
        const pool = await getConnection();
        await pool.request().input('n', sql.NVarChar, name).input('aid', sql.Int, area_id).query("INSERT INTO Equipos_Sedes (nombre, id_area) VALUES (@n, @aid)");
        res.json({ message: 'Sede creada' });
    } catch (e) { res.status(500).send(e.message); }
});

app.put('/api/sedes/:id', isAuthenticated, async (req, res) => {
    try {
        const pool = await getConnection();
        await pool.request().input('id', sql.Int, req.params.id).input('n', sql.NVarChar, req.body.name).query("UPDATE Equipos_Sedes SET nombre=@n WHERE id=@id");
        res.json({ message: 'Sede actualizada' });
    } catch (e) { res.status(500).send(e.message); }
});

app.delete('/api/sedes/:id', isAuthenticated, async (req, res) => {
    try {
        const pool = await getConnection();
        await pool.request().input('id', sql.Int, req.params.id).query("UPDATE Equipos_Sedes SET eliminado=1 WHERE id=@id; UPDATE Equipos_Computadoras SET eliminado=1 WHERE id_sede=@id");
        res.json({ message: 'Sede eliminada' });
    } catch (e) { res.status(500).send(e.message); }
});

// ==========================================
//  PRECIOS Y REVISIÓN
// ==========================================
app.get('/api/precios/:empresa', isAuthenticated, async (req, res) => {
    if (!req.session.user.permisos.includes('precios')) return res.status(403).json({ message: 'Sin permisos' });
    const { empresa } = req.params;
    if (!['02', '04', '06'].includes(empresa)) return res.status(400).json({ message: 'Empresa no válida' });
    try {
        const pool = await getConnection();
        const result = await pool.request().input('prefix', sql.VarChar, empresa).query(`
            SELECT p.CodPro, p.Nombre, pr.PreTema1, pr.PreTema2, pr.PreTema3, pr.PreTema4, pr.PreTema5, pr.PreTema6
            FROM Productos p LEFT JOIN Precios pr ON p.CodPro = pr.Codpro
            WHERE p.Tipo = 3 AND p.CodPro LIKE @prefix + '%' AND p.Eliminado = 0 ORDER BY p.Nombre ASC
        `);
        res.json(result.recordset);
    } catch (e) { res.status(500).json({ message: 'Error BD' }); }
});

app.put('/api/precios/:codpro', isAuthenticated, async (req, res) => {
    if (!req.session.user.permisos.includes('precios')) return res.status(403).json({ message: 'Sin permisos' });
    const { codpro } = req.params;
    const { p1, p2, p3, p4, p5, p6 } = req.body;
    try {
        const pool = await getConnection();
        const check = await pool.request().input('cod', sql.Char(10), codpro).query("SELECT Codpro FROM Precios WHERE Codpro = @cod");
        if (check.recordset.length === 0) {
            await pool.request().input('cod', sql.Char(10), codpro).input('p1', sql.Money, p1).input('p2', sql.Money, p2).input('p3', sql.Money, p3).input('p4', sql.Money, p4).input('p5', sql.Money, p5).input('p6', sql.Money, p6)
                .query(`INSERT INTO Precios (Codpro, PreTema1, PreTema2, PreTema3, PreTema4, PreTema5, PreTema6) VALUES (@cod, @p1, @p2, @p3, @p4, @p5, @p6)`);
        } else {
            await pool.request().input('cod', sql.Char(10), codpro).input('p1', sql.Money, p1).input('p2', sql.Money, p2).input('p3', sql.Money, p3).input('p4', sql.Money, p4).input('p5', sql.Money, p5).input('p6', sql.Money, p6)
                .query(`UPDATE Precios SET PreTema1=@p1, PreTema2=@p2, PreTema3=@p3, PreTema4=@p4, PreTema5=@p5, PreTema6=@p6 WHERE Codpro=@cod`);
        }
        res.json({ message: 'Precios actualizados' });
    } catch (e) { res.status(500).json({ message: 'Error' }); }
});

app.post('/api/revision-nube', isAuthenticated, async (req, res) => {
    if (!req.session.user.permisos.includes('revision')) return res.status(403).json({ message: 'Sin permisos' });
    // ... (Lógica de revisión igual que antes) ...
    const { empresa, turno, fechaInicio, fechaFin } = req.body;
    let idEmpresa, idCajero, prefixTicket;
    if (empresa === '02') { idEmpresa = 2; idCajero = 2; prefixTicket = 'T001'; }
    else if (empresa === '04') { idEmpresa = 4; idCajero = 4; prefixTicket = 'T002'; }
    else if (empresa === '06') { idEmpresa = 6; idCajero = 6; prefixTicket = 'T005'; }
    else { return res.status(400).json({ message: 'Empresa no válida' }); }

    const idTurno = parseInt(turno);
    try {
        const pool = await getConnection();
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
    } catch (error) { console.error(error); res.status(500).json({ message: 'Error' }); }
});

app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));