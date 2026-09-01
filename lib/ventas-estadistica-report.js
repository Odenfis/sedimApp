const fs = require('fs');
const path = require('path');
const { PassThrough } = require('stream');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const PImage = require('pureimage');

const COLORS = {
    blue: '#2563eb', green: '#10b981', amber: '#f59e0b', purple: '#8b5cf6',
    red: '#ef4444', cyan: '#06b6d4', pink: '#ec4899', lime: '#84cc16',
    orange: '#f97316', ink: '#1f2937', muted: '#64748b', grid: '#e2e8f0',
    pale: '#f8fafc', white: '#ffffff'
};
const PALETTE = [COLORS.blue, COLORS.green, COLORS.amber, COLORS.red, COLORS.purple, COLORS.cyan, COLORS.pink, COLORS.lime, COLORS.orange];

let chartFontFamily = 'sans-serif';
let chartFontReady = false;

function registerChartFont() {
    if (chartFontReady) return;
    const candidates = [
        path.join(__dirname, '..', 'public', 'fonts', 'DejaVuSans.ttf'),
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/System/Library/Fonts/Supplemental/Arial.ttf',
        'C:\\Windows\\Fonts\\arial.ttf'
    ];
    const fontPath = candidates.find(candidate => fs.existsSync(candidate));
    if (fontPath) {
        const font = PImage.registerFont(fontPath, 'ReportSans');
        font.loadSync();
        chartFontFamily = 'ReportSans';
    }
    chartFontReady = true;
}

function money(value) {
    return `S/ ${Number(value || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function sanitizeFilename(value) {
    return String(value || 'Reporte')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 70) || 'Reporte';
}

function turnoLabel(empresa, turno) {
    if (Number(turno) === 0) return 'Ambos turnos';
    const labels = {
        Cocineria: { 1: 'Noche', 2: 'Dia' },
        'Mar Picante 1': { 1: 'Dia', 2: 'Noche' },
        'Inversiones Abruzzo Sac': { 1: 'Dia', 2: 'Noche' }
    };
    return labels[empresa]?.[Number(turno)] || `Turno ${turno}`;
}

function normalizeReport({ empresa, turno, fechaInicio, fechaFin, tiposCobro = [], diario = [], generadoPor = '' }) {
    const normalizedTypes = tiposCobro.map(row => ({
        tipo: Number(row.tipo),
        tipoCobro: String(row.tDeposito || row.tipoCobro || 'Sin especificar').trim(),
        soles: Number(row.Soles ?? row.soles ?? 0) || 0
    })).sort((a, b) => b.soles - a.soles || a.tipoCobro.localeCompare(b.tipoCobro, 'es'));
    const totalVentas = normalizedTypes.reduce((sum, row) => sum + row.soles, 0);
    const efectivo = normalizedTypes.filter(row => row.tipo === 0).reduce((sum, row) => sum + row.soles, 0);
    const depositos = totalVentas - efectivo;
    normalizedTypes.forEach(row => { row.porcentaje = totalVentas ? row.soles / totalVentas : 0; });
    const normalizedDaily = diario.map(row => ({
        fecha: String(row.fecha || ''),
        total: Number(row.total || 0) || 0
    }));
    return {
        filtros: {
            empresa: String(empresa || '').trim(), turno: Number(turno),
            turnoLabel: turnoLabel(String(empresa || '').trim(), turno),
            fechaInicio, fechaFin
        },
        resumen: { totalVentas, efectivo, depositos, porcentajeEfectivo: totalVentas ? efectivo / totalVentas : 0 },
        tiposCobro: normalizedTypes,
        diario: normalizedDaily,
        generadoPor: String(generadoPor || '').trim() || 'Usuario',
        generadoEn: new Date()
    };
}

function pngBuffer(image) {
    return new Promise((resolve, reject) => {
        const stream = new PassThrough();
        const chunks = [];
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
        PImage.encodePNGToStream(image, stream).catch(reject);
    });
}

function roundedRect(ctx, x, y, width, height, radius, color) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
}

function text(ctx, value, x, y, size = 18, color = COLORS.ink, align = 'left', weight = 'normal') {
    ctx.fillStyle = color;
    ctx.textAlign = align;
    // PureImage necesita una variante de fuente registrada por cada peso. Usamos la
    // variante regular y comunicamos jerarquia mediante tamaño/color para mantener
    // portabilidad entre Windows, Linux y macOS.
    ctx.font = `${size}pt '${chartFontFamily}'`;
    ctx.fillText(String(value), x, y);
}

async function createRankingChart(rows) {
    registerChartFont();
    const visibleRows = rows.slice(0, 12);
    const width = 1200;
    const height = Math.max(420, 120 + visibleRows.length * 62);
    const image = PImage.make(width, height);
    const ctx = image.getContext('2d');
    ctx.fillStyle = COLORS.white; ctx.fillRect(0, 0, width, height);
    text(ctx, 'Ventas por tipo de cobro', 48, 50, 24, COLORS.ink, 'left', 'bold');
    text(ctx, 'Ranking por importe', 48, 82, 14, COLORS.muted);
    if (!visibleRows.length) {
        text(ctx, 'Sin datos para los filtros seleccionados', width / 2, height / 2, 20, COLORS.muted, 'center');
        return pngBuffer(image);
    }
    const labelWidth = 300;
    const barX = 350;
    const barWidth = width - barX - 185;
    const max = Math.max(...visibleRows.map(row => row.soles), 1);
    visibleRows.forEach((row, index) => {
        const y = 112 + index * 62;
        const label = row.tipoCobro.length > 27 ? `${row.tipoCobro.slice(0, 24)}...` : row.tipoCobro;
        text(ctx, label, labelWidth, y + 28, 14, COLORS.ink, 'right');
        roundedRect(ctx, barX, y + 7, barWidth, 29, 7, COLORS.grid);
        roundedRect(ctx, barX, y + 7, Math.max(4, barWidth * row.soles / max), 29, 7, PALETTE[index % PALETTE.length]);
        text(ctx, money(row.soles), width - 42, y + 29, 13, COLORS.ink, 'right', 'bold');
    });
    return pngBuffer(image);
}

async function createDonutChart(report) {
    registerChartFont();
    const width = 700, height = 520;
    const image = PImage.make(width, height);
    const ctx = image.getContext('2d');
    ctx.fillStyle = COLORS.white; ctx.fillRect(0, 0, width, height);
    text(ctx, 'Efectivo vs depositos', 38, 48, 23, COLORS.ink, 'left', 'bold');
    const { efectivo, depositos, totalVentas, porcentajeEfectivo } = report.resumen;
    const cx = 245, cy = 270, radius = 130;
    const effectiveAngle = totalVentas ? Math.PI * 2 * efectivo / totalVentas : 0;
    const innerRadius = radius - 27, outerRadius = radius + 27;
    for (let degree = 0; degree < 360; degree += 1) {
        const angle = degree * Math.PI / 180 - Math.PI / 2;
        const color = !totalVentas ? COLORS.grid : (degree * Math.PI / 180 < effectiveAngle ? COLORS.green : COLORS.amber);
        ctx.strokeStyle = color; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * innerRadius, cy + Math.sin(angle) * innerRadius);
        ctx.lineTo(cx + Math.cos(angle) * outerRadius, cy + Math.sin(angle) * outerRadius);
        ctx.stroke();
    }
    text(ctx, `${(porcentajeEfectivo * 100).toFixed(1)}%`, cx, cy, 29, COLORS.green, 'center', 'bold');
    text(ctx, 'EFECTIVO', cx, cy + 32, 12, COLORS.muted, 'center', 'bold');
    roundedRect(ctx, 430, 180, 16, 16, 4, COLORS.green);
    text(ctx, 'Efectivo', 460, 194, 15, COLORS.ink, 'left', 'bold');
    text(ctx, money(efectivo), 460, 224, 15, COLORS.muted);
    roundedRect(ctx, 430, 280, 16, 16, 4, COLORS.amber);
    text(ctx, 'Depositos', 460, 294, 15, COLORS.ink, 'left', 'bold');
    text(ctx, money(depositos), 460, 324, 15, COLORS.muted);
    return pngBuffer(image);
}

async function createEvolutionChart(rows) {
    registerChartFont();
    const width = 1200, height = 520;
    const image = PImage.make(width, height);
    const ctx = image.getContext('2d');
    ctx.fillStyle = COLORS.white; ctx.fillRect(0, 0, width, height);
    text(ctx, 'Evolucion diaria de ventas', 48, 50, 24, COLORS.ink, 'left', 'bold');
    const left = 105, top = 100, chartWidth = 1040, chartHeight = 330;
    const max = Math.max(...rows.map(row => row.total), 1);
    for (let i = 0; i <= 4; i++) {
        const y = top + chartHeight * i / 4;
        ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + chartWidth, y); ctx.stroke();
        text(ctx, money(max * (4 - i) / 4).replace('.00', ''), left - 15, y + 5, 11, COLORS.muted, 'right');
    }
    if (!rows.length) {
        text(ctx, 'Sin datos diarios', left + chartWidth / 2, top + chartHeight / 2, 18, COLORS.muted, 'center');
        return pngBuffer(image);
    }
    const points = rows.map((row, index) => ({
        x: rows.length === 1 ? left + chartWidth / 2 : left + chartWidth * index / (rows.length - 1),
        y: top + chartHeight - chartHeight * row.total / max
    }));
    ctx.strokeStyle = COLORS.blue; ctx.lineWidth = 5; ctx.beginPath();
    points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.stroke();
    points.forEach(point => roundedRect(ctx, point.x - 5, point.y - 5, 10, 10, 3, COLORS.blue));
    const labelStep = Math.max(1, Math.ceil(rows.length / 8));
    rows.forEach((row, index) => {
        if (index % labelStep === 0 || index === rows.length - 1) text(ctx, row.fecha.slice(0, 10), points[index].x, top + chartHeight + 35, 10, COLORS.muted, 'center');
    });
    return pngBuffer(image);
}

async function createCharts(report) {
    const [ranking, donut, evolution] = await Promise.all([
        createRankingChart(report.tiposCobro), createDonutChart(report), createEvolutionChart(report.diario)
    ]);
    return { ranking, donut, evolution };
}

function styleHeader(row) {
    row.height = 24;
    row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
        cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
        cell.alignment = { vertical: 'middle' };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FF1D4ED8' } } };
    });
}

async function createExcelBuffer(report, charts) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'sediApp'; workbook.created = report.generadoEn;
    const summary = workbook.addWorksheet('Resumen', { views: [{ state: 'frozen', ySplit: 7 }] });
    summary.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1, margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.1, footer: 0.1 } };
    summary.columns = Array.from({ length: 12 }, (_, index) => ({ width: index === 0 ? 22 : 14 }));
    summary.mergeCells('A1:L1'); summary.getCell('A1').value = 'ESTADISTICA DE VENTA';
    summary.getCell('A1').font = { size: 22, bold: true, color: { argb: 'FFFFFFFF' } };
    summary.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    summary.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }; summary.getRow(1).height = 36;
    const metadata = [
        ['Empresa', report.filtros.empresa, 'Turno', report.filtros.turnoLabel],
        ['Periodo', `${report.filtros.fechaInicio} al ${report.filtros.fechaFin}`, 'Generado por', report.generadoPor],
        ['Generado', report.generadoEn.toLocaleString('es-PE'), '', '']
    ];
    metadata.forEach((values, index) => {
        const rowNumber = index + 2;
        summary.mergeCells(rowNumber, 2, rowNumber, 4);
        summary.mergeCells(rowNumber, 7, rowNumber, 9);
        summary.getCell(rowNumber, 1).value = values[0]; summary.getCell(rowNumber, 2).value = values[1];
        summary.getCell(rowNumber, 6).value = values[2]; summary.getCell(rowNumber, 7).value = values[3];
        summary.getCell(rowNumber, 1).font = summary.getCell(rowNumber, 6).font = { bold: true, color: { argb: 'FF475569' } };
    });
    const kpis = [
        ['TOTAL VENTAS', report.resumen.totalVentas, 'FF2563EB'], ['EFECTIVO', report.resumen.efectivo, 'FF10B981'],
        ['DEPOSITOS', report.resumen.depositos, 'FFF59E0B'], ['% EFECTIVO', report.resumen.porcentajeEfectivo, 'FF8B5CF6']
    ];
    kpis.forEach((kpi, index) => {
        const col = 1 + index * 3;
        summary.mergeCells(6, col, 6, col + 2); summary.mergeCells(7, col, 7, col + 2);
        const label = summary.getCell(6, col), value = summary.getCell(7, col);
        label.value = kpi[0]; value.value = kpi[1];
        label.fill = value.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        label.font = { bold: true, color: { argb: kpi[2] } }; value.font = { size: 16, bold: true, color: { argb: kpi[2] } };
        label.alignment = value.alignment = { horizontal: 'center', vertical: 'middle' };
        value.numFmt = index === 3 ? '0.0%' : '"S/ "#,##0.00';
    });
    summary.getRow(6).height = 25; summary.getRow(7).height = 30;
    summary.getRow(9).values = ['TIPO DE COBRO', 'SOLES', '% DEL TOTAL']; styleHeader(summary.getRow(9));
    report.tiposCobro.forEach((row, index) => {
        const excelRow = summary.getRow(10 + index);
        excelRow.values = [row.tipoCobro, row.soles, row.porcentaje];
        excelRow.getCell(2).numFmt = '"S/ "#,##0.00'; excelRow.getCell(3).numFmt = '0.0%';
        if (index % 2) excelRow.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }; });
    });
    const totalRowNumber = 10 + report.tiposCobro.length;
    const totalRow = summary.getRow(totalRowNumber);
    totalRow.values = ['TOTAL GENERAL', report.tiposCobro.length
        ? { formula: `SUM(B10:B${totalRowNumber - 1})`, result: report.resumen.totalVentas }
        : 0, report.tiposCobro.length ? 1 : 0];
    totalRow.font = { bold: true }; totalRow.getCell(2).numFmt = '"S/ "#,##0.00'; totalRow.getCell(3).numFmt = '0.0%';
    totalRow.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } }; });
    const rankingId = workbook.addImage({ buffer: charts.ranking, extension: 'png' });
    const donutId = workbook.addImage({ buffer: charts.donut, extension: 'png' });
    const imageStart = Math.max(10, totalRowNumber + 2);
    summary.addImage(rankingId, { tl: { col: 0, row: imageStart - 1 }, ext: { width: 650, height: 330 } });
    summary.addImage(donutId, { tl: { col: 7, row: imageStart - 1 }, ext: { width: 350, height: 260 } });

    const daily = workbook.addWorksheet('Evolucion diaria', { views: [{ state: 'frozen', ySplit: 5 }] });
    daily.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1, margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.1, footer: 0.1 } };
    daily.columns = [{ header: 'Fecha', key: 'fecha', width: 18 }, { header: 'Total diario', key: 'total', width: 22 }, { header: 'Variacion', key: 'variacion', width: 30 }, ...Array.from({ length: 7 }, () => ({ width: 14 }))];
    daily.mergeCells('A1:J1'); daily.getCell('A1').value = 'EVOLUCION DIARIA DE VENTAS';
    daily.getCell('A1').font = { size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
    daily.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }; daily.getCell('A1').alignment = { horizontal: 'center' };
    daily.getCell('A2').value = `${report.filtros.empresa} | ${report.filtros.turnoLabel} | ${report.filtros.fechaInicio} al ${report.filtros.fechaFin}`;
    daily.mergeCells('A2:J2');
    daily.getRow(4).values = ['FECHA', 'TOTAL DIARIO', 'VARIACION VS. DIA ANTERIOR']; styleHeader(daily.getRow(4));
    report.diario.forEach((row, index) => {
        const rowNumber = 5 + index;
        const excelRow = daily.getRow(rowNumber);
        excelRow.values = [row.fecha, row.total, index ? { formula: `IFERROR(B${rowNumber}/B${rowNumber - 1}-1,0)`, result: report.diario[index - 1].total ? row.total / report.diario[index - 1].total - 1 : 0 } : null];
        excelRow.getCell(2).numFmt = '"S/ "#,##0.00'; excelRow.getCell(3).numFmt = '0.0%';
    });
    const evolutionId = workbook.addImage({ buffer: charts.evolution, extension: 'png' });
    daily.addImage(evolutionId, { tl: { col: 3, row: 3 }, ext: { width: 700, height: 305 } });

    const data = workbook.addWorksheet('Datos');
    data.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    data.columns = [{ header: 'Tipo', key: 'tipo', width: 12 }, { header: 'Tipo de cobro', key: 'tipoCobro', width: 32 }, { header: 'Soles', key: 'soles', width: 18 }, { header: 'Porcentaje', key: 'porcentaje', width: 16 }];
    report.tiposCobro.forEach(row => data.addRow(row)); styleHeader(data.getRow(1));
    data.autoFilter = { from: 'A1', to: `D${Math.max(1, report.tiposCobro.length + 1)}` };
    data.views = [{ state: 'frozen', ySplit: 1 }];
    data.getColumn(3).numFmt = '"S/ "#,##0.00'; data.getColumn(4).numFmt = '0.0%';
    return workbook.xlsx.writeBuffer();
}

function createPdfBuffer(report, charts) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 34, bufferPages: true, info: { Title: 'Estadistica de Venta', Author: 'sediApp' } });
        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
        const pageWidth = doc.page.width - 68;
        doc.rect(0, 0, doc.page.width, 76).fill('#1e3a8a');
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22).text('ESTADISTICA DE VENTA', 34, 22);
        doc.font('Helvetica').fontSize(9).text(`${report.filtros.empresa} | ${report.filtros.turnoLabel} | ${report.filtros.fechaInicio} al ${report.filtros.fechaFin}`, 34, 51);
        const cards = [
            ['TOTAL VENTAS', money(report.resumen.totalVentas), COLORS.blue], ['EFECTIVO', money(report.resumen.efectivo), COLORS.green],
            ['DEPOSITOS', money(report.resumen.depositos), COLORS.amber], ['% EFECTIVO', `${(report.resumen.porcentajeEfectivo * 100).toFixed(1)}%`, COLORS.purple]
        ];
        const gap = 10, cardWidth = (pageWidth - gap * 3) / 4;
        cards.forEach((card, index) => {
            const x = 34 + index * (cardWidth + gap);
            doc.roundedRect(x, 92, cardWidth, 62, 7).fillAndStroke('#f8fafc', '#e2e8f0');
            doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(8).text(card[0], x + 12, 106);
            doc.fillColor(card[2]).fontSize(16).text(card[1], x + 12, 125, { width: cardWidth - 24 });
        });
        doc.image(charts.ranking, 34, 172, { fit: [pageWidth * 0.64, 315] });
        doc.image(charts.donut, 34 + pageWidth * 0.66, 172, { fit: [pageWidth * 0.34, 270] });
        doc.fillColor('#64748b').font('Helvetica').fontSize(8).text(`Generado por ${report.generadoPor} - ${report.generadoEn.toLocaleString('es-PE')}`, 34, 520, { width: pageWidth, align: 'right' });

        doc.addPage();
        doc.fillColor('#1e3a8a').font('Helvetica-Bold').fontSize(18).text('EVOLUCION Y DETALLE', 34, 28);
        if (report.diario.length > 1) doc.image(charts.evolution, 34, 60, { fit: [pageWidth, 255] });
        else doc.fillColor('#64748b').font('Helvetica').fontSize(11).text('La evolucion diaria requiere un rango de mas de un dia.', 34, 70);
        let y = report.diario.length > 1 ? 330 : 105;
        const drawTableHeader = () => {
            doc.rect(34, y, pageWidth, 24).fill('#2563eb');
            doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
            doc.text('TIPO DE COBRO', 44, y + 7, { width: pageWidth * 0.55 });
            doc.text('SOLES', 34 + pageWidth * 0.62, y + 7, { width: pageWidth * 0.18, align: 'right' });
            doc.text('% DEL TOTAL', 34 + pageWidth * 0.82, y + 7, { width: pageWidth * 0.15, align: 'right' });
            y += 24;
        };
        const drawTableCell = (value, x, cellY, width, align = 'left') => {
            let display = String(value);
            while (doc.widthOfString(display) > width && display.length > 4) display = `${display.slice(0, -4)}...`;
            const textX = align === 'right' ? x + width - doc.widthOfString(display) : x;
            doc.save();
            doc.text(display, textX, cellY, { lineBreak: false });
            doc.restore();
        };
        drawTableHeader();
        if (!report.tiposCobro.length) {
            doc.fillColor('#64748b').font('Helvetica').fontSize(10).text('Sin datos para los filtros seleccionados.', 44, y + 10);
            y += 34;
        }
        report.tiposCobro.forEach((row, index) => {
            if (y > doc.page.height - 74) { doc.addPage(); y = 42; drawTableHeader(); }
            if (index % 2) doc.rect(34, y, pageWidth, 23).fill('#f8fafc');
            doc.fillColor('#1f2937').font('Helvetica').fontSize(9);
            drawTableCell(row.tipoCobro, 44, y + 7, pageWidth * 0.55);
            drawTableCell(money(row.soles), 34 + pageWidth * 0.62, y + 7, pageWidth * 0.18, 'right');
            drawTableCell(`${(row.porcentaje * 100).toFixed(1)}%`, 34 + pageWidth * 0.82, y + 7, pageWidth * 0.15, 'right');
            y += 23;
        });
        doc.rect(34, y, pageWidth, 26).fill('#eff6ff');
        doc.fillColor('#1e3a8a').font('Helvetica-Bold').fontSize(9).text('TOTAL GENERAL', 44, y + 8);
        doc.text(money(report.resumen.totalVentas), 34 + pageWidth * 0.62, y + 8, { width: pageWidth * 0.18, align: 'right' });
        doc.text('100.0%', 34 + pageWidth * 0.82, y + 8, { width: pageWidth * 0.15, align: 'right' });
        const range = doc.bufferedPageRange();
        for (let i = 0; i < range.count; i++) {
            doc.switchToPage(i);
            doc.fillColor('#64748b').font('Helvetica').fontSize(8).text(`sediApp | Pagina ${i + 1} de ${range.count}`, 34, 535, { width: pageWidth, height: 10, align: 'center' });
        }
        doc.end();
    });
}

function reportFilename(report, extension) {
    return `EstadisticaVenta_${sanitizeFilename(report.filtros.empresa)}_${report.filtros.fechaInicio}_${report.filtros.fechaFin}.${extension}`;
}

module.exports = { normalizeReport, createCharts, createExcelBuffer, createPdfBuffer, reportFilename, sanitizeFilename, turnoLabel };
