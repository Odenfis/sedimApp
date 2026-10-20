const test = require('node:test');
const assert = require('node:assert/strict');
const {
    parseOffsetCliente,
    offsetServidor,
    diferenciaMinutos,
    etiquetaUtc,
    fechaCliente,
    truncarHora,
    metadatosTimezone
} = require('../lib/timezone');

test('parseOffsetCliente acepta offsets válidos (header numérico o string)', () => {
    assert.equal(parseOffsetCliente(300), 300);
    assert.equal(parseOffsetCliente('300'), 300);
    assert.equal(parseOffsetCliente('-120'), -120);
    assert.equal(parseOffsetCliente('0'), 0);
    assert.equal(parseOffsetCliente(300.7), 301); // redondea a entero
});

test('parseOffsetCliente rechaza offsets ausentes o fuera de rango', () => {
    for (const valor of [undefined, null, '', 'abc', NaN, Infinity, 841, -841]) {
        assert.equal(parseOffsetCliente(valor), null);
    }
});

test('diferenciaMinutos calcula cliente - servidor', () => {
    assert.equal(diferenciaMinutos(300, 300), 0);
    assert.equal(diferenciaMinutos(0, 300), -300);
    assert.equal(diferenciaMinutos(300, 0), 300);
});

test('etiquetaUtc formatea UTC±HH:MM según convención JS', () => {
    assert.equal(etiquetaUtc(300), 'UTC-05:00');   // Perú
    assert.equal(etiquetaUtc(0), 'UTC+00:00');     // UTC
    assert.equal(etiquetaUtc(-120), 'UTC+02:00');  // España verano
});

test('fechaCliente desplaza la fecha del servidor al horario del cliente', () => {
    // Servidor y cliente en Perú (300): la fecha no cambia
    const base = new Date('2026-10-19T12:00:00.000Z');
    assert.equal(fechaCliente(base, 0), '2026-10-19T12:00:00.000Z');
    // Cliente en UTC+2 (-120) con servidor UTC: el cliente va 2h "atrás" en offset JS
    assert.equal(fechaCliente(base, -120), '2026-10-19T14:00:00.000Z');
});

test('truncarHora deja horas, minutos y segundos en cero', () => {
    const truncada = truncarHora(new Date('2026-10-19T12:34:56.789Z'));
    assert.equal(truncada.getUTCHours(), 12);
    assert.equal(truncada.getUTCMinutes(), 0);
    assert.equal(truncada.getUTCSeconds(), 0);
    assert.equal(truncada.getUTCMilliseconds(), 0);
});

test('metadatosTimezone devuelve bloque completo coherente', () => {
    const meta = metadatosTimezone(300);
    assert.equal(meta.clientOffset, 300);
    assert.equal(typeof meta.serverOffset, 'number');
    assert.equal(meta.diff, 300 - offsetServidor());
    assert.ok(!Number.isNaN(Date.parse(meta.serverTime)));
    assert.ok(!Number.isNaN(Date.parse(meta.clientTime)));
});

test('metadatosTimezone usa el offset del servidor cuando el cliente no envía header', () => {
    const meta = metadatosTimezone(null);
    assert.equal(meta.clientOffset, meta.serverOffset);
    assert.equal(meta.diff, 0);
});
