/*
  EJECUCION MANUAL EN DBEAVER - CtaBanco 2026

  IMPORTANTE: Ejecutar cada sentencia por separado, seleccionandola completa.
  No ejecutar todo el archivo como script. No es una migracion automatica.
  Las fases 1B, 1C y 1D deben ejecutarse en la MISMA conexion de DBeaver.

  La tabla MPRestaurante.dbo.temp_ctaBanco26 debe existir y estar vacia.
  El proceso no borra sus registros ni modifica CtaBanco o DetCom.
  Si la tabla no esta vacia, la insercion no agrega ninguna fila.

  La copia creada previamente con SELECT INTO conserva Numero como IDENTITY.
  Para preservar los numeros originales se activa IDENTITY_INSERT solo durante
  la carga. Si falla la insercion, ejecutar inmediatamente la fase 1D en la
  misma conexion antes de corregir el error. No cerrar la conexion entre fases.

  Comparacion: documento y proveedor iguales, y Monto = Subtotal + 18% de IGV,
  redondeando ambos importes a dos decimales. Subtotal NO se multiplica por
  Cantidad. Se ignoran Codpro vacios de DetCom.
*/

/* FASE 1A: comprobar que la tabla existe y esta vacia.
   Si el resultado es distinto de 0, detenerse y revisar; no ejecutar 1B-1D. */
SELECT COUNT_BIG(*) AS FilasExistentes
FROM MPRestaurante.dbo.temp_ctaBanco26;

/* FASE 1B: habilitar la copia de Numero. Ejecutar en la misma conexion que 1C. */
SET IDENTITY_INSERT MPRestaurante.dbo.temp_ctaBanco26 ON;

/* FASE 1C: insertar solo si la tabla esta vacia.
   No ejecutar simultaneamente este proceso desde varias conexiones. */
INSERT INTO MPRestaurante.dbo.temp_ctaBanco26
    (Numero, Tipo, Clase, Cuenta, Documento, Monto, Fecha,
     Pendiente, Detalle, CodProv, Codpro)
SELECT
    c.Numero, c.Tipo, c.Clase, c.Cuenta, c.Documento, c.Monto, c.Fecha,
    c.Pendiente, c.Detalle, c.CodProv, c.Codpro
FROM MPRestaurante.dbo.CtaBanco AS c
WHERE c.Fecha >= '20260101'
  AND c.Fecha < '20270101'
  AND c.Tipo = 1
  AND c.Clase = 1
  AND (c.Codpro IS NULL OR LTRIM(RTRIM(c.Codpro)) = '')
  AND NOT EXISTS (SELECT 1 FROM MPRestaurante.dbo.temp_ctaBanco26);

/* FASE 1D: desactivar IDENTITY_INSERT incluso si falla la fase 1C. */
SET IDENTITY_INSERT MPRestaurante.dbo.temp_ctaBanco26 OFF;

/* FASE 2A: comparar cantidades. El origen puede cambiar con el tiempo. */
SELECT
    (SELECT COUNT_BIG(*)
     FROM MPRestaurante.dbo.CtaBanco
     WHERE Fecha >= '20260101' AND Fecha < '20270101'
       AND Tipo = 1 AND Clase = 1
       AND (Codpro IS NULL OR LTRIM(RTRIM(Codpro)) = '')) AS FilasOrigenActual,
    (SELECT COUNT_BIG(*) FROM MPRestaurante.dbo.temp_ctaBanco26) AS FilasCopia;

/* FASE 2B: diferencias entre numeros. Debe devolver cero filas inmediatamente
   despues de la carga, siempre que el origen no haya cambiado. */
SELECT 'En origen y no en copia' AS Diferencia, x.Numero
FROM (
    SELECT Numero FROM MPRestaurante.dbo.CtaBanco
    WHERE Fecha >= '20260101' AND Fecha < '20270101'
      AND Tipo = 1 AND Clase = 1
      AND (Codpro IS NULL OR LTRIM(RTRIM(Codpro)) = '')
    EXCEPT
    SELECT Numero FROM MPRestaurante.dbo.temp_ctaBanco26
) AS x
UNION ALL
SELECT 'En copia y no en origen', x.Numero
FROM (
    SELECT Numero FROM MPRestaurante.dbo.temp_ctaBanco26
    EXCEPT
    SELECT Numero FROM MPRestaurante.dbo.CtaBanco
    WHERE Fecha >= '20260101' AND Fecha < '20270101'
      AND Tipo = 1 AND Clase = 1
      AND (Codpro IS NULL OR LTRIM(RTRIM(Codpro)) = '')
) AS x;

/* FASE 2C: Numero identifica cada registro. Si hay resultados, detenerse. */
SELECT Numero, COUNT_BIG(*) AS Repeticiones
FROM MPRestaurante.dbo.temp_ctaBanco26
GROUP BY Numero
HAVING COUNT_BIG(*) > 1;

/* FASE 3A: vista previa. No modifica datos. TotalRegistrosPropuestos se repite
   en cada fila; si no hay resultados, el total de propuestas es cero.
   FilasCoincidentes > 1 es aceptable si todas tienen el mismo Codpro valido. */
SELECT
    c.Numero, c.Documento, c.CodProv, c.Monto, c.Codpro AS CodproActual,
    MIN(LTRIM(RTRIM(d.Codpro))) AS CodproPropuesto,
    COUNT_BIG(*) AS FilasCoincidentes,
    COUNT_BIG(*) OVER () AS TotalRegistrosPropuestos
FROM MPRestaurante.dbo.temp_ctaBanco26 AS c
JOIN MPRestaurante.dbo.DetCom AS d
  ON c.Documento = d.Numero
 AND c.CodProv = d.Codprov
 AND ROUND(CAST(c.Monto AS decimal(19,4)), 2) =
     ROUND(CAST(d.Subtotal AS decimal(19,4)) * CAST(1.18 AS decimal(3,2)), 2)
WHERE (c.Codpro IS NULL OR LTRIM(RTRIM(c.Codpro)) = '')
  AND NULLIF(LTRIM(RTRIM(c.CodProv)), '') IS NOT NULL
  AND NULLIF(LTRIM(RTRIM(d.Codpro)), '') IS NOT NULL
GROUP BY c.Numero, c.Documento, c.CodProv, c.Monto, c.Codpro
HAVING COUNT(DISTINCT LTRIM(RTRIM(d.Codpro))) = 1
ORDER BY c.Numero;

/* FASE 3B: coincidencias ambiguas. Cada fila muestra un codigo distinto para
   el registro indicado; estos registros no se actualizaran automaticamente. */
SELECT c.Numero, c.Documento, c.CodProv, c.Monto,
       LTRIM(RTRIM(d.Codpro)) AS CodproEncontrado,
       COUNT_BIG(*) AS FilasCoincidentesConCodigo
FROM MPRestaurante.dbo.temp_ctaBanco26 AS c
JOIN MPRestaurante.dbo.DetCom AS d
  ON c.Documento = d.Numero
 AND c.CodProv = d.Codprov
 AND ROUND(CAST(c.Monto AS decimal(19,4)), 2) =
     ROUND(CAST(d.Subtotal AS decimal(19,4)) * CAST(1.18 AS decimal(3,2)), 2)
WHERE (c.Codpro IS NULL OR LTRIM(RTRIM(c.Codpro)) = '')
  AND NULLIF(LTRIM(RTRIM(c.CodProv)), '') IS NOT NULL
  AND NULLIF(LTRIM(RTRIM(d.Codpro)), '') IS NOT NULL
  AND EXISTS (
      SELECT 1
      FROM MPRestaurante.dbo.DetCom AS otro
      WHERE otro.Numero = c.Documento
        AND otro.Codprov = c.CodProv
        AND ROUND(CAST(c.Monto AS decimal(19,4)), 2) =
            ROUND(CAST(otro.Subtotal AS decimal(19,4)) * CAST(1.18 AS decimal(3,2)), 2)
        AND NULLIF(LTRIM(RTRIM(otro.Codpro)), '') IS NOT NULL
        AND LTRIM(RTRIM(otro.Codpro)) <> LTRIM(RTRIM(d.Codpro))
  )
GROUP BY c.Numero, c.Documento, c.CodProv, c.Monto, LTRIM(RTRIM(d.Codpro))
ORDER BY c.Numero, CodproEncontrado;

/* FASE 4: ACTUALIZACION REAL. Ejecutar solo despues de revisar 2C, 3A y 3B.
   La sentencia guarda los cambios en la copia segun el modo de transaccion
   de DBeaver. En modo Auto los guarda al ejecutarse; con commit manual debe
   confirmar o revertir desde DBeaver. OUTPUT muestra cada cambio realizado.
   Las coincidencias se recalculan: si los datos cambiaron desde 3A, el resultado
   puede variar. Ejecutar toda esta sentencia seleccionada como una unidad. */
UPDATE c
SET c.Codpro = candidatos.CodproPropuesto
OUTPUT inserted.Numero, inserted.Documento,
       deleted.Codpro AS CodproAnterior, inserted.Codpro AS CodproNuevo
FROM MPRestaurante.dbo.temp_ctaBanco26 AS c
JOIN (
    SELECT copia.Numero, MIN(LTRIM(RTRIM(d.Codpro))) AS CodproPropuesto
    FROM MPRestaurante.dbo.temp_ctaBanco26 AS copia
    JOIN MPRestaurante.dbo.DetCom AS d
      ON copia.Documento = d.Numero
     AND copia.CodProv = d.Codprov
     AND ROUND(CAST(copia.Monto AS decimal(19,4)), 2) =
         ROUND(CAST(d.Subtotal AS decimal(19,4)) * CAST(1.18 AS decimal(3,2)), 2)
    WHERE (copia.Codpro IS NULL OR LTRIM(RTRIM(copia.Codpro)) = '')
      AND NULLIF(LTRIM(RTRIM(copia.CodProv)), '') IS NOT NULL
      AND NULLIF(LTRIM(RTRIM(d.Codpro)), '') IS NOT NULL
    GROUP BY copia.Numero
    HAVING COUNT(DISTINCT LTRIM(RTRIM(d.Codpro))) = 1
) AS candidatos ON candidatos.Numero = c.Numero
WHERE (c.Codpro IS NULL OR LTRIM(RTRIM(c.Codpro)) = '')
  AND NOT EXISTS (
      SELECT 1 FROM MPRestaurante.dbo.temp_ctaBanco26 AS duplicado
      WHERE duplicado.Numero = c.Numero
      GROUP BY duplicado.Numero HAVING COUNT_BIG(*) > 1
  );

/* FASE 5: verificar el estado de la copia despues de actualizar. */
SELECT COUNT_BIG(*) AS TotalRegistros,
       COUNT_BIG(CASE WHEN NULLIF(LTRIM(RTRIM(Codpro)), '') IS NOT NULL THEN 1 END) AS ConCodpro,
       COUNT_BIG(CASE WHEN NULLIF(LTRIM(RTRIM(Codpro)), '') IS NULL THEN 1 END) AS Pendientes
FROM MPRestaurante.dbo.temp_ctaBanco26;
