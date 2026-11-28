// Reporte "Ventas por Tipo de Mesa".
// Fuente única de las reglas de negocio: prefijo de ticket por empresa y
// clasificación de mesas (NroMesa + Mozo) en grupos excluyentes, de modo que la
// suma de todos los grupos siempre coincide con el total general.
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const PImage = require('pureimage');
const { sanitizeFilename, chartHelpers } = require('./ventas-estadistica-report');
const { automaticGranularity, evolutionBucket } = require('./cargos-banco-comparativo-report');

const { registerChartFont, text, roundedRect, pngBuffer, money } = chartHelpers;

const EMPRESAS_TICKET = {
    Cocineria: 'T001-',
    'Mar Picante 1': 'T002-',
    'Inversiones Abruzzo Sac': 'T005-'
};

const MOZO_PEDIDOSYA = 195;
const MOZO_RAPPI = 203;

// Orden = orden de presentación. `apps` agrupa PedidosYa, Rappi y Otros apps en un subtotal.
const GRUPOS_MESA = [
    { clave: 'normal', etiqueta: 'Atención normal', rangos: [[1, 80], [121, 200]], color: '#2F5FC4' },
    { clave: 'desayunos', etiqueta: 'Desayunos', rangos: [[81, 120]], color: '#f59e0b' },
    { clave: 'delivery', etiqueta: 'Delivery', rangos: [[201, 209]], color: '#10b981' },
    { clave: 'llevar', etiqueta: 'Para llevar', rangos: [[210, 219]], color: '#06b6d4' },
    { clave: 'pedidosya', etiqueta: 'PedidosYa', rangos: [[220, 230]], mozo: MOZO_PEDIDOSYA, apps: true, color: '#ef4444' },
    { clave: 'rappi', etiqueta: 'Rappi', rangos: [[220, 230]], mozo: MOZO_RAPPI, apps: true, color: '#f97316' },
    { clave: 'otrasapps', etiqueta: 'Otros apps', rangos: [[220, 230]], mozoExcluye: [MOZO_PEDIDOSYA, MOZO_RAPPI], apps: true, color: '#ec4899' },
    { clave: 'descarte', etiqueta: 'Descarte y obsequios', rangos: [[231, 235]], color: '#8b5cf6' },
    { clave: 'varios', etiqueta: 'Varios', rangos: [[236, 320]], color: '#64748b' },
    { clave: 'sinclasificar', etiqueta: 'Sin clasificar', rangos: [], residual: true, opcional: true, color: '#94a3b8' }
];
const GRUPO_POR_CLAVE = new Map(GRUPOS_MESA.map(grupo => [grupo.clave, grupo]));
// Selecciones compuestas aceptadas por el detalle y la exportación.
const SELECCIONES_COMPUESTAS = {
    todos: { clave: 'todos', etiqueta: 'Todos los tipos de mesa' },
    apps: { clave: 'apps', etiqueta: 'PedidosYa | Rappi | Otros apps' }
};

function errorValidacion(message) {
    const error = new Error(message);
    error.status = 400;
    return error;
}

function round2(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

function prefijoTicket(empresa) {
    const prefijo = EMPRESAS_TICKET[String(empresa || '').trim()];
    if (!prefijo) throw errorValidacion('Empresa no permitida');
    return prefijo;
}

// Turno 1 = Mañana y 2 = Tarde-Noche, salvo en Cocineria, donde es al revés.
function turnoMesasLabel(empresa, turno) {
    const valor = Number(turno);
    if (valor === 0) return 'Ambos turnos';
    const invertido = String(empresa || '').trim() === 'Cocineria';
    if (valor === 1) return invertido ? 'Tarde-Noche' : 'Mañana';
    if (valor === 2) return invertido ? 'Mañana' : 'Tarde-Noche';
    return `Turno ${turno}`;
}

function enRangos(mesa, rangos) {
    return rangos.some(([desde, hasta]) => mesa >= desde && mesa <= hasta);
}

function coincideGrupo(grupo, mesa, mozo) {
    if (grupo.residual || !enRangos(mesa, grupo.rangos)) return false;
    if (grupo.mozo !== undefined) return mozo === grupo.mozo;
    if (grupo.mozoExcluye) return !grupo.mozoExcluye.includes(mozo);
    return true;
}

function clasificarMesa(nroMesa, mozo) {
    const mesa = nroMesa === null || nroMesa === undefined || nroMesa === '' ? NaN : Number(nroMesa);
    const mozoNum = mozo === null || mozo === undefined || mozo === '' ? null : Number(mozo);
    if (!Number.isInteger(mesa)) return 'sinclasificar';
    const grupo = GRUPOS_MESA.find(item => coincideGrupo(item, mesa, mozoNum));
    return grupo ? grupo.clave : 'sinclasificar';
}

function rangoTexto(grupo) {
    if (grupo.residual) return 'Otras mesas';
    const mesas = grupo.rangos.map(([a, b]) => `${a}–${b}`).join(', ');
    if (grupo.mozo !== undefined) return `${mesas} · Mozo ${grupo.mozo}`;
    if (grupo.mozoExcluye) return `${mesas} · Otro mozo`;
    return mesas;
}

function validarSeleccion(clave) {
    const valor = String(clave || 'todos').trim();
    if (SELECCIONES_COMPUESTAS[valor] || GRUPO_POR_CLAVE.has(valor)) return valor;
    throw errorValidacion('Tipo de mesa no válido');
}

function etiquetaSeleccion(clave) {
    return (SELECCIONES_COMPUESTAS[clave] || GRUPO_POR_CLAVE.get(clave) || {}).etiqueta || clave;
}

// Fragmento SQL (sin parámetros de usuario: solo enteros fijos de GRUPOS_MESA)
// equivalente a clasificarMesa(). `alias` permite prefijar las columnas.
function whereGrupo(clave, alias = '') {
    const col = name => (alias ? `${alias}.${name}` : name);
    const rangosSql = rangos => `(${rangos.map(([a, b]) => `${col('NroMesa')} BETWEEN ${Number(a)} AND ${Number(b)}`).join(' OR ')})`;
    const seleccion = validarSeleccion(clave);
    if (seleccion === 'todos') return '1 = 1';
    if (seleccion === 'apps') return `(${GRUPOS_MESA.filter(g => g.apps).map(g => whereGrupo(g.clave, alias)).join(' OR ')})`;
    const grupo = GRUPO_POR_CLAVE.get(seleccion);
    if (grupo.residual) {
        const todos = GRUPOS_MESA.filter(g => !g.residual).flatMap(g => g.rangos);
        return `(${col('NroMesa')} IS NULL OR NOT ${rangosSql(todos)})`;
    }
    let where = rangosSql(grupo.rangos);
    if (grupo.mozo !== undefined) where += ` AND ${col('Mozo')} = ${Number(grupo.mozo)}`;
    if (grupo.mozoExcluye) where += ` AND (${col('Mozo')} IS NULL OR ${col('Mozo')} NOT IN (${grupo.mozoExcluye.map(Number).join(', ')}))`;
    return `(${where})`;
}

function perteneceSeleccion(claveGrupo, seleccion) {
    if (seleccion === 'todos') return true;
    if (seleccion === 'apps') return Boolean(GRUPO_POR_CLAVE.get(claveGrupo)?.apps);
    return claveGrupo === seleccion;
}

function isoDia(value) {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value || '').slice(0, 10);
}

function sumarFilas(filas) {
    const grupos = new Map(GRUPOS_MESA.map(g => [g.clave, { tickets: 0, total: 0, mesas: new Map() }]));
    const porDia = new Map();
    filas.forEach(fila => {
        const clave = clasificarMesa(fila.mesa, fila.mozo);
        const tickets = Number(fila.tickets) || 0;
        const total = Number(fila.total) || 0;
        const acc = grupos.get(clave);
        acc.tickets += tickets;
        acc.total += total;
        const mesaKey = fila.mesa === null || fila.mesa === undefined ? 'S/N' : String(fila.mesa);
        const mesa = acc.mesas.get(mesaKey) || { mesa: mesaKey, tickets: 0, total: 0 };
        mesa.tickets += tickets;
        mesa.total += total;
        acc.mesas.set(mesaKey, mesa);
        const dia = isoDia(fila.dia);
        if (dia) {
            const registro = porDia.get(dia) || {};
            registro[clave] = (registro[clave] || 0) + total;
            porDia.set(dia, registro);
        }
    });
    return { grupos, porDia };
}

function etiquetaPeriodo(bucket, granularidad) {
    const [anio, mes, dia] = bucket.split('-');
    if (granularidad === 'mensual') return `${mes}/${anio}`;
    if (granularidad === 'semanal') return `Sem ${dia}/${mes}`;
    return `${dia}/${mes}`;
}

function construirEvolucion(porDia, fechaInicio, fechaFin) {
    const granularidad = automaticGranularity({ fInicio: fechaInicio, fFin: fechaFin });
    const periodos = new Map();
    const inicio = new Date(`${fechaInicio}T00:00:00Z`);
    const fin = new Date(`${fechaFin}T00:00:00Z`);
    for (let t = inicio.getTime(); t <= fin.getTime(); t += 86400000) {
        const dia = new Date(t).toISOString().slice(0, 10);
        const bucket = evolutionBucket(dia, granularidad);
        if (!periodos.has(bucket)) periodos.set(bucket, { clave: bucket, etiqueta: etiquetaPeriodo(bucket, granularidad), total: 0, grupos: {} });
        const periodo = periodos.get(bucket);
        Object.entries(porDia.get(dia) || {}).forEach(([clave, total]) => {
            periodo.grupos[clave] = (periodo.grupos[clave] || 0) + total;
            periodo.total += total;
        });
    }
    const lista = [...periodos.values()].map(periodo => ({
        ...periodo,
        total: round2(periodo.total),
        grupos: Object.fromEntries(Object.entries(periodo.grupos).map(([k, v]) => [k, round2(v)]))
    }));
    return { granularidad, periodos: lista };
}

function periodoAnterior(fechaInicio, fechaFin) {
    const inicio = new Date(`${fechaInicio}T00:00:00Z`);
    const fin = new Date(`${fechaFin}T00:00:00Z`);
    const dias = Math.floor((fin - inicio) / 86400000) + 1;
    const finAnterior = new Date(inicio.getTime() - 86400000);
    const inicioAnterior = new Date(finAnterior.getTime() - (dias - 1) * 86400000);
    return { fechaInicio: inicioAnterior.toISOString().slice(0, 10), fechaFin: finAnterior.toISOString().slice(0, 10), dias };
}

function buildMesasReport({ filas = [], filtros = {}, anterior = null, generadoPor = '' } = {}) {
    const empresa = String(filtros.empresa || '').trim();
    const actual = sumarFilas(filas);
    const previo = anterior ? sumarFilas(anterior.filas || []) : null;
    const totalGeneral = round2([...actual.grupos.values()].reduce((s, g) => s + g.total, 0));
    const ticketsGenerales = [...actual.grupos.values()].reduce((s, g) => s + g.tickets, 0);
    const totalAnterior = previo ? round2([...previo.grupos.values()].reduce((s, g) => s + g.total, 0)) : null;

    const grupos = GRUPOS_MESA.map(def => {
        const acc = actual.grupos.get(def.clave);
        const total = round2(acc.total);
        const prev = previo ? previo.grupos.get(def.clave) : null;
        const totalPrevio = prev ? round2(prev.total) : null;
        return {
            clave: def.clave,
            etiqueta: def.etiqueta,
            rango: rangoTexto(def),
            color: def.color,
            apps: Boolean(def.apps),
            tickets: acc.tickets,
            total,
            promedio: acc.tickets ? round2(total / acc.tickets) : 0,
            porcentaje: totalGeneral ? total / totalGeneral : 0,
            anterior: prev ? { tickets: prev.tickets, total: totalPrevio } : null,
            variacion: prev && totalPrevio ? (total - totalPrevio) / totalPrevio : null,
            mesas: [...acc.mesas.values()]
                .map(m => ({ mesa: m.mesa, tickets: m.tickets, total: round2(m.total) }))
                .sort((a, b) => b.total - a.total || String(a.mesa).localeCompare(String(b.mesa), 'es', { numeric: true }))
        };
    }).filter(grupo => !GRUPO_POR_CLAVE.get(grupo.clave).opcional || grupo.tickets > 0 || (grupo.anterior && grupo.anterior.tickets > 0));

    const appsGrupos = grupos.filter(g => g.apps);
    const appsTotal = round2(appsGrupos.reduce((s, g) => s + g.total, 0));
    const appsAnterior = previo ? round2(appsGrupos.reduce((s, g) => s + (g.anterior?.total || 0), 0)) : null;
    const apps = {
        tickets: appsGrupos.reduce((s, g) => s + g.tickets, 0),
        total: appsTotal,
        porcentaje: totalGeneral ? appsTotal / totalGeneral : 0,
        anterior: previo ? { tickets: appsGrupos.reduce((s, g) => s + (g.anterior?.tickets || 0), 0), total: appsAnterior } : null,
        variacion: previo && appsAnterior ? (appsTotal - appsAnterior) / appsAnterior : null
    };

    const lider = grupos.filter(g => g.total > 0).sort((a, b) => b.total - a.total)[0] || null;

    return {
        filtros: {
            empresa,
            prefijo: EMPRESAS_TICKET[empresa] || '',
            turno: Number(filtros.turno) || 0,
            turnoLabel: turnoMesasLabel(empresa, filtros.turno),
            fechaInicio: filtros.fechaInicio,
            fechaFin: filtros.fechaFin
        },
        resumen: {
            total: totalGeneral,
            tickets: ticketsGenerales,
            promedio: ticketsGenerales ? round2(totalGeneral / ticketsGenerales) : 0,
            lider: lider ? { clave: lider.clave, etiqueta: lider.etiqueta, total: lider.total, porcentaje: lider.porcentaje } : null
        },
        grupos,
        apps,
        evolucion: filtros.fechaInicio && filtros.fechaFin
            ? construirEvolucion(actual.porDia, filtros.fechaInicio, filtros.fechaFin)
            : { granularidad: 'diaria', periodos: [] },
        anterior: previo ? {
            fechaInicio: anterior.fechaInicio,
            fechaFin: anterior.fechaFin,
            total: totalAnterior,
            tickets: [...previo.grupos.values()].reduce((s, g) => s + g.tickets, 0),
            variacion: totalAnterior ? (totalGeneral - totalAnterior) / totalAnterior : null
        } : null,
        generadoPor: String(generadoPor || '').trim() || 'Usuario',
        generadoEn: new Date()
    };
}

function normalizarTicket(row) {
    const mesa = row.NroMesa === null || row.NroMesa === undefined ? null : Number(row.NroMesa);
    const mozo = row.Mozo === null || row.Mozo === undefined ? null : Number(row.Mozo);
    const grupo = clasificarMesa(mesa, mozo);
    return {
        nroTicket: String(row.NroTicket || '').trim(),
        mesa,
        mozo,
        grupo,
        grupoEtiqueta: GRUPO_POR_CLAVE.get(grupo).etiqueta,
        fecha: row.Fecha instanceof Date ? row.Fecha.toISOString().slice(0, 16).replace('T', ' ') : String(row.Fecha || '').slice(0, 16),
        turno: row.Turno === null || row.Turno === undefined ? null : Number(row.Turno),
        flete: round2(row.Flete),
        propina: round2(row.Propina),
        total: round2(row.Total)
    };
}

// ---------- Gráfica para exportaciones (pureimage) ----------
function compactMoney(value) {
    const n = Number(value) || 0;
    if (Math.abs(n) >= 1e6) return `S/ ${(n / 1e6).toFixed(1)}M`;
    if (Math.abs(n) >= 1e3) return `S/ ${(n / 1e3).toFixed(1)}k`;
    return `S/ ${n.toFixed(0)}`;
}

function partirEtiqueta(label, max = 13) {
    const palabras = String(label).split(/\s+/);
    const lineas = [''];
    palabras.forEach(palabra => {
        const i = lineas.length - 1;
        if (lineas[i] && (lineas[i] + ' ' + palabra).length > max && lineas.length < 2) lineas.push(palabra);
        else lineas[i] = lineas[i] ? `${lineas[i]} ${palabra}` : palabra;
    });
    return lineas.map(l => (l.length > max + 3 ? `${l.slice(0, max)}...` : l));
}

async function createColumnsChart(report) {
    registerChartFont();
    const width = 1200, height = 560;
    const image = PImage.make(width, height);
    const ctx = image.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
    text(ctx, 'Ventas por tipo de mesa', 48, 50, 24, '#1F2D4F');
    const subtitulo = report.anterior
        ? `Periodo actual vs. anterior (${report.anterior.fechaInicio} al ${report.anterior.fechaFin})`
        : 'Comparativo de totales por tipo de mesa';
    text(ctx, subtitulo, 48, 80, 13, '#64748b');
    const grupos = report.grupos;
    const left = 110, top = 110, chartW = 1050, chartH = 330;
    const valores = grupos.flatMap(g => [g.total, g.anterior?.total || 0]);
    const max = Math.max(...valores, 1);
    for (let i = 0; i <= 4; i++) {
        const y = top + chartH * i / 4;
        ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + chartW, y); ctx.stroke();
        text(ctx, compactMoney(max * (4 - i) / 4), left - 12, y + 5, 11, '#64748b', 'right');
    }
    if (!report.resumen.tickets && !(report.anterior && report.anterior.tickets)) {
        text(ctx, 'Sin ventas para los filtros seleccionados', left + chartW / 2, top + chartH / 2, 18, '#64748b', 'center');
        return pngBuffer(image);
    }
    const slot = chartW / Math.max(grupos.length, 1);
    const conAnterior = Boolean(report.anterior);
    const barW = Math.min(conAnterior ? 34 : 56, slot * (conAnterior ? 0.36 : 0.6));
    grupos.forEach((grupo, index) => {
        const cx = left + slot * index + slot / 2;
        const barras = conAnterior
            ? [{ valor: grupo.anterior?.total || 0, color: '#cbd5e1', x: cx - barW - 3 }, { valor: grupo.total, color: grupo.color, x: cx + 3 }]
            : [{ valor: grupo.total, color: grupo.color, x: cx - barW / 2 }];
        barras.forEach(barra => {
            const h = chartH * barra.valor / max;
            if (h > 0) roundedRect(ctx, barra.x, top + chartH - h, barW, Math.max(h, 2), 5, barra.color);
        });
        const etiquetaValor = compactMoney(grupo.total);
        const yValor = top + chartH - chartH * grupo.total / max - 8;
        text(ctx, etiquetaValor, conAnterior ? cx + 3 + barW / 2 : cx, Math.max(top - 4, yValor), 10, '#1F2D4F', 'center');
        partirEtiqueta(grupo.etiqueta).forEach((linea, i) => text(ctx, linea, cx, top + chartH + 26 + i * 17, 10, '#334155', 'center'));
        text(ctx, `${(grupo.porcentaje * 100).toFixed(1)}%`, cx, top + chartH + 66, 10, '#64748b', 'center');
    });
    if (conAnterior) {
        roundedRect(ctx, width - 360, 40, 14, 14, 3, '#cbd5e1'); text(ctx, 'Periodo anterior', width - 338, 53, 11, '#334155');
        roundedRect(ctx, width - 200, 40, 14, 14, 3, '#2F5FC4'); text(ctx, 'Periodo actual', width - 178, 53, 11, '#334155');
    }
    return pngBuffer(image);
}

async function createCharts(report) {
    return { columnas: await createColumnsChart(report) };
}

// ---------- Excel ----------
const MONEY_FMT = '"S/ "#,##0.00';
const FILL = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

function styleHeader(row) {
    row.height = 24;
    row.eachCell(cell => {
        cell.fill = FILL('FF2F5FC4');
        cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });
}

function titleRow(sheet, range, value, size = 20) {
    sheet.mergeCells(range);
    const cell = sheet.getCell(range.split(':')[0]);
    cell.value = value;
    cell.font = { size, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = FILL('FF1F2D4F');
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 34;
}

function descripcionFiltros(report) {
    return `${report.filtros.empresa} (${report.filtros.prefijo}) | ${report.filtros.turnoLabel} | ${report.filtros.fechaInicio} al ${report.filtros.fechaFin}`;
}

async function createExcelBuffer(report, charts, detalle = null) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'sediApp';
    workbook.created = report.generadoEn;
    const landscape = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.1, footer: 0.1 } };
    const conAnterior = Boolean(report.anterior);

    // Resumen
    const resumen = workbook.addWorksheet('Resumen');
    resumen.pageSetup = landscape;
    resumen.columns = [{ width: 26 }, { width: 24 }, { width: 12 }, { width: 18 }, { width: 15 }, { width: 13 }, { width: 18 }, { width: 13 }];
    titleRow(resumen, 'A1:H1', 'VENTAS POR TIPO DE MESA');
    const meta = [
        ['Empresa', `${report.filtros.empresa} (tickets ${report.filtros.prefijo})`],
        ['Turno', report.filtros.turnoLabel],
        ['Periodo', `${report.filtros.fechaInicio} al ${report.filtros.fechaFin}`],
        ['Comparado con', conAnterior ? `${report.anterior.fechaInicio} al ${report.anterior.fechaFin}` : '—'],
        ['Generado por', `${report.generadoPor} — ${report.generadoEn.toLocaleString('es-PE')}`]
    ];
    meta.forEach(([label, value], i) => {
        const row = resumen.getRow(2 + i);
        row.getCell(1).value = label; row.getCell(1).font = { bold: true, color: { argb: 'FF5B6785' } };
        resumen.mergeCells(2 + i, 2, 2 + i, 8); row.getCell(2).value = value;
    });
    const kpis = [
        ['TOTAL VENDIDO', report.resumen.total, MONEY_FMT],
        ['TICKETS', report.resumen.tickets, '#,##0'],
        ['TICKET PROMEDIO', report.resumen.promedio, MONEY_FMT],
        ['GRUPO LÍDER', report.resumen.lider ? `${report.resumen.lider.etiqueta} (${(report.resumen.lider.porcentaje * 100).toFixed(1)}%)` : '—', null]
    ];
    kpis.forEach(([label, value, fmt], i) => {
        const col = 1 + i * 2;
        const labelCell = resumen.getCell(8, col), valueCell = resumen.getCell(9, col);
        if (i > 0) { resumen.mergeCells(8, col, 8, col + 1); resumen.mergeCells(9, col, 9, col + 1); }
        labelCell.value = label; valueCell.value = value;
        labelCell.font = { bold: true, color: { argb: 'FF2F5FC4' } };
        valueCell.font = { size: 14, bold: true, color: { argb: 'FF1F2D4F' } };
        labelCell.fill = valueCell.fill = FILL('FFF4F6FA');
        if (fmt) valueCell.numFmt = fmt;
    });
    const encabezado = ['TIPO DE MESA', 'MESAS', 'TICKETS', 'TOTAL', 'TICKET PROM.', '% DEL TOTAL'];
    if (conAnterior) encabezado.push('PERIODO ANTERIOR', 'VARIACIÓN');
    const headerRow = resumen.getRow(11);
    headerRow.values = encabezado; styleHeader(headerRow);
    const primera = 12;
    report.grupos.forEach((grupo, i) => {
        const row = resumen.getRow(primera + i);
        const r = primera + i;
        const values = [grupo.etiqueta, grupo.rango, grupo.tickets, grupo.total,
            { formula: `IF(C${r}=0,0,D${r}/C${r})`, result: grupo.promedio },
            { formula: `IF($D$${primera + report.grupos.length}=0,0,D${r}/$D$${primera + report.grupos.length})`, result: grupo.porcentaje }];
        if (conAnterior) values.push(grupo.anterior?.total || 0, grupo.variacion === null ? '—' : grupo.variacion);
        row.values = values;
        row.getCell(4).numFmt = MONEY_FMT; row.getCell(5).numFmt = MONEY_FMT; row.getCell(6).numFmt = '0.0%';
        if (conAnterior) { row.getCell(7).numFmt = MONEY_FMT; row.getCell(8).numFmt = '0.0%'; }
        row.getCell(1).font = { bold: true, color: { argb: `FF${grupo.color.slice(1).toUpperCase()}` } };
        if (i % 2) row.eachCell(cell => { cell.fill = FILL('FFF7F9FC'); });
    });
    const totalR = primera + report.grupos.length;
    const ultima = totalR - 1;
    const totalRow = resumen.getRow(totalR);
    const totalValues = ['TOTAL GENERAL', '',
        { formula: `SUM(C${primera}:C${ultima})`, result: report.resumen.tickets },
        { formula: `SUM(D${primera}:D${ultima})`, result: report.resumen.total },
        { formula: `IF(C${totalR}=0,0,D${totalR}/C${totalR})`, result: report.resumen.promedio },
        report.resumen.tickets ? 1 : 0];
    if (conAnterior) totalValues.push({ formula: `SUM(G${primera}:G${ultima})`, result: report.anterior.total }, report.anterior.variacion === null ? '—' : report.anterior.variacion);
    totalRow.values = totalValues;
    totalRow.font = { bold: true };
    totalRow.eachCell(cell => { cell.fill = FILL('FFE8EDF7'); });
    totalRow.getCell(4).numFmt = MONEY_FMT; totalRow.getCell(5).numFmt = MONEY_FMT; totalRow.getCell(6).numFmt = '0.0%';
    if (conAnterior) { totalRow.getCell(7).numFmt = MONEY_FMT; totalRow.getCell(8).numFmt = '0.0%'; }
    const appsRow = resumen.getRow(totalR + 1);
    const appsValues = ['Subtotal Apps', 'PedidosYa + Rappi + Otros apps', report.apps.tickets, report.apps.total, report.apps.tickets ? report.apps.total / report.apps.tickets : 0, report.apps.porcentaje];
    if (conAnterior) appsValues.push(report.apps.anterior?.total || 0, report.apps.variacion === null ? '—' : report.apps.variacion);
    appsRow.values = appsValues;
    appsRow.font = { italic: true, color: { argb: 'FF5B6785' } };
    appsRow.getCell(4).numFmt = MONEY_FMT; appsRow.getCell(5).numFmt = MONEY_FMT; appsRow.getCell(6).numFmt = '0.0%';
    if (conAnterior) { appsRow.getCell(7).numFmt = MONEY_FMT; appsRow.getCell(8).numFmt = '0.0%'; }
    const chartId = workbook.addImage({ buffer: charts.columnas, extension: 'png' });
    resumen.addImage(chartId, { tl: { col: 0, row: totalR + 2 }, ext: { width: 860, height: 400 } });

    // Evolución
    const evolucion = workbook.addWorksheet('Evolución', { views: [{ state: 'frozen', ySplit: 4, xSplit: 1 }] });
    evolucion.pageSetup = landscape;
    const gruposEvo = report.grupos;
    evolucion.columns = [{ width: 14 }, ...gruposEvo.map(() => ({ width: 15 })), { width: 16 }];
    const lastCol = gruposEvo.length + 2;
    titleRow(evolucion, `A1:${evolucion.getColumn(lastCol).letter}1`, `EVOLUCIÓN ${report.evolucion.granularidad.toUpperCase()} POR TIPO DE MESA`, 16);
    evolucion.mergeCells(2, 1, 2, lastCol);
    evolucion.getCell('A2').value = descripcionFiltros(report);
    const evoHeader = evolucion.getRow(4);
    evoHeader.values = ['PERIODO', ...gruposEvo.map(g => g.etiqueta.toUpperCase()), 'TOTAL'];
    styleHeader(evoHeader);
    report.evolucion.periodos.forEach((periodo, i) => {
        const r = 5 + i;
        const row = evolucion.getRow(r);
        const totalLetter = evolucion.getColumn(lastCol - 1).letter;
        row.values = [periodo.etiqueta, ...gruposEvo.map(g => periodo.grupos[g.clave] || 0), { formula: `SUM(B${r}:${totalLetter}${r})`, result: periodo.total }];
        for (let c = 2; c <= lastCol; c++) row.getCell(c).numFmt = MONEY_FMT;
    });
    const evoTotalR = 5 + report.evolucion.periodos.length;
    const evoTotal = evolucion.getRow(evoTotalR);
    evoTotal.getCell(1).value = 'TOTAL';
    for (let c = 2; c <= lastCol; c++) {
        const letter = evolucion.getColumn(c).letter;
        const grupo = gruposEvo[c - 2];
        evoTotal.getCell(c).value = report.evolucion.periodos.length
            ? { formula: `SUM(${letter}5:${letter}${evoTotalR - 1})`, result: grupo ? grupo.total : report.resumen.total }
            : 0;
        evoTotal.getCell(c).numFmt = MONEY_FMT;
    }
    evoTotal.font = { bold: true };
    evoTotal.eachCell(cell => { cell.fill = FILL('FFE8EDF7'); });

    // Tickets
    if (detalle) {
        const tickets = workbook.addWorksheet('Tickets', { views: [{ state: 'frozen', ySplit: 4 }] });
        tickets.pageSetup = landscape;
        tickets.columns = [{ width: 16 }, { width: 8 }, { width: 8 }, { width: 22 }, { width: 18 }, { width: 13 }, { width: 11 }, { width: 11 }, { width: 14 }];
        titleRow(tickets, 'A1:I1', `TICKETS — ${etiquetaSeleccion(detalle.seleccion).toUpperCase()}`, 16);
        tickets.mergeCells('A2:I2');
        tickets.getCell('A2').value = detalle.truncado
            ? `${descripcionFiltros(report)} | Se muestran ${detalle.tickets.length.toLocaleString('es-PE')} de ${detalle.totales.tickets.toLocaleString('es-PE')} tickets; precise el rango para obtener el detalle completo.`
            : descripcionFiltros(report);
        const th = tickets.getRow(4);
        th.values = ['NRO. TICKET', 'MESA', 'MOZO', 'TIPO DE MESA', 'FECHA', 'TURNO', 'FLETE', 'PROPINA', 'TOTAL'];
        styleHeader(th);
        detalle.tickets.forEach((t, i) => {
            const row = tickets.getRow(5 + i);
            row.values = [t.nroTicket, t.mesa, t.mozo, t.grupoEtiqueta, t.fecha, turnoMesasLabel(report.filtros.empresa, t.turno), t.flete, t.propina, t.total];
            row.getCell(7).numFmt = MONEY_FMT; row.getCell(8).numFmt = MONEY_FMT; row.getCell(9).numFmt = MONEY_FMT;
        });
        const lastR = 4 + detalle.tickets.length;
        tickets.autoFilter = { from: 'A4', to: `I${Math.max(4, lastR)}` };
        const sumRow = tickets.getRow(lastR + 1);
        sumRow.getCell(1).value = 'TOTAL (filas visibles)';
        ['G', 'H', 'I'].forEach((letter, i) => {
            const field = ['flete', 'propina', 'total'][i];
            const result = round2(detalle.tickets.reduce((s, t) => s + t[field], 0));
            sumRow.getCell(7 + i).value = detalle.tickets.length ? { formula: `SUBTOTAL(109,${letter}5:${letter}${lastR})`, result } : 0;
            sumRow.getCell(7 + i).numFmt = MONEY_FMT;
        });
        sumRow.font = { bold: true };
        sumRow.eachCell(cell => { cell.fill = FILL('FFE8EDF7'); });
    }
    return workbook.xlsx.writeBuffer();
}

// ---------- PDF ----------
const PDF_MAX_TICKETS = 1500;

function createPdfBuffer(report, charts, detalle = null) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 34, bufferPages: true, info: { Title: 'Ventas por Tipo de Mesa', Author: 'sediApp' } });
        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        const pageWidth = doc.page.width - 68;
        const bottomLimit = doc.page.height - 80;
        const conAnterior = Boolean(report.anterior);

        doc.rect(0, 0, doc.page.width, 76).fill('#1F2D4F');
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(21).text('VENTAS POR TIPO DE MESA', 34, 22);
        doc.font('Helvetica').fontSize(9).text(descripcionFiltros(report) + (conAnterior ? ` | Comparado con ${report.anterior.fechaInicio} al ${report.anterior.fechaFin}` : ''), 34, 51);

        const cards = [
            ['TOTAL VENDIDO', money(report.resumen.total)],
            ['TICKETS', report.resumen.tickets.toLocaleString('es-PE')],
            ['TICKET PROMEDIO', money(report.resumen.promedio)],
            ['GRUPO LÍDER', report.resumen.lider ? `${report.resumen.lider.etiqueta} · ${(report.resumen.lider.porcentaje * 100).toFixed(1)}%` : '—']
        ];
        const gap = 10, cardW = (pageWidth - gap * 3) / 4;
        cards.forEach(([label, value], i) => {
            const x = 34 + i * (cardW + gap);
            doc.roundedRect(x, 90, cardW, 56, 7).fillAndStroke('#F4F6FA', '#E3E8F1');
            doc.fillColor('#5B6785').font('Helvetica-Bold').fontSize(8).text(label, x + 12, 101);
            doc.fillColor('#1F2D4F').fontSize(14).text(value, x + 12, 118, { width: cardW - 24, lineBreak: false, ellipsis: true });
        });
        doc.image(charts.columnas, 34, 158, { fit: [pageWidth, 370], align: 'center' });

        // Tabla de grupos
        doc.addPage();
        let y = 34;
        doc.fillColor('#1F2D4F').font('Helvetica-Bold').fontSize(15).text('Resumen por tipo de mesa', 34, y);
        y += 26;
        const cols = conAnterior
            ? [['TIPO DE MESA', 0.2, 'left'], ['MESAS', 0.18, 'left'], ['TICKETS', 0.08, 'right'], ['TOTAL', 0.13, 'right'], ['PROMEDIO', 0.1, 'right'], ['%', 0.07, 'right'], ['ANTERIOR', 0.13, 'right'], ['VAR.', 0.09, 'right']]
            : [['TIPO DE MESA', 0.26, 'left'], ['MESAS', 0.24, 'left'], ['TICKETS', 0.1, 'right'], ['TOTAL', 0.16, 'right'], ['PROMEDIO', 0.13, 'right'], ['%', 0.09, 'right']];
        const drawRow = (values, rowY, opts = {}) => {
            let x = 34;
            if (opts.fill) doc.rect(34, rowY, pageWidth, 21).fill(opts.fill);
            doc.fillColor(opts.color || '#1F2D4F').font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5);
            cols.forEach(([, w, align], i) => {
                const width = pageWidth * w;
                doc.text(String(values[i] ?? ''), x + 6, rowY + 6, { width: width - 12, align, lineBreak: false, ellipsis: true });
                x += width;
            });
        };
        const pct = v => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(1)}%`);
        drawRow(cols.map(c => c[0]), y, { fill: '#2F5FC4', color: '#ffffff', bold: true }); y += 21;
        report.grupos.forEach((g, i) => {
            const vals = [g.etiqueta, g.rango, g.tickets.toLocaleString('es-PE'), money(g.total), money(g.promedio), pct(g.porcentaje)];
            if (conAnterior) vals.push(money(g.anterior?.total || 0), pct(g.variacion));
            drawRow(vals, y, { fill: i % 2 ? '#F7F9FC' : null }); y += 21;
        });
        const totalVals = ['TOTAL GENERAL', '', report.resumen.tickets.toLocaleString('es-PE'), money(report.resumen.total), money(report.resumen.promedio), report.resumen.tickets ? '100.0%' : '0.0%'];
        if (conAnterior) totalVals.push(money(report.anterior.total), pct(report.anterior.variacion));
        drawRow(totalVals, y, { fill: '#E8EDF7', bold: true }); y += 21;
        const appsVals = ['Subtotal Apps', 'PedidosYa + Rappi + Otros', report.apps.tickets.toLocaleString('es-PE'), money(report.apps.total), money(report.apps.tickets ? report.apps.total / report.apps.tickets : 0), pct(report.apps.porcentaje)];
        if (conAnterior) appsVals.push(money(report.apps.anterior?.total || 0), pct(report.apps.variacion));
        drawRow(appsVals, y, { color: '#5B6785' }); y += 34;

        // Detalle de tickets
        if (detalle) {
            const titulo = `Tickets — ${etiquetaSeleccion(detalle.seleccion)}`;
            if (y > bottomLimit - 80) { doc.addPage(); y = 34; }
            doc.fillColor('#1F2D4F').font('Helvetica-Bold').fontSize(13).text(titulo, 34, y); y += 20;
            if (detalle.totales.tickets > PDF_MAX_TICKETS || detalle.truncado) {
                doc.fillColor('#5B6785').font('Helvetica').fontSize(9).text(
                    `El periodo tiene ${detalle.totales.tickets.toLocaleString('es-PE')} tickets (${money(detalle.totales.total)}). El PDF lista hasta ${PDF_MAX_TICKETS.toLocaleString('es-PE')}; use la exportación Excel o seleccione un tipo de mesa o un rango menor para ver el detalle completo.`,
                    34, y, { width: pageWidth });
            } else {
                const tcols = [['NRO. TICKET', 0.15, 'left'], ['MESA', 0.07, 'right'], ['MOZO', 0.07, 'right'], ['TIPO DE MESA', 0.18, 'left'], ['FECHA', 0.15, 'left'], ['TURNO', 0.1, 'left'], ['FLETE', 0.09, 'right'], ['PROPINA', 0.09, 'right'], ['TOTAL', 0.1, 'right']];
                const drawTicketRow = (values, rowY, opts = {}) => {
                    let x = 34;
                    if (opts.fill) doc.rect(34, rowY, pageWidth, 18).fill(opts.fill);
                    doc.fillColor(opts.color || '#1F2D4F').font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
                    tcols.forEach(([, w, align], i) => {
                        const width = pageWidth * w;
                        doc.text(String(values[i] ?? ''), x + 5, rowY + 5, { width: width - 10, align, lineBreak: false, ellipsis: true });
                        x += width;
                    });
                };
                const header = () => { drawTicketRow(tcols.map(c => c[0]), y, { fill: '#2F5FC4', color: '#ffffff', bold: true }); y += 18; };
                header();
                if (!detalle.tickets.length) {
                    doc.fillColor('#5B6785').font('Helvetica').fontSize(9).text('Sin tickets para los filtros seleccionados.', 40, y + 6); y += 24;
                }
                detalle.tickets.forEach((t, i) => {
                    if (y > bottomLimit) { doc.addPage(); y = 34; header(); }
                    drawTicketRow([t.nroTicket, t.mesa ?? '', t.mozo ?? '', t.grupoEtiqueta, t.fecha, turnoMesasLabel(report.filtros.empresa, t.turno), money(t.flete), money(t.propina), money(t.total)], y, { fill: i % 2 ? '#F7F9FC' : null });
                    y += 18;
                });
                if (y > bottomLimit) { doc.addPage(); y = 34; }
                drawTicketRow(['TOTAL', '', '', `${detalle.totales.tickets.toLocaleString('es-PE')} tickets`, '', '', money(detalle.totales.flete), money(detalle.totales.propina), money(detalle.totales.total)], y, { fill: '#E8EDF7', bold: true });
            }
        }

        const range = doc.bufferedPageRange();
        for (let i = 0; i < range.count; i++) {
            doc.switchToPage(i);
            doc.fillColor('#64748b').font('Helvetica').fontSize(8).text(
                `sediApp | Generado por ${report.generadoPor} - ${report.generadoEn.toLocaleString('es-PE')} | Página ${i + 1} de ${range.count}`,
                34, doc.page.height - 50, { width: pageWidth, height: 10, align: 'center', lineBreak: false });
        }
        doc.end();
    });
}

function reportFilename(report, extension) {
    return `VentasTipoMesa_${sanitizeFilename(report.filtros.empresa)}_${report.filtros.fechaInicio}_${report.filtros.fechaFin}.${extension}`;
}

module.exports = {
    EMPRESAS_TICKET, GRUPOS_MESA, MOZO_PEDIDOSYA, MOZO_RAPPI, PDF_MAX_TICKETS,
    prefijoTicket, turnoMesasLabel, clasificarMesa, validarSeleccion, etiquetaSeleccion, whereGrupo, perteneceSeleccion,
    periodoAnterior, buildMesasReport, normalizarTicket, createCharts, createExcelBuffer, createPdfBuffer, reportFilename
};
