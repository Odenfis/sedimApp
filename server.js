const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { getConnection, sql } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// Middleware
app.use(express.json());
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret',
    resave: false,
    saveUninitialized: false, // Importante dejarlo en false para no llenar memoria
    cookie: {
        secure: false,      // OBLIGATORIO en false para localhost (http)
        httpOnly: true,     // Seguridad contra XSS
        sameSite: 'lax',    // Importante para navegadores modernos en local
        maxAge: 1000 * 60 * 60 * 24 // 24 horas
    }
}));
app.use(express.static('public'));


// --- SEGURIDAD: Verificar si está logueado ---
function isAuthenticated(req, res, next) {
    if (req.session.user) return next();
    res.status(401).json({ message: 'No autorizado' });
}

// --- RUTAS DE AUTENTICACIÓN ---

// Login
app.post('/api/login', async (req, res) => {
    const { usuario, password } = req.body;
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('usuario', sql.NVarChar, usuario)
            .query('SELECT * FROM usuariosweb WHERE usuario = @usuario');

        if (result.recordset.length === 0) {
            return res.status(400).json({ message: 'Usuario no encontrado' });
        }

        const user = result.recordset[0];
        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
            return res.status(400).json({ message: 'Contraseña incorrecta' });
        }

        // Guardar datos en sesión
        req.session.user = { id: user.id, usuario: user.usuario, nombre: user.nombre };

        // IMPORTANTE: Forzar guardado antes de responder
        req.session.save(err => {
            if (err) {
                return res.status(500).json({ message: 'Error de sesión' });
            }
            res.json({ message: 'Login exitoso', user: req.session.user });
        });

    } catch (error) {
        res.status(500).send(error.message);
    }
});

// Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: 'Sesión cerrada' });
});

// Verificar sesión al cargar
app.get('/api/session', (req, res) => {
    if (req.session.user) res.json({ user: req.session.user });
    else res.status(401).send();
});

// --- RUTAS DE USUARIOS (AZURE SQL) ---

// Listar Usuarios
app.get('/api/session', (req, res) => {
    console.log("--> Verificando sesión...");
    console.log("Cookie recibida:", req.headers.cookie);
    console.log("Usuario en sesión:", req.session.user);

    if (req.session.user) {
        res.json({ user: req.session.user });
    } else {
        console.log("❌ Acceso denegado: No hay usuario en sesión");
        res.status(401).send();
    }
});

// Crear Usuario
app.post('/api/users', isAuthenticated, async (req, res) => {
    const { usuario, password, nombre } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    try {
        const pool = await getConnection();
        await pool.request()
            .input('usuario', sql.NVarChar, usuario)
            .input('password', sql.NVarChar, hashedPassword)
            .input('nombre', sql.NVarChar, nombre)
            .query('INSERT INTO usuariosweb (usuario, password, nombre) VALUES (@usuario, @password, @nombre)');
        res.json({ message: 'Usuario creado' });
    } catch (err) {
        res.status(500).json({ message: 'Error creando usuario' });
    }
});

// Eliminar Usuario
app.delete('/api/users/:id', isAuthenticated, async (req, res) => {
    const { id } = req.params;
    const pool = await getConnection();
    await pool.request().input('id', sql.Int, id).query('DELETE FROM usuariosweb WHERE id = @id');
    res.json({ message: 'Usuario eliminado' });
});

// --- RUTAS DE EQUIPOS (JSON - Lo que ya tenías) ---
app.get('/api/data', isAuthenticated, (req, res) => {
    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Error');
        res.json(JSON.parse(data));
    });
});

app.post('/api/data', isAuthenticated, (req, res) => {
    fs.writeFile(DATA_FILE, JSON.stringify(req.body, null, 2), (err) => {
        if (err) return res.status(500).send('Error');
        res.json({ message: 'Guardado' });
    });
});

//cambio ya en version local como version nube
app.get('/', (req, res) => {
    res.redirect('/login.html');
});

// ==========================================
//  MÓDULO: CAMBIO DE PRECIOS
// ==========================================

// 1. Obtener productos y precios por prefijo de empresa
app.get('/api/precios/:empresa', isAuthenticated, async (req, res) => {
    const { empresa } = req.params; // '02', '04', '06'

    // Validación de seguridad para el prefijo
    if (!['02', '04', '06'].includes(empresa)) {
        return res.status(400).json({ message: 'Empresa no válida' });
    }

    try {
        const pool = await getConnection();
        const query = `
            SELECT 
                p.CodPro, 
                p.Nombre, 
                pr.PreTema1, pr.PreTema2, pr.PreTema3, 
                pr.PreTema4, pr.PreTema5, pr.PreTema6
            FROM Productos p
            LEFT JOIN Precios pr ON p.CodPro = pr.Codpro
            WHERE p.Tipo = 3 
              AND p.CodPro LIKE @prefix + '%'
              AND p.Eliminado = 0
            ORDER BY p.Nombre ASC
        `;

        const result = await pool.request()
            .input('prefix', sql.VarChar, empresa)
            .query(query);

        res.json(result.recordset);
    } catch (error) {
        console.error("Error obteniendo precios:", error);
        res.status(500).json({ message: 'Error en base de datos' });
    }
});

// 2. Actualizar precios de un producto
app.put('/api/precios/:codpro', isAuthenticated, async (req, res) => {
    const { codpro } = req.params;
    const { p1, p2, p3, p4, p5, p6 } = req.body;

    try {
        const pool = await getConnection();

        // Primero verificamos si existe registro en tabla Precios, sino lo insertamos (Upsert logic simple)
        const check = await pool.request()
            .input('cod', sql.Char(10), codpro)
            .query("SELECT Codpro FROM Precios WHERE Codpro = @cod");

        if (check.recordset.length === 0) {
            // Si no existe en Precios, lo creamos
            await pool.request()
                .input('cod', sql.Char(10), codpro)
                .input('p1', sql.Money, p1)
                .input('p2', sql.Money, p2)
                .input('p3', sql.Money, p3)
                .input('p4', sql.Money, p4)
                .input('p5', sql.Money, p5)
                .input('p6', sql.Money, p6)
                .query(`INSERT INTO Precios (Codpro, PreTema1, PreTema2, PreTema3, PreTema4, PreTema5, PreTema6) 
                        VALUES (@cod, @p1, @p2, @p3, @p4, @p5, @p6)`);
        } else {
            // Si existe, actualizamos
            await pool.request()
                .input('cod', sql.Char(10), codpro)
                .input('p1', sql.Money, p1)
                .input('p2', sql.Money, p2)
                .input('p3', sql.Money, p3)
                .input('p4', sql.Money, p4)
                .input('p5', sql.Money, p5)
                .input('p6', sql.Money, p6)
                .query(`UPDATE Precios SET 
                        PreTema1=@p1, PreTema2=@p2, PreTema3=@p3, 
                        PreTema4=@p4, PreTema5=@p5, PreTema6=@p6 
                        WHERE Codpro=@cod`);
        }

        res.json({ message: 'Precios actualizados' });
    } catch (error) {
        console.error("Error actualizando precios:", error);
        res.status(500).json({ message: 'Error actualizando' });
    }
});

app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));