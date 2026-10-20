const test = require('node:test');
const assert = require('node:assert/strict');
const { crearLimitador } = require('../lib/rate-limiter');

/** Simula req/res/next para probar el middleware sin Express. */
function simularPeticion(limitador, { ip = '1.2.3.4', usuario = undefined } = {}) {
    const headers = {};
    let statusCode = null;
    let cuerpo = null;
    const res = {
        setHeader: (k, v) => { headers[k] = v; },
        status: (code) => { statusCode = code; return res; },
        json: (data) => { cuerpo = data; return res; }
    };
    const req = { ip, socket: { remoteAddress: ip }, body: usuario !== undefined ? { usuario } : {} };
    let nextLlamado = false;
    limitador(req, res, () => { nextLlamado = true; });
    return { nextLlamado, statusCode, cuerpo, headers };
}

test('rate limiter permite hasta el máximo de peticiones por ventana', () => {
    const limitador = crearLimitador({ ventanaMs: 60_000, max: 3 });
    for (let i = 0; i < 3; i++) {
        const r = simularPeticion(limitador);
        assert.equal(r.nextLlamado, true, `petición ${i + 1} debe pasar`);
        assert.equal(r.statusCode, null);
    }
});

test('rate limiter bloquea con 429 al exceder el máximo', () => {
    const limitador = crearLimitador({ ventanaMs: 60_000, max: 2, mensaje: { message: 'bloqueado' } });
    simularPeticion(limitador);
    simularPeticion(limitador);
    const r = simularPeticion(limitador);
    assert.equal(r.nextLlamado, false);
    assert.equal(r.statusCode, 429);
    assert.deepEqual(r.cuerpo, { message: 'bloqueado' });
    assert.ok(r.headers['Retry-After'] >= 0);
});

test('rate limiter tiene clave por IP + usuario (usuarios distintos no se bloquean entre sí)', () => {
    const limitador = crearLimitador({ ventanaMs: 60_000, max: 1 });
    assert.equal(simularPeticion(limitador, { ip: '9.9.9.9', usuario: 'ana' }).nextLlamado, true);
    // misma IP y usuario => bloqueado
    assert.equal(simularPeticion(limitador, { ip: '9.9.9.9', usuario: 'ana' }).statusCode, 429);
    // distinto usuario en la misma IP => pasa
    assert.equal(simularPeticion(limitador, { ip: '9.9.9.9', usuario: 'luis' }).nextLlamado, true);
    // distinta IP => pasa
    assert.equal(simularPeticion(limitador, { ip: '8.8.8.8', usuario: 'ana' }).nextLlamado, true);
});

test('rate limiter reinicia el conteo al expirar la ventana', () => {
    const limitador = crearLimitador({ ventanaMs: 30, max: 1 });
    assert.equal(simularPeticion(limitador).nextLlamado, true);
    assert.equal(simularPeticion(limitador).statusCode, 429);
    // Espera a que expire la ventana (30ms) y reintenta
    return new Promise((resolve) => setTimeout(() => {
        assert.equal(simularPeticion(limitador).nextLlamado, true);
        resolve();
    }, 50));
});
