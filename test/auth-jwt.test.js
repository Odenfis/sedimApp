const test = require('node:test');
const assert = require('node:assert/strict');
const {
    firmarAccessToken,
    firmarRefreshToken,
    verificarAccessToken,
    verificarRefreshToken,
    AlmacenRefreshTokens
} = require('../lib/auth-jwt');

const usuarioEjemplo = {
    id: 7,
    usuario: 'wmoncada',
    nombre: 'Walter Moncada',
    rol: 'Administrador',
    permisos: ['herramientas', 'operaciones'],
    empresas: [{ id: 2, codigo_producto: '02', nombre_visible: 'Cocinería' }]
};

test('access token se firma y verifica con el payload del usuario', () => {
    const token = firmarAccessToken(usuarioEjemplo);
    const payload = verificarAccessToken(token);
    assert.ok(payload);
    assert.equal(payload.user.id, 7);
    assert.equal(payload.user.rol, 'Administrador');
    assert.deepEqual(payload.user.permisos, ['herramientas', 'operaciones']);
});

test('access token inválido o manipulado verifica como null', () => {
    assert.equal(verificarAccessToken('token-basura'), null);
    assert.equal(verificarAccessToken(''), null);
    const token = firmarAccessToken(usuarioEjemplo);
    assert.equal(verificarAccessToken(token.slice(0, -2) + 'xx'), null);
});

test('refresh token contiene jti, sub y tipo refresh', () => {
    const { token, jti, expiraEn } = firmarRefreshToken(usuarioEjemplo);
    const payload = verificarRefreshToken(token);
    assert.ok(payload);
    assert.equal(payload.sub, 7);
    assert.equal(payload.jti, jti);
    assert.equal(payload.tipo, 'refresh');
    assert.ok(expiraEn > Date.now());
});

test('access token no puede usarse como refresh token', () => {
    const accessToken = firmarAccessToken(usuarioEjemplo);
    assert.equal(verificarRefreshToken(accessToken), null);
});

test('almacén de refresh tokens registra, valida y revoca por usuario', () => {
    const almacen = new AlmacenRefreshTokens();
    const { jti, expiraEn } = firmarRefreshToken(usuarioEjemplo);

    almacen.registrar(7, jti, expiraEn);
    assert.equal(almacen.validar(7, jti), true);
    assert.equal(almacen.validar(99, jti), false); // otro usuario
    assert.equal(almacen.validar(7, 'jti-inexistente'), false);

    almacen.revocar(7, jti);
    assert.equal(almacen.validar(7, jti), false);
});

test('almacén revoca todos los tokens de un usuario (logout)', () => {
    const almacen = new AlmacenRefreshTokens();
    const t1 = firmarRefreshToken(usuarioEjemplo);
    const t2 = firmarRefreshToken(usuarioEjemplo);
    almacen.registrar(7, t1.jti, t1.expiraEn);
    almacen.registrar(7, t2.jti, t2.expiraEn);

    almacen.revocar(7);
    assert.equal(almacen.validar(7, t1.jti), false);
    assert.equal(almacen.validar(7, t2.jti), false);
});

test('almacén limita tokens activos por usuario (rotación)', () => {
    const almacen = new AlmacenRefreshTokens({ maxPorUsuario: 2 });
    const jtis = [];
    for (let i = 0; i < 4; i++) {
        const t = firmarRefreshToken(usuarioEjemplo);
        jtis.push(t.jti);
        almacen.registrar(7, t.jti, Date.now() + i * 1000 + 10_000);
    }
    // Solo se conservan los 2 más recientes
    assert.equal(almacen.validar(7, jtis[0]), false);
    assert.equal(almacen.validar(7, jtis[1]), false);
    assert.equal(almacen.validar(7, jtis[2]), true);
    assert.equal(almacen.validar(7, jtis[3]), true);
});

test('almacén limpia tokens expirados', () => {
    const almacen = new AlmacenRefreshTokens();
    const t = firmarRefreshToken(usuarioEjemplo);
    almacen.registrar(7, t.jti, Date.now() - 1000); // ya expiró
    assert.equal(almacen.validar(7, t.jti), false);
});
