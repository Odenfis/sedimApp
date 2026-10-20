// ============================================
//  AUTENTICACIÓN JWT (ACCESS + REFRESH TOKEN)
//  Access token: corta duración (24h) -> header Authorization: Bearer <token>
//  Refresh token: larga duración (30d) -> POST /api/token/refresh
//  Mantener sesiones de la web (express-session) funcionando en paralelo.
// ============================================
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Secret derivado del SESSION_SECRET para no agregar otra variable de entorno.
const SECRETO_BASE = process.env.SESSION_SECRET || 'warzone';
const SECRETO_ACCESS = crypto.createHash('sha256').update(`${SECRETO_BASE}::access`).digest('hex');
const SECRETO_REFRESH = crypto.createHash('sha256').update(`${SECRETO_BASE}::refresh`).digest('hex');

const ACCESS_EXPIRA = '24h';
const REFRESH_EXPIRA_DIAS = 30;
const REFRESH_EXPIRA_MS = REFRESH_EXPIRA_DIAS * 24 * 60 * 60 * 1000;

/**
 * Genera un access token corto con los datos del usuario.
 * @param {{ id: number, usuario: string, nombre: string, rol: string, permisos: string[], empresas: any[] }} user
 * @returns {string}
 */
function firmarAccessToken(user) {
    return jwt.sign({ user }, SECRETO_ACCESS, { expiresIn: ACCESS_EXPIRA });
}

/**
 * Genera un refresh token (payload mínimo: id del usuario + jti único).
 * @param {{ id: number }} user
 * @returns {{ token: string, jti: string, expiraEn: number }}
 */
function firmarRefreshToken(user) {
    const jti = crypto.randomUUID();
    const token = jwt.sign(
        { sub: user.id, jti, tipo: 'refresh' },
        SECRETO_REFRESH,
        { expiresIn: `${REFRESH_EXPIRA_DIAS}d` }
    );
    return { token, jti, expiraEn: Date.now() + REFRESH_EXPIRA_MS };
}

/**
 * Verifica un access token.
 * @param {string} token
 * @returns {{ user: any } | null} Payload decodificado o null si es inválido/expirado.
 */
function verificarAccessToken(token) {
    try {
        return jwt.verify(token, SECRETO_ACCESS);
    } catch (_) {
        return null;
    }
}

/**
 * Verifica un refresh token.
 * @param {string} token
 * @returns {{ sub: number, jti: string, tipo: string } | null}
 */
function verificarRefreshToken(token) {
    try {
        const payload = jwt.verify(token, SECRETO_REFRESH);
        if (payload.tipo !== 'refresh') return null;
        return payload;
    } catch (_) {
        return null;
    }
}

// --------------------------------------------
//  ALMACÉN DE REFRESH TOKENS (en memoria)
//  Render reinicia el proceso en cada deploy:
//  los tokens se invalidan y el usuario debe
//  iniciar sesión de nuevo (comportamiento seguro).
// --------------------------------------------
class AlmacenRefreshTokens {
    constructor({ maxPorUsuario = 5 } = {}) {
        this.maxPorUsuario = maxPorUsuario;
        this.tokens = new Map(); // userId -> Map(jti -> { expiraEn })
    }

    _limpiarExpirados(userId) {
        const set = this.tokens.get(userId);
        if (!set) return;
        const ahora = Date.now();
        for (const [jti, info] of set) {
            if (info.expiraEn <= ahora) set.delete(jti);
        }
        if (set.size === 0) this.tokens.delete(userId);
    }

    /**
     * Registra un refresh token emitido para el usuario.
     * @param {number} userId
     * @param {string} jti
     * @param {number} expiraEn
     */
    registrar(userId, jti, expiraEn) {
        if (!this.tokens.has(userId)) this.tokens.set(userId, new Map());
        const set = this.tokens.get(userId);
        set.set(jti, { expiraEn });
        // Limitar tokens activos por usuario (rotación): elimina los más viejos
        while (set.size > this.maxPorUsuario) {
            const masViejo = [...set.entries()].sort((a, b) => a[1].expiraEn - b[1].expiraEn)[0];
            set.delete(masViejo[0]);
        }
    }

    /**
     * Valida que el jti exista y no esté expirado.
     * @param {number} userId
     * @param {string} jti
     * @returns {boolean}
     */
    validar(userId, jti) {
        this._limpiarExpirados(userId);
        return this.tokens.get(userId)?.has(jti) || false;
    }

    /**
     * Revoca un token específico (logout) o todos los del usuario.
     * @param {number} userId
     * @param {string|null} [jti]
     */
    revocar(userId, jti = null) {
        if (jti === null) this.tokens.delete(userId);
        else this.tokens.get(userId)?.delete(jti);
    }
}

module.exports = {
    firmarAccessToken,
    firmarRefreshToken,
    verificarAccessToken,
    verificarRefreshToken,
    AlmacenRefreshTokens,
    ACCESS_EXPIRA,
    REFRESH_EXPIRA_MS
};
