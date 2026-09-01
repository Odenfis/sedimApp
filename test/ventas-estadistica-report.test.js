const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const {
    normalizeReport, createCharts, createExcelBuffer, createPdfBuffer, reportFilename
} = require('../lib/ventas-estadistica-report');

function sampleReport(overrides = {}) {
    return normalizeReport({
        empresa: 'Cocineria', turno: 0, fechaInicio: '2026-08-01', fechaFin: '2026-08-03',
        tiposCobro: [
            { tipo: 0, tDeposito: 'Efectivo', Soles: 2750.50 },
            { tipo: 2, tDeposito: 'Visa', Soles: 1250 },
            { tipo: 3, tDeposito: 'Yape', Soles: 999.50 }
        ],
        diario: [
            { fecha: '01/08/2026', total: 1500 },
            { fecha: '02/08/2026', total: 1700 },
            { fecha: '03/08/2026', total: 1800 }
        ],
        generadoPor: 'Prueba automatizada', ...overrides
    });
}

test('normaliza, ordena y reconcilia los totales del reporte', () => {
    const report = sampleReport();
    assert.equal(report.resumen.totalVentas, 5000);
    assert.equal(report.resumen.efectivo, 2750.50);
    assert.equal(report.resumen.depositos, 2249.50);
    assert.equal(report.tiposCobro[0].tipoCobro, 'Efectivo');
    assert.equal(report.tiposCobro.reduce((sum, row) => sum + row.porcentaje, 0), 1);
    assert.equal(reportFilename(report, 'xlsx'), 'EstadisticaVenta_Cocineria_2026-08-01_2026-08-03.xlsx');
});

test('genera graficas PNG, Excel legible y PDF valido', async () => {
    const report = sampleReport();
    const charts = await createCharts(report);
    Object.values(charts).forEach(buffer => assert.deepEqual(buffer.subarray(1, 4), Buffer.from('PNG')));

    const xlsx = await createExcelBuffer(report, charts);
    assert.equal(xlsx.subarray(0, 2).toString(), 'PK');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsx);
    assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['Resumen', 'Evolucion diaria', 'Datos']);
    assert.equal(workbook.getWorksheet('Resumen').getCell('B7').value, 5000);
    assert.equal(workbook.getWorksheet('Datos').rowCount, 4);

    const pdf = await createPdfBuffer(report, charts);
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.ok(pdf.length > 10000);
});

test('genera archivos validos cuando no hay datos', async () => {
    const report = sampleReport({ tiposCobro: [], diario: [{ fecha: '01/08/2026', total: 0 }] });
    const charts = await createCharts(report);
    const xlsx = await createExcelBuffer(report, charts);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsx);
    assert.equal(workbook.getWorksheet('Resumen').getCell('B10').value, 0);
    const pdf = await createPdfBuffer(report, charts);
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
});
