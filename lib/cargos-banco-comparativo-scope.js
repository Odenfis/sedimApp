function clean(value) {
    return String(value || '').trim();
}

function companyKey(value) {
    return clean(value).toLocaleUpperCase('es-PE');
}

function resolveComparativoEmpresa(requestedValue, companies = []) {
    const companiesInScope = companies.map(company => {
        const nombreVentas = clean(company.nombre_ventas);
        const nombreVisible = clean(company.nombre_visible) || nombreVentas;
        return { nombreVentas, nombreVisible };
    }).filter(company => company.nombreVentas);

    const nombresPermitidos = [...new Set(companiesInScope.map(company => company.nombreVentas))];
    const etiquetasEmpresa = Object.fromEntries(companiesInScope.map(company => [companyKey(company.nombreVentas), company.nombreVisible]));
    const requested = clean(requestedValue) || 'all';

    if (requested.toLocaleLowerCase('es-PE') === 'all') {
        return { empresa: 'all', empresaEtiqueta: 'all', nombresPermitidos, etiquetasEmpresa };
    }

    const requestedKey = companyKey(requested);
    const selected = companiesInScope.find(company =>
        companyKey(company.nombreVentas) === requestedKey || companyKey(company.nombreVisible) === requestedKey);
    if (!selected) {
        const error = new Error('No tiene acceso a la empresa solicitada');
        error.status = 403;
        throw error;
    }

    return {
        empresa: selected.nombreVentas,
        empresaEtiqueta: selected.nombreVisible,
        nombresPermitidos,
        etiquetasEmpresa
    };
}

function displayComparativoEmpresa(value, etiquetasEmpresa = {}) {
    return etiquetasEmpresa[companyKey(value)] || clean(value);
}

module.exports = { resolveComparativoEmpresa, displayComparativoEmpresa };
