const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const report = require('../lib/seguimiento-abonos');

test('agrupa documentos, mantiene vacíos separados y evita duplicar entradas', () => {
    const grupos = report.agrupar([
        { Numero: 1, Documento: ' ABC ', Moneda: 1, Monto: 100 },
        { Numero: 2, Documento: 'abc', Moneda: 1, Monto: 25 },
        { Numero: 3, Documento: ' ', Moneda: 1, Monto: 7 },
        { Numero: 4, Documento: '', Moneda: 1, Monto: 8 }
    ], [
        { Numero: 9, Documento: 'ABC', Moneda: 1, Monto: 80, Cajero: 2, Sede: 'Cocineria' },
        { Numero: 9, Documento: 'ABC', Moneda: 1, Monto: 80, Cajero: 2, Sede: 'Cocineria' },
        { Numero: 10, Documento: 'abc', Moneda: 2, Monto: 12 },
        { Numero: 11, Documento: '', Moneda: 1, Monto: 500 }
    ]);
    assert.equal(grupos.length, 3); assert.equal(grupos[0].salidas.length, 2); assert.equal(grupos[0].entradas.length, 2);
    assert.deepEqual(grupos[0].totales, [{ moneda: '1', monedaNombre: 'Moneda 1', salida: 125, entrada: 80, diferencia: 45 }, { moneda: '2', monedaNombre: 'Moneda 2', salida: 0, entrada: 12, diferencia: -12 }]);
    assert.equal(grupos[1].entradas.length, 0); assert.equal(grupos[2].entradas.length, 0);
    assert.equal(report.sede(grupos[0].entradas[0]), 'Cocineria');
    assert.equal(report.sede({ Cajero: 44 }), 'Cajero 44 (sin sede)'); assert.equal(report.sede({ Cajero: null }), 'Sin cajero');
});
test('conserva cuatro decimales y evita colisiones con documentos especiales', () => {
    const grupos = report.agrupar([
        { Numero: 1, Documento: '', Moneda: 1, Monto: 0.1 },
        { Numero: 2, Documento: '__vacio_1', Moneda: 1, Monto: 0.2001 }
    ], [{ Numero: 3, Documento: '__vacio_1', Moneda: 1, Monto: 0.1 }]);
    assert.equal(grupos.length, 2); assert.equal(grupos[0].entradas.length, 0);
    assert.equal(grupos[1].totales[0].diferencia, 0.1001);
});
test('valida filtros y selección antes de consultar', () => {
    assert.deepEqual(report.validarFiltros({ inicio: '2026-09-01', fin: '2026-09-30', cuenta: ' Banco ' }), { inicio: '2026-09-01', fin: '2026-09-30', cuenta: 'Banco', documento: '' });
    for (const filtros of [{}, { inicio: '2026-02-30', fin: '2026-03-01' }, { inicio: '2026-02-01', fin: '2026-01-01' }]) assert.throws(() => report.validarFiltros(filtros));
    assert.deepEqual(report.validarIds([1, 2, 1]), [1, 2]);
    for (const ids of [[], [0], ['1'], [1.1], Array(1001).fill(1)]) assert.throws(() => report.validarIds(ids));
});
test('exporta Excel numérico y PDF con sede y detalle', async () => {
    const grupos = report.agrupar([{ Numero: 1, Documento: 'D1', Fecha: '2026-09-01', Cuenta: '123', Banco: 'Banco', Moneda: 1, Monto: 100, Detalle: 'Detalle' }], [{ Numero: 5, Documento: 'D1', Fecha: '2026-10-01', Sede: 'Cocineria', Cajero: 2, Empresa: 'Empresa', Destinatario: 'Persona', Moneda: 1, Monto: 80 }]);
    const buffer = await report.excel(grupos), wb = new ExcelJS.Workbook(); await wb.xlsx.load(buffer);
    assert.equal(wb.getWorksheet('Resumen').getCell('C2').value, 100); assert.equal(wb.getWorksheet('Resumen').getCell('E2').value, 20);
    assert.equal(wb.getWorksheet('Detalle').getCell('G3').value, 'Cocineria');
    const pdf = await report.pdf(grupos); assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
});

test('valida filtros exactos conservando búsquedas parciales', () => {
    const f = report.validarFiltros({ inicio:'2026-10-01',fin:'2026-10-31',cuenta:'Banco',cuentaExacta:' 123 ',documentoExacto:' DOC ' });
    assert.equal(f.cuenta,'Banco'); assert.equal(f.cuentaExacta,'123'); assert.equal(f.documentoExacto,'DOC');
    assert.throws(()=>report.validarFiltros({...f,cuentaExacta:'x'.repeat(21)}));
});
test('selección web acumula salidas, separa vacíos y exporta IDs sin duplicados', () => {
    const vm = require('node:vm'), fs = require('node:fs');
    const source = fs.readFileSync(require('node:path').join(__dirname,'../public/script.js'),'utf8').split('// Seguimiento: resultados, selección por documento y búsquedas independientes.')[1];
    const context = vm.createContext({ document:{getElementById:()=>({textContent:''})}, Map, Set });
    vm.runInContext(source + '\nabonosRenderSeleccion = () => {};', context);
    const result = vm.runInContext(`
        const g1={documento:'D1',salidas:[{Numero:1}],entradas:[{Numero:9}]};
        const g2={documento:'d1',salidas:[{Numero:1},{Numero:2}],entradas:[{Numero:9},{Numero:9}]};
        abonosUnir([g1]);abonosUnir([g2]);
        const merged=abonosState.seleccion.get('doc:d1');
        abonosUnir([{documento:'',salidas:[{Numero:3}],entradas:[]},{documento:'',salidas:[{Numero:4}],entradas:[]}]);
        JSON.stringify({salidas:merged.salidas.length,entradas:merged.entradas.length,grupos:abonosState.seleccion.size});
    `,context);
    assert.deepEqual(JSON.parse(result),{salidas:2,entradas:1,grupos:3});
});

test('nombres de catálogo en resumen y Excel sin mezclar monedas ni alterar montos', async () => {
    const salidas = [{Numero:1,Documento:'X',Moneda:1,MonedaNombre:' Soles ',Monto:100},{Numero:2,Documento:'X',Moneda:2,MonedaNombre:'Dolares',Monto:40},{Numero:3,Documento:'X',Moneda:99,Monto:5}];
    const entradas = [{Numero:7,Documento:'X',Moneda:1,MonedaNombre:'Soles',Monto:80}];
    const grupos = report.agrupar(salidas,entradas);
    assert.deepEqual(grupos[0].totales.map(t=>t.monedaNombre),['Soles','Dolares','Moneda 99']);
    assert.deepEqual(grupos[0].totales.map(t=>t.diferencia),[20,40,5]);
    const book = new ExcelJS.Workbook(); await book.xlsx.load(await report.excel(grupos));
    assert.equal(book.getWorksheet('Resumen').getCell('B2').value,'Soles');
    assert.equal(book.getWorksheet('Resumen').getCell('B3').value,'Dolares');
    assert.equal(book.getWorksheet('Detalle').getCell('L5').value,'Soles');
    assert.equal(book.getWorksheet('Detalle').getCell('M5').value,80);
});
