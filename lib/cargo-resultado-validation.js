// 0 requests the entire filtered period; 1–12 request a calendar month.
function isCargoDetalleMes(mes) {
    return Number.isInteger(mes) && mes >= 0 && mes <= 12;
}
module.exports = { isCargoDetalleMes };
