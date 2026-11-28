const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const vm = require('../lib/ventas-mesas-report');

const filtros = { empresa: 'Cocineria', turno: 0, fechaInicio: '2026-11-01', fechaFin: '2026-11-03' };

function filasEjemplo() {
    return [
        { mesa: 1, mozo: 20, dia: '2026-11-01', tickets: 2, total: 100.10 },
        { mesa: 85, mozo: 15, dia: '2026-11-01', tickets: 1, total: 24.00 },
        { mesa: 201, mozo: 15, dia: '2026-11-02', tickets: 3, total: 90.50 },
        { mesa: 212, mozo: 15, dia: '2026-11-02', tickets: 1, total: 31.00 },
        { mesa: 221, mozo: 195, dia: '2026-11-02', tickets: 4, total: 200.00 },
        { mesa: 222, mozo: 203, dia: '2026-11-03', tickets: 2, total: 80.20 },
        { mesa: 223, mozo: 51, dia: '2026-11-03', tickets: 1, total: 10.00 },
        { mesa: 233, mozo: 15, dia: '2026-11-03', tickets: 1, total: 0 },
        { mesa: 300, mozo: 15, dia: '2026-11-03', tickets: 1, total: 12.35 },
        { mesa: 0, mozo: 15, dia: '2026-11-03', tickets: 1, total: 5.00 }
    ];
}

test('prefijo de ticket por empresa y rechazo de empresa inválida', () => {
    assert.equal(vm.prefijoTicket('Cocineria'), 'T001-');
    assert.equal(vm.prefijoTicket('Mar Picante 1'), 'T002-');
    assert.equal(vm.prefijoTicket('Inversiones Abruzzo Sac'), 'T005-');
    assert.throws(() => vm.prefijoTicket('Otra'), error => error.status === 400);
});

test('etiquetas de turno invertidas para Cocineria', () => {
    assert.equal(vm.turnoMesasLabel('Cocineria', 1), 'Tarde-Noche');
    assert.equal(vm.turnoMesasLabel('Cocineria', 2), 'Mañana');
    assert.equal(vm.turnoMesasLabel('Mar Picante 1', 1), 'Mañana');
    assert.equal(vm.turnoMesasLabel('Inversiones Abruzzo Sac', 2), 'Tarde-Noche');
    assert.equal(vm.turnoMesasLabel('Cocineria', 0), 'Ambos turnos');
});

test('clasifica los límites de cada tipo de mesa', () => {
    const casos = [
        [1, 'normal'], [80, 'normal'], [81, 'desayunos'], [120, 'desayunos'], [121, 'normal'], [200, 'normal'],
        [201, 'delivery'], [209, 'delivery'], [210, 'llevar'], [219, 'llevar'],
        [231, 'descarte'], [235, 'descarte'], [236, 'varios'], [320, 'varios'],
        [321, 'sinclasificar'], [0, 'sinclasificar'], [null, 'sinclasificar'], [-3, 'sinclasificar']
    ];
    casos.forEach(([mesa, esperado]) => assert.equal(vm.clasificarMesa(mesa, 15), esperado, `mesa ${mesa}`));
});

test('mesas 220-230 dependen del mozo (PedidosYa, Rappi u Otros apps)', () => {
    assert.equal(vm.clasificarMesa(220, 195), 'pedidosya');
    assert.equal(vm.clasificarMesa(230, 203), 'rappi');
    assert.equal(vm.clasificarMesa(225, 51), 'otrasapps');
    assert.equal(vm.clasificarMesa(225, null), 'otrasapps');
    assert.equal(vm.clasificarMesa(219, 195), 'llevar');
    assert.equal(vm.clasificarMesa(231, 203), 'descarte');
});

test('la suma de los grupos coincide con el total general', () => {
    const report = vm.buildMesasReport({ filas: filasEjemplo(), filtros });
    const suma = report.grupos.reduce((s, g) => s + g.total, 0);
    const tickets = report.grupos.reduce((s, g) => s + g.tickets, 0);
    assert.equal(Math.round(suma * 100) / 100, report.resumen.total);
    assert.equal(report.resumen.total, 553.15);
    assert.equal(tickets, 17);
    assert.equal(report.resumen.tickets, 17);
    const porClave = Object.fromEntries(report.grupos.map(g => [g.clave, g]));
    assert.equal(porClave.pedidosya.total, 200);
    assert.equal(porClave.rappi.total, 80.2);
    assert.equal(porClave.otrasapps.total, 10);
    assert.equal(porClave.sinclasificar.total, 5);
    assert.equal(report.apps.total, 290.2);
    assert.equal(report.apps.tickets, 7);
    assert.equal(report.resumen.lider.clave, 'pedidosya');
    assert.ok(Math.abs(report.grupos.reduce((s, g) => s + g.porcentaje, 0) - 1) < 1e-9);
});

test('evolución diaria reconcilia con el total y cubre días sin ventas', () => {
    const report = vm.buildMesasReport({ filas: filasEjemplo(), filtros: { ...filtros, fechaFin: '2026-11-04' } });
    assert.equal(report.evolucion.granularidad, 'diaria');
    assert.equal(report.evolucion.periodos.length, 4);
    assert.equal(report.evolucion.periodos[3].total, 0);
    const suma = report.evolucion.periodos.reduce((s, p) => s + p.total, 0);
    assert.equal(Math.round(suma * 100) / 100, report.resumen.total);
});

test('resultado vacío: grupos estándar en cero y sin "Sin clasificar"', () => {
    const report = vm.buildMesasReport({ filas: [], filtros });
    assert.equal(report.resumen.total, 0);
    assert.equal(report.resumen.lider, null);
    assert.equal(report.grupos.length, 9);
    assert.ok(!report.grupos.some(g => g.clave === 'sinclasificar'));
});

test('comparación con periodo anterior del mismo largo', () => {
    assert.deepEqual(vm.periodoAnterior('2026-11-01', '2026-11-30'), { fechaInicio: '2026-10-02', fechaFin: '2026-10-31', dias: 30 });
    assert.deepEqual(vm.periodoAnterior('2026-03-01', '2026-03-01'), { fechaInicio: '2026-02-28', fechaFin: '2026-02-28', dias: 1 });
    const anterior = { fechaInicio: '2026-10-29', fechaFin: '2026-10-31', filas: [{ mesa: 221, mozo: 195, dia: '2026-10-30', tickets: 2, total: 100 }] };
    const report = vm.buildMesasReport({ filas: filasEjemplo(), filtros, anterior });
    const pedidos = report.grupos.find(g => g.clave === 'pedidosya');
    assert.equal(pedidos.anterior.total, 100);
    assert.equal(pedidos.variacion, 1);
    assert.equal(report.grupos.find(g => g.clave === 'normal').variacion, null);
    assert.equal(report.anterior.total, 100);
});

test('whereGrupo genera SQL equivalente a la clasificación', () => {
    assert.equal(vm.whereGrupo('todos'), '1 = 1');
    assert.equal(vm.whereGrupo('normal'), '((NroMesa BETWEEN 1 AND 80 OR NroMesa BETWEEN 121 AND 200))');
    assert.equal(vm.whereGrupo('pedidosya'), '((NroMesa BETWEEN 220 AND 230) AND Mozo = 195)');
    assert.match(vm.whereGrupo('otrasapps'), /Mozo IS NULL OR Mozo NOT IN \(195, 203\)/);
    assert.match(vm.whereGrupo('sinclasificar'), /^\(NroMesa IS NULL OR NOT \(/);
    assert.match(vm.whereGrupo('apps'), /Mozo = 195.* OR .*Mozo = 203.* OR /);
    assert.throws(() => vm.whereGrupo("normal'; DROP TABLE x"), error => error.status === 400);
});

test('normaliza tickets con fecha y grupo', () => {
    const t = vm.normalizarTicket({ NroTicket: 'T001-000049         ', NroMesa: 221, Mozo: 195, Fecha: new Date('2021-09-08T11:04:00Z'), Turno: 1, Flete: 0, Propina: 0, Total: 38 });
    assert.deepEqual(t, { nroTicket: 'T001-000049', mesa: 221, mozo: 195, grupo: 'pedidosya', grupoEtiqueta: 'PedidosYa', fecha: '2021-09-08 11:04', turno: 1, flete: 0, propina: 0, total: 38 });
});

test('genera gráfica PNG, Excel con hojas y PDF válido', async () => {
    const anterior = { fechaInicio: '2026-10-29', fechaFin: '2026-10-31', filas: [{ mesa: 5, mozo: 1, dia: '2026-10-30', tickets: 1, total: 50 }] };
    const report = vm.buildMesasReport({ filas: filasEjemplo(), filtros, anterior, generadoPor: 'Prueba' });
    const charts = await vm.createCharts(report);
    assert.deepEqual(charts.columnas.subarray(1, 4), Buffer.from('PNG'));
    const tickets = [vm.normalizarTicket({ NroTicket: 'T001-1', NroMesa: 1, Mozo: 20, Fecha: '2026-11-01 10:00', Turno: 2, Flete: 0, Propina: 1, Total: 50.05 }),
        vm.normalizarTicket({ NroTicket: 'T001-2', NroMesa: 1, Mozo: 20, Fecha: '2026-11-01 11:00', Turno: 2, Flete: 0, Propina: 0, Total: 50.05 })];
    const detalle = { seleccion: 'normal', mesa: null, truncado: false, tickets, totales: { tickets: 2, total: 100.10, flete: 0, propina: 1 } };

    const xlsx = await vm.createExcelBuffer(report, charts, detalle);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsx);
    assert.deepEqual(workbook.worksheets.map(ws => ws.name), ['Resumen', 'Evolución', 'Tickets']);
    const resumen = workbook.getWorksheet('Resumen');
    const totalRow = 12 + report.grupos.length;
    assert.equal(resumen.getCell(totalRow, 1).value, 'TOTAL GENERAL');
    assert.equal(resumen.getCell(totalRow, 4).value.result, report.resumen.total);
    const hoja = workbook.getWorksheet('Tickets');
    assert.equal(hoja.getCell('I7').value.formula, 'SUBTOTAL(109,I5:I6)');

    const pdf = await vm.createPdfBuffer(report, charts, detalle);
    assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
    const vacio = vm.buildMesasReport({ filas: [], filtros });
    const pdfVacio = await vm.createPdfBuffer(vacio, await vm.createCharts(vacio), { ...detalle, tickets: [], totales: { tickets: 0, total: 0, flete: 0, propina: 0 } });
    assert.equal(pdfVacio.subarray(0, 4).toString(), '%PDF');
    assert.equal(vm.reportFilename(report, 'xlsx'), 'VentasTipoMesa_Cocineria_2026-11-01_2026-11-03.xlsx');
});
