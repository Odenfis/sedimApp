const test = require('node:test');
const assert = require('node:assert/strict');
const { isCargoDetalleMes } = require('../lib/cargo-resultado-validation');

test('detalle de cargo admite el periodo completo (mes 0) y los doce meses', () => {
    for (let mes = 0; mes <= 12; mes++) assert.equal(isCargoDetalleMes(mes), true);
});
test('detalle de cargo rechaza meses ausentes, fuera de rango o no enteros', () => {
    for (const mes of [undefined, null, '', '0', '1', false, -1, 13, 1.5, NaN, Infinity]) {
        assert.equal(isCargoDetalleMes(mes), false);
    }
});
