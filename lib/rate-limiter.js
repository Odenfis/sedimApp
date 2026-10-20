// ============================================
//  RATE LIMITER EN MEMORIA (VENTANA FIJA)
//  Protege los endpoints de autenticación contra
//  fuerza bruta sin depender de servicios externos.
// ============================================

/**
 * Crea un middleware de limitación de velocidad en memoria.
 * @param {{ ventanaMs?: number, max?: number, mensaje?: string }} opciones
 *   - ventanaMs: tamaño de la ventana en milisegundos (default 15 min).
 *   - max: máximo de peticiones por ventana por clave (default 10).
 *   - mensaje: cuerpo JSON al ser bloqueado.
 * @returns {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => void}
 */
function crearLimitador({ ventanaMs = 15 * 60 * 1000, max = 10, mensaje } = {}) {
    const peticiones = new Map(); // clave -> { conteo, expiraEn }

    // Limpieza periódica para no acumular memoria
    const intervalo = setInterval(() => {
        const ahora = Date.now();
        for (const [clave, info] of peticiones) {
            if (info.expiraEn <= ahora) peticiones.delete(clave);
        }
    }, Math.min(ventanaMs, 60 * 1000));
    if (typeof intervalo.unref === 'function') intervalo.unref();

    return function limitador(req, res, next) {
        const ahora = Date.now();
        const ip = req.ip || req.socket?.remoteAddress || 'desconocida';
        const usuario = req.body?.usuario ? String(req.body.usuario).toLowerCase() : '';
        const clave = `${ip}::${usuario}`;

        let info = peticiones.get(clave);
        if (!info || info.expiraEn <= ahora) {
            info = { conteo: 0, expiraEn: ahora + ventanaMs };
            peticiones.set(clave, info);
        }
        info.conteo += 1;

        res.setHeader('X-RateLimit-Limit', max);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, max - info.conteo));
        res.setHeader('X-RateLimit-Reset', Math.ceil(info.expiraEn / 1000));

        if (info.conteo > max) {
            const reintentarEn = Math.ceil((info.expiraEn - ahora) / 1000);
            res.setHeader('Retry-After', reintentarEn);
            return res.status(429).json(mensaje || {
                message: `Demasiados intentos. Reintente en ${reintentarEn} segundos.`
            });
        }
        next();
    };
}

module.exports = { crearLimitador };
