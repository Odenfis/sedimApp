// ============================================
//  UTILIDADES DE ZONA HORARIA (CLIENTE / SERVIDOR)
//  Convención: se usa el estándar de JavaScript
//  getTimezoneOffset() => minutos, positivos al OESTE de UTC.
//  Ej: Perú (UTC-5) => 300. España (UTC+2) => -120.
// ============================================

/**
 * Parsea el header X-Timezone-Offset enviado por el cliente.
 * @param {string|number|undefined} valor - Valor crudo del header (minutos).
 * @returns {number|null} Offset en minutos enteros, o null si es inválido.
 */
function parseOffsetCliente(valor) {
    if (valor === undefined || valor === null || valor === '') return null;
    const num = Number(valor);
    if (!Number.isFinite(num)) return null;
    // Rango válido: +/- 14 horas (840 minutos) según especificación de zonas horarias
    if (Math.abs(num) > 840) return null;
    return Math.round(num);
}

/**
 * Offset del servidor en minutos (convención JS, positivo al oeste de UTC).
 * @param {Date} [fecha] - Fecha de referencia (default: ahora).
 * @returns {number}
 */
function offsetServidor(fecha = new Date()) {
    return fecha.getTimezoneOffset();
}

/**
 * Diferencia cliente-servidor en minutos.
 * positiva => el cliente está "más al oeste" (reloj atrasado respecto al server).
 * @param {number} offsetCliente
 * @param {number} [offsetServer]
 * @returns {number}
 */
function diferenciaMinutos(offsetCliente, offsetServer = offsetServidor()) {
    return offsetCliente - offsetServer;
}

/**
 * Etiqueta legible tipo "UTC-05:00" a partir de un offset en minutos (convención JS).
 * @param {number} offsetMinutos
 * @returns {string}
 */
function etiquetaUtc(offsetMinutos) {
    const signo = offsetMinutos <= 0 ? '+' : '-';
    const abs = Math.abs(offsetMinutos);
    const horas = String(Math.floor(abs / 60)).padStart(2, '0');
    const minutos = String(abs % 60).padStart(2, '0');
    return `UTC${signo}${horas}:${minutos}`;
}

/**
 * Convierte una fecha del servidor a la hora local del cliente.
 * @param {Date} fechaServer
 * @param {number} diffMinutos - Diferencia cliente - servidor en minutos.
 * @returns {string} ISO string con la hora equivalente del cliente.
 */
function fechaCliente(fechaServer, diffMinutos) {
    // getTimezoneOffset positivo = atrasado respecto a UTC, por eso se suma el diff invertido
    const ms = fechaServer.getTime() - diffMinutos * 60 * 1000;
    return new Date(ms).toISOString();
}

/**
 * Redondea una fecha a la hora (para agrupar auditoría / tickets por hora cliente).
 * Equivalente SQL: DATETRUNC('hour', DATEADD(hh, @diffHours, fecha)).
 * @param {Date} fecha
 * @returns {Date}
 */
function truncarHora(fecha) {
    const d = new Date(fecha);
    d.setUTCMinutes(0, 0, 0);
    return d;
}

/**
 * Construye el bloque de metadatos de timezone para las respuestas de la API.
 * @param {number|null} offsetCliente - Offset del cliente en minutos (o null si no envió header).
 * @returns {{ serverOffset: number, clientOffset: number, diff: number, serverTime: string, clientTime: string }}
 */
function metadatosTimezone(offsetCliente) {
    const serverOffset = offsetServidor();
    const clientOffset = offsetCliente === null ? serverOffset : offsetCliente;
    const diff = diferenciaMinutos(clientOffset, serverOffset);
    const ahora = new Date();
    return {
        serverOffset,
        clientOffset,
        diff,
        serverTime: ahora.toISOString(),
        clientTime: fechaCliente(ahora, diff)
    };
}

module.exports = {
    parseOffsetCliente,
    offsetServidor,
    diferenciaMinutos,
    etiquetaUtc,
    fechaCliente,
    truncarHora,
    metadatosTimezone
};
