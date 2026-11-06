const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const clean = value => String(value ?? '').trim();
const key = value => clean(value).toLocaleLowerCase('es');
function validarFiltros(f = {}) {
    const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
    const inicio = clean(f.inicio), fin = clean(f.fin), cuenta = clean(f.cuenta), documento = clean(f.documento);
    if (!validDate(inicio) || !validDate(fin) || inicio > fin || fin === '9999-12-31' || cuenta.length > 50 || documento.length > 20) throw Object.assign(new Error('Revise las fechas y filtros ingresados.'), { status: 400 });
    const cuentaExacta = clean(f.cuentaExacta), documentoExacto = clean(f.documentoExacto);
    if (cuentaExacta.length > 20 || documentoExacto.length > 20) throw Object.assign(new Error('Filtro exacto inválido.'), { status: 400 });
    return { inicio, fin, cuenta, documento, ...(cuentaExacta ? { cuentaExacta } : {}), ...(documentoExacto ? { documentoExacto } : {}) };
}
function validarIds(ids) {
    if (!Array.isArray(ids) || !ids.length || ids.length > 1000 || ids.some(n => !Number.isSafeInteger(n) || n < 1 || n > 2147483647)) throw Object.assign(new Error('Seleccione entre 1 y 1000 salidas válidas.'), { status: 400 });
    return [...new Set(ids)];
}
function monedaNombre(row) { return clean(row.MonedaNombre ?? row.monedaNombre) || `Moneda ${row.Moneda ?? row.moneda ?? 'desconocida'}`; }
function agrupar(salidas, entradas) {
    const groups = new Map();
    for (const row of salidas) {
        const doc = clean(row.Documento), groupKey = doc ? `doc:${key(doc)}` : `vacio:${row.Numero}`;
        if (!groups.has(groupKey)) groups.set(groupKey, { documento: doc, salidas: [], entradas: [], totales: [] });
        groups.get(groupKey).salidas.push(row);
    }
    const seen = new Map();
    for (const row of entradas) {
        const group = groups.get(`doc:${key(row.Documento)}`);
        if (!group || !clean(row.Documento)) continue;
        if (!seen.has(group)) seen.set(group, new Set());
        if (!seen.get(group).has(row.Numero)) { group.entradas.push(row); seen.get(group).add(row.Numero); }
    }
    for (const group of groups.values()) {
        const totals = new Map();
        for (const [field, rows] of [['salida', group.salidas], ['entrada', group.entradas]]) for (const row of rows) {
            const currency = String(row.Moneda ?? 'Sin moneda');
            if (!totals.has(currency)) totals.set(currency, { moneda: currency, monedaNombre: monedaNombre(row), salida: 0, entrada: 0 });
            totals.get(currency)[field] += Math.round((Number(row.Monto) || 0) * 10000);
        }
        group.totales = [...totals.values()].map(t => ({ moneda: t.moneda, monedaNombre: t.monedaNombre, salida: t.salida / 10000, entrada: t.entrada / 10000, diferencia: (t.salida - t.entrada) / 10000 }));
    }
    return [...groups.values()];
}
function money(v) { return Number(v || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 4 }); }
function fecha(v) { return v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : ''; }
function sede(e) { return clean(e.Sede) || (e.Cajero == null ? 'Sin cajero' : `Cajero ${e.Cajero} (sin sede)`); }
async function excel(grupos) {
    const book = new ExcelJS.Workbook();
    const resumen = book.addWorksheet('Resumen');
    resumen.addRow(['Documento', 'Moneda', 'Salidas', 'Entradas', 'Diferencia', 'Estado']);
    for (const g of grupos) for (const t of g.totales) resumen.addRow([g.documento || 'Sin documento', monedaNombre(t), t.salida, t.entrada, t.diferencia, g.entradas.length ? 'Con entradas' : 'Sin entrada']);
    const detalle = book.addWorksheet('Detalle');
    detalle.addRow(['Tipo', 'Documento', 'Número', 'Fecha', 'Cuenta', 'Banco', 'Sede', 'Cajero', 'Empresa', 'Destinatario', 'Detalle', 'Moneda', 'Monto']);
    for (const g of grupos) {
        for (const s of g.salidas) detalle.addRow(['Salida', g.documento, s.Numero, fecha(s.Fecha), clean(s.Cuenta), clean(s.Banco), '', '', '', '', clean(s.Detalle), monedaNombre(s), Number(s.Monto)]);
        for (const e of g.entradas) detalle.addRow(['Entrada', g.documento, e.Numero, fecha(e.Fecha), '', '', sede(e), e.Cajero ?? '', clean(e.Empresa), clean(e.Destinatario), '', monedaNombre(e), Number(e.Monto)]);
    }
    for (const sheet of [resumen, detalle]) {
        sheet.views = [{ state: 'frozen', ySplit: 1 }]; sheet.autoFilter = { from: 'A1', to: { row: 1, column: sheet.columnCount } };
        sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
        sheet.columns.forEach(c => { c.width = 20; }); sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    }
    [3, 4, 5].forEach(c => { resumen.getColumn(c).numFmt = '#,##0.00##'; }); detalle.getColumn(13).numFmt = '#,##0.00##';
    return Buffer.from(await book.xlsx.writeBuffer());
}
async function pdf(grupos) {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
    const chunks = []; doc.on('data', c => chunks.push(c));
    const done = new Promise((resolve, reject) => { doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });
    doc.fontSize(17).text('Seguimiento Abonos Banco'); doc.fontSize(9).text('Relaciones por documento; diferencia = salidas − entradas.'); doc.moveDown();
    for (const g of grupos) {
        if (doc.y > 500) doc.addPage();
        doc.font('Helvetica-Bold').fontSize(11).text(`Documento: ${g.documento || 'Sin documento'} — ${g.entradas.length ? 'Con entradas' : 'Sin entrada'}`);
        doc.font('Helvetica').fontSize(9);
        for (const t of g.totales) doc.text(`${monedaNombre(t)}: salida ${money(t.salida)} | entrada ${money(t.entrada)} | diferencia ${money(t.diferencia)}`);
        for (const s of g.salidas) doc.text(`Salida #${s.Numero} | ${fecha(s.Fecha)} | ${clean(s.Banco)} | Cuenta ${clean(s.Cuenta)} | ${monedaNombre(s)}: ${money(s.Monto)} | ${clean(s.Detalle)}`);
        for (const e of g.entradas) doc.text(`Entrada #${e.Numero} | ${fecha(e.Fecha)} | ${sede(e)} | ${clean(e.Empresa)} | ${clean(e.Destinatario)} | ${monedaNombre(e)}: ${money(e.Monto)}`);
        doc.moveDown();
    }
    doc.end(); return done;
}
module.exports = { validarFiltros, validarIds, agrupar, excel, pdf, sede, monedaNombre };
