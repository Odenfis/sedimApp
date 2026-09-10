const fs = require('fs');
const path = require('path');
const { PassThrough } = require('stream');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const PImage = require('pureimage');

const COLORS = {
    blue: '#2563eb', green: '#10b981', amber: '#f59e0b', red: '#dc2626',
    purple: '#8b5cf6', ink: '#1f2937', muted: '#64748b', grid: '#e2e8f0',
    pale: '#f8fafc', white: '#ffffff'
};

let chartFont = 'sans-serif';
let chartFontLoaded = false;

function loadChartFont() {
    if (chartFontLoaded) return;
    const candidates = [
        path.join(__dirname, '..', 'public', 'fonts', 'DejaVuSans.ttf'),
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/System/Library/Fonts/Supplemental/Arial.ttf',
        'C:\\Windows\\Fonts\\arial.ttf'
    ];
    const fontPath = candidates.find(candidate => fs.existsSync(candidate));
    if (fontPath) {
        PImage.registerFont(fontPath, 'ComparativoSans').loadSync();
        chartFont = 'ComparativoSans';
    }
    chartFontLoaded = true;
}

function normalizeReason(value) {
    return String(value || '')
        .trim()
        .replace(/\s*\(banco\)\s*$/i, '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .toLocaleUpperCase('es-PE');
}

function reasonLabel(value) {
    return String(value || '').trim().replace(/\s*\(banco\)\s*$/i, '').trim() || 'Sin razón';
}

function isBankReason(value) {
    return /\(banco\)\s*$/i.test(String(value || '').trim());
}

function documentType(documento) {
    const value = String(documento || '').trim().toUpperCase();
    if (value.startsWith('BAN')) return 'No declaradas';
    if (value.startsWith('F')) return 'Facturas';
    if (value.startsWith('B')) return 'Boletas';
    if (value.startsWith('N')) return 'Notas de Venta';
    return 'No declaradas';
}

function numeric(value) {
    return Number(value || 0) || 0;
}

function automaticGranularity(filters = {}) {
    const start = new Date(`${filters.fInicio}T00:00:00Z`);
    const end = new Date(`${filters.fFin}T00:00:00Z`);
    const days = Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())
        ? Math.floor((end - start) / 86400000) + 1 : 1;
    return days <= 45 ? 'diaria' : (days <= 180 ? 'semanal' : 'mensual');
}

function evolutionBucket(fecha, granularity) {
    if (granularity === 'mensual') return String(fecha).slice(0, 7);
    if (granularity !== 'semanal') return String(fecha).slice(0, 10);
    const date = new Date(`${String(fecha).slice(0, 10)}T00:00:00Z`);
    const offset = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - offset);
    return date.toISOString().slice(0, 10);
}

function buildComparisonReport(rows, filters = {}, metadata = {}) {
    const groups = new Map();
    const daily = new Map();
    const granularity = automaticGranularity(filters);
    for (const source of rows || []) {
        const empresa = String(source.Emp ?? source.emp ?? '').trim() || 'Sin empresa';
        const razonOriginal = String(source.Razon ?? source.razon ?? '');
        const baseKey = normalizeReason(razonOriginal);
        const key = `${empresa.toLocaleUpperCase('es-PE')}|${baseKey}`;
        const bank = source.EsBanco === true || Number(source.EsBanco) === 1 || isBankReason(razonOriginal);
        const monto = numeric(source.Monto ?? source.monto);
        const registros = numeric(source.Registros ?? source.registros ?? 1);
        const tipoCargo = String(source.TipoCargo ?? source.tipoCargo ?? 'Sin categoría').trim() || 'Sin categoría';
        const fecha = String(source.FechaGrupo ?? source.fechaGrupo ?? source.Fecha ?? source.fecha ?? '').slice(0, 10);
        if (!groups.has(key)) {
            groups.set(key, {
                empresa, razonBase: reasonLabel(razonOriginal), razonKey: baseKey,
                montoEfectivo: 0, montoBanco: 0, registrosEfectivo: 0, registrosBanco: 0,
                tiposCargoEfectivo: new Set(), tiposCargoBanco: new Set()
            });
        }
        const group = groups.get(key);
        if (bank) {
            group.montoBanco += monto; group.registrosBanco += registros; group.tiposCargoBanco.add(tipoCargo);
        } else {
            group.montoEfectivo += monto; group.registrosEfectivo += registros; group.tiposCargoEfectivo.add(tipoCargo);
        }
        if (fecha) {
            const dayKey = `${key}|${fecha}`;
            const point = daily.get(dayKey) || { groupKey: key, empresa, fecha, montoEfectivo: 0, montoBanco: 0 };
            if (bank) point.montoBanco += monto; else point.montoEfectivo += monto;
            daily.set(dayKey, point);
        }
    }

    let comparison = Array.from(groups.values()).map(group => {
        const efectivoTypes = Array.from(group.tiposCargoEfectivo).sort();
        const bankTypes = Array.from(group.tiposCargoBanco).sort();
        const allTypes = Array.from(new Set([...bankTypes, ...efectivoTypes])).sort();
        const diferencia = group.montoBanco - group.montoEfectivo;
        return {
            empresa: group.empresa, razonBase: group.razonBase, razonKey: group.razonKey,
            tipoCargo: allTypes.length === 1 ? allTypes[0] : (bankTypes[0] || efectivoTypes[0] || 'Sin categoría'),
            tiposCargoEfectivo: efectivoTypes, tiposCargoBanco: bankTypes,
            categoriaDiferente: efectivoTypes.length > 0 && bankTypes.length > 0 && efectivoTypes.join('|') !== bankTypes.join('|'),
            montoEfectivo: group.montoEfectivo, montoBanco: group.montoBanco,
            diferencia, diferenciaAbsoluta: Math.abs(diferencia),
            variacionPct: group.montoEfectivo ? diferencia / group.montoEfectivo : null,
            registrosEfectivo: group.registrosEfectivo, registrosBanco: group.registrosBanco,
            estado: group.registrosBanco > 0 && group.registrosEfectivo > 0 ? 'AMBOS' : (group.registrosBanco > 0 ? 'SOLO_BANCO' : 'SOLO_EFECTIVO')
        };
    });

    const search = normalizeReason(filters.razon || '');
    if (search) comparison = comparison.filter(row => normalizeReason(row.razonBase).includes(search));
    if (filters.estado && filters.estado !== 'TODOS') comparison = comparison.filter(row => row.estado === filters.estado);
    comparison.sort((a, b) => b.diferenciaAbsoluta - a.diferenciaAbsoluta || a.razonBase.localeCompare(b.razonBase, 'es'));

    const totals = comparison.reduce((acc, row) => {
        acc.montoEfectivo += row.montoEfectivo; acc.montoBanco += row.montoBanco;
        acc.registrosEfectivo += row.registrosEfectivo; acc.registrosBanco += row.registrosBanco;
        acc.estados[row.estado] += 1;
        return acc;
    }, { montoEfectivo: 0, montoBanco: 0, registrosEfectivo: 0, registrosBanco: 0, estados: { AMBOS: 0, SOLO_BANCO: 0, SOLO_EFECTIVO: 0 } });
    totals.diferencia = totals.montoBanco - totals.montoEfectivo;
    totals.cobertura = totals.montoEfectivo ? totals.montoBanco / totals.montoEfectivo : null;

    const typeMap = new Map();
    comparison.forEach(row => {
        const key = row.tipoCargo;
        const item = typeMap.get(key) || { tipoCargo: key, montoEfectivo: 0, montoBanco: 0, razones: 0 };
        item.montoEfectivo += row.montoEfectivo; item.montoBanco += row.montoBanco; item.razones += 1;
        typeMap.set(key, item);
    });

    const visibleKeys = new Set(comparison.map(row => `${row.empresa.toLocaleUpperCase('es-PE')}|${row.razonKey}`));
    const evolutionMap = new Map();
    Array.from(daily.values()).filter(point => visibleKeys.has(point.groupKey)).forEach(point => {
        const bucket = evolutionBucket(point.fecha, granularity);
        const key = `${point.empresa}|${bucket}`;
        const item = evolutionMap.get(key) || { empresa: point.empresa, fecha: bucket, montoEfectivo: 0, montoBanco: 0 };
        item.montoEfectivo += point.montoEfectivo;
        item.montoBanco += point.montoBanco;
        evolutionMap.set(key, item);
    });

    return {
        filters,
        metadata: { generadoPor: metadata.generadoPor || 'Usuario', generadoEn: metadata.generadoEn || new Date(), granularidadAplicada: granularity },
        kpis: totals,
        comparison,
        byType: Array.from(typeMap.values()).sort((a, b) => (b.montoBanco + b.montoEfectivo) - (a.montoBanco + a.montoEfectivo)),
        evolution: Array.from(evolutionMap.values()).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.empresa.localeCompare(b.empresa))
    };
}

function formatMoney(value) {
    return `S/ ${numeric(value).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function safeFilename(value) {
    return String(value || 'Todas').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 65) || 'Todas';
}

function reportFilename(report, extension) {
    const f = report.filters;
    const company = !f.empresa || f.empresa === 'all' ? 'Todas' : f.empresa;
    return `ComparativoBanco_${safeFilename(company)}_${f.fInicio}_${f.fFin}.${extension}`;
}

function pngBuffer(image) {
    return new Promise((resolve, reject) => {
        const stream = new PassThrough(), chunks = [];
        stream.on('data', chunk => chunks.push(chunk)); stream.on('end', () => resolve(Buffer.concat(chunks))); stream.on('error', reject);
        PImage.encodePNGToStream(image, stream).catch(reject);
    });
}

function chartText(ctx, value, x, y, size = 15, color = COLORS.ink, align = 'left') {
    ctx.fillStyle = color; ctx.textAlign = align; ctx.font = `${size}pt '${chartFont}'`; ctx.fillText(String(value), x, y);
}

function fillRounded(ctx, x, y, width, height, radius, color) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r); ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height); ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r); ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath(); ctx.fill();
}

async function comparisonChart(report) {
    loadChartFont();
    const rows = report.comparison.slice(0, 12), width = 1200, height = Math.max(440, 115 + rows.length * 58);
    const image = PImage.make(width, height), ctx = image.getContext('2d');
    ctx.fillStyle = COLORS.white; ctx.fillRect(0, 0, width, height);
    chartText(ctx, 'Banco vs efectivo por razon', 42, 48, 23); chartText(ctx, 'Top por diferencia absoluta', 42, 76, 13, COLORS.muted);
    if (!rows.length) { chartText(ctx, 'Sin datos', width / 2, height / 2, 18, COLORS.muted, 'center'); return pngBuffer(image); }
    const max = Math.max(...rows.flatMap(row => [row.montoBanco, row.montoEfectivo]), 1), labelX = 285, barX = 320, barW = 650;
    rows.forEach((row, index) => {
        const y = 104 + index * 58, label = row.razonBase.length > 25 ? `${row.razonBase.slice(0, 22)}...` : row.razonBase;
        chartText(ctx, label, labelX, y + 24, 12, COLORS.ink, 'right');
        fillRounded(ctx, barX, y + 5, barW * row.montoEfectivo / max, 16, 4, COLORS.blue);
        fillRounded(ctx, barX, y + 27, barW * row.montoBanco / max, 16, 4, COLORS.green);
        chartText(ctx, formatMoney(row.montoEfectivo), 1160, y + 18, 10, COLORS.blue, 'right');
        chartText(ctx, formatMoney(row.montoBanco), 1160, y + 40, 10, COLORS.green, 'right');
    });
    return pngBuffer(image);
}

async function evolutionChart(report) {
    loadChartFont();
    const grouped = new Map();
    report.evolution.forEach(row => {
        const point = grouped.get(row.fecha) || { fecha: row.fecha, montoEfectivo: 0, montoBanco: 0 };
        point.montoEfectivo += row.montoEfectivo; point.montoBanco += row.montoBanco; grouped.set(row.fecha, point);
    });
    const rows = Array.from(grouped.values()), width = 1200, height = 500, image = PImage.make(width, height), ctx = image.getContext('2d');
    ctx.fillStyle = COLORS.white; ctx.fillRect(0, 0, width, height); chartText(ctx, 'Evolucion del periodo', 42, 48, 23);
    const left = 100, top = 95, chartW = 1040, chartH = 315, max = Math.max(...rows.flatMap(row => [row.montoBanco, row.montoEfectivo]), 1);
    for (let i = 0; i <= 4; i++) { const y = top + chartH * i / 4; ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + chartW, y); ctx.stroke(); }
    const draw = (key, color) => {
        ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.beginPath();
        rows.forEach((row, index) => { const x = rows.length === 1 ? left + chartW / 2 : left + chartW * index / (rows.length - 1); const y = top + chartH - chartH * row[key] / max; index ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
    };
    if (rows.length) { draw('montoEfectivo', COLORS.blue); draw('montoBanco', COLORS.green); }
    const step = Math.max(1, Math.ceil(rows.length / 8)); rows.forEach((row, i) => { if (i % step === 0 || i === rows.length - 1) chartText(ctx, row.fecha, left + (rows.length === 1 ? chartW / 2 : chartW * i / (rows.length - 1)), 445, 10, COLORS.muted, 'center'); });
    chartText(ctx, 'Efectivo', 875, 66, 12, COLORS.blue); chartText(ctx, 'Banco', 1010, 66, 12, COLORS.green);
    return pngBuffer(image);
}

async function statusChart(report) {
    loadChartFont();
    const width = 700, height = 460, image = PImage.make(width, height), ctx = image.getContext('2d');
    ctx.fillStyle = COLORS.white; ctx.fillRect(0, 0, width, height); chartText(ctx, 'Estado de razones', 34, 46, 22);
    const items = [
        ['Ambos lados', report.kpis.estados.AMBOS, COLORS.green],
        ['Solo banco', report.kpis.estados.SOLO_BANCO, COLORS.amber],
        ['Solo efectivo', report.kpis.estados.SOLO_EFECTIVO, COLORS.blue]
    ];
    const total = items.reduce((sum, item) => sum + item[1], 0) || 1, max = Math.max(...items.map(item => item[1]), 1);
    items.forEach((item, index) => { const y = 105 + index * 95; chartText(ctx, item[0], 42, y, 15); fillRounded(ctx, 42, y + 17, 500, 28, 7, COLORS.grid); fillRounded(ctx, 42, y + 17, 500 * item[1] / max, 28, 7, item[2]); chartText(ctx, `${item[1]} (${(item[1] / total * 100).toFixed(1)}%)`, 650, y + 39, 13, COLORS.ink, 'right'); });
    return pngBuffer(image);
}

async function createCharts(report) {
    const [comparison, evolution, status] = await Promise.all([comparisonChart(report), evolutionChart(report), statusChart(report)]);
    return { comparison, evolution, status };
}

function styleExcelHeader(row, color = 'FF2563EB') {
    row.height = 24; row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }; cell.font = { color: { argb: 'FFFFFFFF' }, bold: true }; cell.alignment = { vertical: 'middle' }; });
}

async function createExcel(report, detailRows, charts) {
    const workbook = new ExcelJS.Workbook(); workbook.creator = 'sediApp'; workbook.created = new Date(report.metadata.generadoEn);
    const summary = workbook.addWorksheet('Resumen'); summary.columns = Array.from({ length: 12 }, () => ({ width: 15 }));
    summary.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 };
    summary.mergeCells('A1:L1'); summary.getCell('A1').value = 'COMPARATIVO DE SALIDAS BANCO VS EFECTIVO'; summary.getCell('A1').font = { size: 20, bold: true, color: { argb: 'FFFFFFFF' } }; summary.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }; summary.getCell('A1').alignment = { horizontal: 'center' };
    summary.getCell('A2').value = 'Empresa'; summary.getCell('B2').value = report.filters.empresa || 'Todas'; summary.getCell('E2').value = 'Periodo'; summary.getCell('F2').value = `${report.filters.fInicio} al ${report.filters.fFin}`;
    summary.getCell('A3').value = 'TipoDoc'; summary.getCell('B3').value = report.filters.tipoDoc || 'Todos'; summary.getCell('E3').value = 'TipoCargo'; summary.getCell('F3').value = report.filters.tipoCargo || 'Todos';
    summary.getCell('A4').value = 'Generado por'; summary.getCell('B4').value = report.metadata.generadoPor; summary.getCell('E4').value = 'Evolución'; summary.getCell('F4').value = report.metadata.granularidadAplicada;
    const cards = [['EFECTIVO', report.kpis.montoEfectivo, 'FF2563EB'], ['BANCO', report.kpis.montoBanco, 'FF10B981'], ['DIFERENCIA', report.kpis.diferencia, 'FFDC2626'], ['COBERTURA', report.kpis.cobertura, 'FF8B5CF6']];
    cards.forEach((card, index) => { const col = 1 + index * 3; summary.mergeCells(6, col, 6, col + 2); summary.mergeCells(7, col, 7, col + 2); const label = summary.getCell(6, col), value = summary.getCell(7, col); label.value = card[0]; value.value = card[1] ?? 0; label.alignment = value.alignment = { horizontal: 'center' }; label.font = { bold: true, color: { argb: card[2] } }; value.font = { bold: true, size: 16, color: { argb: card[2] } }; value.numFmt = index === 3 ? '0.0%' : '"S/ "#,##0.00'; });
    const comparisonImage = workbook.addImage({ buffer: charts.comparison, extension: 'png' }), statusImage = workbook.addImage({ buffer: charts.status, extension: 'png' });
    summary.addImage(comparisonImage, { tl: { col: 0, row: 9 }, ext: { width: 700, height: 360 } }); summary.addImage(statusImage, { tl: { col: 8, row: 9 }, ext: { width: 350, height: 230 } });

    const comparison = workbook.addWorksheet('Comparativo', { views: [{ state: 'frozen', ySplit: 1 }] });
    comparison.columns = [
        { header: 'Empresa', key: 'empresa', width: 25 }, { header: 'TipoCargo', key: 'tipoCargo', width: 22 }, { header: 'Razón base', key: 'razonBase', width: 32 },
        { header: 'Efectivo', key: 'montoEfectivo', width: 16 }, { header: 'Banco', key: 'montoBanco', width: 16 }, { header: 'Diferencia', key: 'diferencia', width: 16 },
        { header: 'Variación', key: 'variacionPct', width: 14 }, { header: 'Reg. efectivo', key: 'registrosEfectivo', width: 15 }, { header: 'Reg. banco', key: 'registrosBanco', width: 13 },
        { header: 'Estado', key: 'estado', width: 18 }, { header: 'Categoría diferente', key: 'categoriaDiferente', width: 19 }, { header: 'Tipos efectivo', key: 'tiposEfectivo', width: 28 }, { header: 'Tipos banco', key: 'tiposBanco', width: 28 }
    ]; styleExcelHeader(comparison.getRow(1));
    report.comparison.forEach(row => comparison.addRow({ ...row, tiposEfectivo: row.tiposCargoEfectivo.join(', '), tiposBanco: row.tiposCargoBanco.join(', '), categoriaDiferente: row.categoriaDiferente ? 'Sí' : 'No' }));
    comparison.autoFilter = { from: 'A1', to: `M${Math.max(1, comparison.rowCount)}` }; ['D', 'E', 'F'].forEach(col => { comparison.getColumn(col).numFmt = '"S/ "#,##0.00'; }); comparison.getColumn('G').numFmt = '0.0%';
    comparison.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1' };

    const detail = workbook.addWorksheet('Detalle', { views: [{ state: 'frozen', ySplit: 1 }] });
    detail.columns = [
        { header: 'Lado', key: 'lado', width: 13 }, { header: 'Documento', key: 'Documento', width: 22 }, { header: 'TipoDoc', key: 'TipoDoc', width: 18 }, { header: 'TipoCargo', key: 'TipoCargo', width: 22 },
        { header: 'Razón', key: 'Razon', width: 32 }, { header: 'Fecha', key: 'Fecha', width: 20 }, { header: 'Destinatario', key: 'Destinatario', width: 30 }, { header: 'Empresa/proveedor', key: 'Empresa', width: 35 }, { header: 'Sede', key: 'Emp', width: 25 }, { header: 'Monto', key: 'Monto', width: 16 }
    ]; styleExcelHeader(detail.getRow(1));
    (detailRows || []).forEach(row => detail.addRow({ ...row, lado: isBankReason(row.Razon) ? 'Banco' : 'Efectivo' })); detail.getColumn('J').numFmt = '"S/ "#,##0.00'; detail.autoFilter = { from: 'A1', to: `J${Math.max(1, detail.rowCount)}` };
    detail.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1' };

    const evolution = workbook.addWorksheet('Evolución'); evolution.columns = [{ header: 'Empresa', key: 'empresa', width: 25 }, { header: 'Fecha', key: 'fecha', width: 16 }, { header: 'Efectivo', key: 'montoEfectivo', width: 18 }, { header: 'Banco', key: 'montoBanco', width: 18 }]; styleExcelHeader(evolution.getRow(1)); report.evolution.forEach(row => evolution.addRow(row)); evolution.getColumn('C').numFmt = evolution.getColumn('D').numFmt = '"S/ "#,##0.00'; const evolutionImage = workbook.addImage({ buffer: charts.evolution, extension: 'png' }); evolution.addImage(evolutionImage, { tl: { col: 5, row: 1 }, ext: { width: 720, height: 300 } }); evolution.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 };
    return workbook.xlsx.writeBuffer();
}

function createPdf(report, charts) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 34, bufferPages: true, info: { Title: 'Comparativo Banco vs Efectivo', Author: 'sediApp' } }), chunks = [];
        doc.on('data', chunk => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
        const pageW = doc.page.width - 68;
        doc.rect(0, 0, doc.page.width, 76).fill('#1e3a8a'); doc.fillColor('#fff').font('Helvetica-Bold').fontSize(20).text('COMPARATIVO BANCO VS EFECTIVO', 34, 22); doc.font('Helvetica').fontSize(9).text(`${report.filters.empresa || 'Todas'} | ${report.filters.fInicio} al ${report.filters.fFin} | ${report.filters.tipoDoc || 'Todos los documentos'} | Evolución ${report.metadata.granularidadAplicada}`, 34, 51);
        const cards = [['EFECTIVO', report.kpis.montoEfectivo, COLORS.blue], ['BANCO', report.kpis.montoBanco, COLORS.green], ['DIFERENCIA', report.kpis.diferencia, COLORS.red], ['COBERTURA', report.kpis.cobertura == null ? 'N/D' : `${(report.kpis.cobertura * 100).toFixed(1)}%`, COLORS.purple]];
        const gap = 10, cardW = (pageW - gap * 3) / 4; cards.forEach((card, i) => { const x = 34 + i * (cardW + gap); doc.roundedRect(x, 92, cardW, 62, 7).fillAndStroke('#f8fafc', '#e2e8f0'); doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(8).text(card[0], x + 12, 106); doc.fillColor(card[2]).fontSize(15).text(typeof card[1] === 'number' ? formatMoney(card[1]) : card[1], x + 12, 126); });
        doc.image(charts.comparison, 34, 170, { fit: [pageW * 0.68, 330] }); doc.image(charts.status, 34 + pageW * 0.7, 180, { fit: [pageW * 0.3, 235] }); doc.fillColor('#64748b').font('Helvetica').fontSize(8).text(`Generado por ${report.metadata.generadoPor}`, 34, 520, { width: pageW, align: 'right' });
        doc.addPage(); doc.fillColor('#1e3a8a').font('Helvetica-Bold').fontSize(18).text('EVOLUCIÓN Y COMPARATIVO', 34, 28); doc.image(charts.evolution, 34, 58, { fit: [pageW, 245] });
        let y = 316;
        const header = () => { doc.rect(34, y, pageW, 23).fill('#2563eb'); doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8).text('RAZÓN', 42, y + 7); doc.text('EFECTIVO', 390, y + 7, { width: 90, align: 'right' }); doc.text('BANCO', 485, y + 7, { width: 90, align: 'right' }); doc.text('DIFERENCIA', 580, y + 7, { width: 90, align: 'right' }); doc.text('ESTADO', 685, y + 7, { width: 110, align: 'right' }); y += 23; };
        header();
        report.comparison.forEach((row, index) => { if (y > 530) { doc.addPage(); y = 40; header(); } if (index % 2) doc.rect(34, y, pageW, 21).fill('#f8fafc'); doc.fillColor('#1f2937').font('Helvetica').fontSize(8); doc.text(`${row.empresa} | ${row.razonBase}`.slice(0, 56), 42, y + 6, { lineBreak: false }); doc.text(formatMoney(row.montoEfectivo), 390, y + 6, { width: 90, align: 'right', lineBreak: false }); doc.text(formatMoney(row.montoBanco), 485, y + 6, { width: 90, align: 'right', lineBreak: false }); doc.text(formatMoney(row.diferencia), 580, y + 6, { width: 90, align: 'right', lineBreak: false }); doc.text(row.estado.replaceAll('_', ' '), 685, y + 6, { width: 110, align: 'right', lineBreak: false }); y += 21; });
        const unmatched = report.comparison.filter(row => row.estado !== 'AMBOS');
        if (unmatched.length) { doc.addPage(); doc.fillColor('#1e3a8a').font('Helvetica-Bold').fontSize(18).text('ANEXO: RAZONES SIN PAREJA', 34, 28); y = 65; unmatched.forEach((row, index) => { if (y > 535) { doc.addPage(); y = 42; } if (index % 2) doc.rect(34, y, pageW, 20).fill('#f8fafc'); doc.fillColor('#1f2937').font('Helvetica').fontSize(8).text(`${row.empresa} | ${row.tipoCargo} | ${row.razonBase}`, 42, y + 6, { width: 490, lineBreak: false }); doc.text(row.estado.replaceAll('_', ' '), 590, y + 6, { width: 120, align: 'right', lineBreak: false }); doc.text(formatMoney(row.montoBanco || row.montoEfectivo), 710, y + 6, { width: 85, align: 'right', lineBreak: false }); y += 20; }); }
        const range = doc.bufferedPageRange(); for (let i = 0; i < range.count; i++) { doc.switchToPage(i); doc.fillColor('#64748b').font('Helvetica').fontSize(8).text(`sediApp | Página ${i + 1} de ${range.count}`, 34, 552, { width: pageW, align: 'center', lineBreak: false }); }
        doc.end();
    });
}

module.exports = { normalizeReason, reasonLabel, isBankReason, documentType, automaticGranularity, buildComparisonReport, createCharts, createExcel, createPdf, reportFilename };
