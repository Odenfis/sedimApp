const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const {
    normalizeReason, isBankReason, documentType, automaticGranularity, buildComparisonReport,
    createCharts, createExcel, createPdf, reportFilename
} = require('../lib/cargos-banco-comparativo-report');

const filters = { empresa: 'all', fInicio: '2026-08-01', fFin: '2026-08-31', tipoDoc: '', tipoCargo: '', estado: 'TODOS', razon: '' };
const rows = [
    { Emp: 'Cocineria', TipoCargo: 'Carnes', Razon: 'Churrásco', FechaGrupo: '2026-08-01', EsBanco: 0, Monto: 100, Registros: 2 },
    { Emp: 'Cocineria', TipoCargo: 'Compras', Razon: ' churrasco  (banco)', FechaGrupo: '2026-08-02', EsBanco: 1, Monto: 120, Registros: 1 },
    { Emp: 'Cocineria', TipoCargo: 'Almacén', Razon: 'Abarrotes', FechaGrupo: '2026-08-01', EsBanco: 0, Monto: 80, Registros: 1 },
    { Emp: 'Cocineria', TipoCargo: 'Servicios', Razon: 'Internet (banco)', FechaGrupo: '2026-08-03', EsBanco: 1, Monto: 55, Registros: 1 }
];

test('normaliza razones y clasifica documentos sin confundir BAN con boleta', () => {
    assert.equal(normalizeReason('  Churrásco   (BANCO) '), 'CHURRASCO');
    assert.equal(isBankReason('Internet (banco)  '), true);
    assert.equal(documentType('BAN1-0023'), 'No declaradas');
    assert.equal(documentType('B001-25'), 'Boletas');
    assert.equal(documentType('F001-25'), 'Facturas');
    assert.equal(documentType('N001-25'), 'Notas de Venta');
    assert.equal(documentType('MI-25'), 'No declaradas');
});

test('selecciona automáticamente la densidad de la evolución', () => {
    assert.equal(automaticGranularity({ fInicio: '2026-01-01', fFin: '2026-02-14' }), 'diaria');
    assert.equal(automaticGranularity({ fInicio: '2026-01-01', fFin: '2026-02-15' }), 'semanal');
    assert.equal(automaticGranularity({ fInicio: '2026-01-01', fFin: '2026-06-29' }), 'semanal');
    assert.equal(automaticGranularity({ fInicio: '2026-01-01', fFin: '2026-06-30' }), 'mensual');
});

test('empareja por empresa y razón, conserva discrepancias y los tres estados', () => {
    const report = buildComparisonReport(rows, filters, { generadoPor: 'Prueba' });
    assert.equal(report.comparison.length, 3);
    const paired = report.comparison.find(row => normalizeReason(row.razonBase) === 'CHURRASCO');
    assert.equal(paired.estado, 'AMBOS');
    assert.equal(paired.montoEfectivo, 100);
    assert.equal(paired.montoBanco, 120);
    assert.equal(paired.diferencia, 20);
    assert.equal(paired.variacionPct, .2);
    assert.equal(paired.categoriaDiferente, true);
    assert.deepEqual(report.kpis.estados, { AMBOS: 1, SOLO_BANCO: 1, SOLO_EFECTIVO: 1 });
    assert.equal(report.kpis.montoEfectivo, 180);
    assert.equal(report.kpis.montoBanco, 175);
});

test('estado y búsqueda también limitan KPIs y evolución', () => {
    const report = buildComparisonReport(rows, { ...filters, estado: 'SOLO_BANCO', razon: 'internet' });
    assert.equal(report.comparison.length, 1);
    assert.equal(report.kpis.montoBanco, 55);
    assert.equal(report.kpis.montoEfectivo, 0);
    assert.deepEqual(report.evolution.map(row => row.fecha), ['2026-08-03']);

    const efectivo = buildComparisonReport(rows, { ...filters, estado: 'SOLO_EFECTIVO' });
    assert.equal(efectivo.comparison.length, 1);
    assert.equal(normalizeReason(efectivo.comparison[0].razonBase), 'ABARROTES');
    assert.equal(efectivo.kpis.estados.SOLO_EFECTIVO, 1);
});

test('genera gráficas, libro Excel y PDF válidos', async () => {
    const report = buildComparisonReport(rows, filters, { generadoPor: 'Prueba automatizada', generadoEn: new Date('2026-09-09T12:00:00Z') });
    const charts = await createCharts(report);
    Object.values(charts).forEach(buffer => assert.equal(buffer.subarray(1, 4).toString(), 'PNG'));
    const detail = [{ Documento: 'F001', TipoDoc: 'Facturas', TipoCargo: 'Carnes', Razon: 'Churrásco', Fecha: new Date('2026-08-01'), Emp: 'Cocineria', Monto: 100 }];
    const xlsx = await createExcel(report, detail, charts);
    assert.equal(Buffer.from(xlsx).subarray(0, 2).toString(), 'PK');
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(xlsx);
    assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['Resumen', 'Comparativo', 'Detalle', 'Evolución']);
    assert.equal(workbook.getWorksheet('Comparativo').rowCount, 4);
    assert.equal(workbook.getWorksheet('Detalle').getCell('A2').value, 'Efectivo');
    const pdf = await createPdf(report, charts);
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.ok(pdf.length > 10000);
    assert.equal(reportFilename(report, 'xlsx'), 'ComparativoBanco_Todas_2026-08-01_2026-08-31.xlsx');
});
