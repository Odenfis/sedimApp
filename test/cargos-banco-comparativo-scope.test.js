const test = require('node:test');
const assert = require('node:assert/strict');
const {
    resolveComparativoEmpresa,
    displayComparativoEmpresa
} = require('../lib/cargos-banco-comparativo-scope');

const companies = [
    { nombre_ventas: 'Cocineria', nombre_visible: 'Cocineria' },
    { nombre_ventas: 'Mar Picante 1', nombre_visible: 'Mar Picante' },
    { nombre_ventas: 'Inversiones Abruzzo Sac', nombre_visible: 'Abruzzo' }
];

test('resuelve nombres visibles y operativos al nombre usado por la vista bancaria', () => {
    assert.equal(resolveComparativoEmpresa('Mar Picante', companies).empresa, 'Mar Picante 1');
    assert.equal(resolveComparativoEmpresa('Mar Picante 1', companies).empresa, 'Mar Picante 1');
    assert.equal(resolveComparativoEmpresa('Abruzzo', companies).empresa, 'Inversiones Abruzzo Sac');
    assert.equal(resolveComparativoEmpresa('Inversiones Abruzzo Sac', companies).empresa, 'Inversiones Abruzzo Sac');
    assert.equal(resolveComparativoEmpresa('Cocineria', companies).empresa, 'Cocineria');
});

test('todas las autorizadas contiene solo nombres operativos', () => {
    const scope = resolveComparativoEmpresa('all', companies);
    assert.deepEqual(scope.nombresPermitidos, ['Cocineria', 'Mar Picante 1', 'Inversiones Abruzzo Sac']);
    assert.equal(scope.nombresPermitidos.includes('Mar Picante'), false);
    assert.equal(scope.nombresPermitidos.includes('Abruzzo'), false);
});

test('conserva etiquetas visibles y rechaza empresas fuera del alcance', () => {
    const scope = resolveComparativoEmpresa('mar picante', companies);
    assert.equal(scope.empresaEtiqueta, 'Mar Picante');
    assert.equal(displayComparativoEmpresa('Mar Picante 1', scope.etiquetasEmpresa), 'Mar Picante');
    assert.throws(
        () => resolveComparativoEmpresa('Oficina', companies),
        error => error.status === 403 && error.message === 'No tiene acceso a la empresa solicitada'
    );
});
