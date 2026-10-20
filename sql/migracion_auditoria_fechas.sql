-- ============================================================
--  MIGRACIÓN BD: AUDITORÍA DE MOVIMIENTOS CON ZONA HORARIA
--  Base: MPRestaurante (SQL Server / Azure)
--  Propósito: registrar timestamps UTC + offsets de cliente/servidor
--  en cada movimiento crítico (precios, claves, transacciones),
--  permitiendo reconstruir la fecha/hora REAL del cliente.
--
--  Uso: ejecutar en SSMS / Azure Data Studio contra MPRestaurante.
--  Es idempotente: puede ejecutarse varias veces sin error.
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABLA DE AUDITORÍA
-- ------------------------------------------------------------
IF OBJECT_ID('dbo.AuditoriaMovimiento', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AuditoriaMovimiento (
        id                  INT IDENTITY(1,1) PRIMARY KEY,
        usuario_id          INT               NOT NULL,
        usuario             NVARCHAR(50)      NOT NULL,
        modulo              NVARCHAR(50)      NOT NULL,   -- 'precios', 'claves', 'usuarios', ...
        accion              NVARCHAR(50)      NOT NULL,   -- 'UPDATE_PRECIO', 'UPDATE_CLAVE', ...
        registro_clave      NVARCHAR(50)      NULL,       -- CodPro / n_numero / id afectado
        empresa             NVARCHAR(2)       NULL,       -- 02 / 04 / 06
        valor_anterior      NVARCHAR(MAX)     NULL,
        valor_nuevo         NVARCHAR(MAX)     NULL,

        -- Fechas timezone-aware (el corazón de la migración)
        fecha_utc           DATETIME2(3)      NOT NULL CONSTRAINT DF_AuditoriaMov_fecha_utc DEFAULT (SYSUTCDATETIME()),
        offset_cliente_min  INT               NULL,       -- X-Timezone-Offset del cliente (convención JS: Perú = 300)
        offset_servidor_min INT               NOT NULL CONSTRAINT DF_AuditoriaMov_offset_srv DEFAULT (DATEDIFF(MINUTE, SYSUTCDATETIME(), SYSDATETIME())),
        diff_min            AS (ISNULL(offset_cliente_min, 0) - (DATEDIFF(MINUTE, SYSUTCDATETIME(), SYSDATETIME()))) PERSISTED,

        -- Fecha local reconstruida del cliente (hora real que vio el usuario)
        fecha_cliente       AS (DATEADD(MINUTE, -ISNULL(offset_cliente_min, 0), fecha_utc)) PERSISTED,

        origen              NVARCHAR(10)      NOT NULL CONSTRAINT DF_AuditoriaMov_origen DEFAULT ('web'), -- 'web' | 'movil'
        ip_cliente          NVARCHAR(45)      NULL
    );
END
GO

-- ------------------------------------------------------------
-- 2. ÍNDICES PARA CONSULTAS FRECUENTES
-- ------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AuditoriaMovimiento_FechaUtc')
    CREATE INDEX IX_AuditoriaMovimiento_FechaUtc ON dbo.AuditoriaMovimiento (fecha_utc DESC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AuditoriaMovimiento_ModuloRegistro')
    CREATE INDEX IX_AuditoriaMovimiento_ModuloRegistro ON dbo.AuditoriaMovimiento (modulo, registro_clave);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AuditoriaMovimiento_Usuario')
    CREATE INDEX IX_AuditoriaMovimiento_Usuario ON dbo.AuditoriaMovimiento (usuario_id, fecha_utc DESC);
GO

-- ------------------------------------------------------------
-- 3. SP DE REGISTRO (llamar desde Node.js tras cada cambio)
--    EXEC dbo.sp_AuditoriaMovimiento_Registrar
--         @usuario_id = 1, @usuario = 'admin', @modulo = 'precios',
--         @accion = 'UPDATE_PRECIO', @registro_clave = '0400010001',
--         @empresa = '04', @valor_anterior = '10.50', @valor_nuevo = '12.00',
--         @offset_cliente_min = 300, @origen = 'movil', @ip_cliente = '190.x.x.x';
-- ------------------------------------------------------------
IF OBJECT_ID('dbo.sp_AuditoriaMovimiento_Registrar', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_AuditoriaMovimiento_Registrar;
GO
CREATE PROCEDURE dbo.sp_AuditoriaMovimiento_Registrar
    @usuario_id          INT,
    @usuario             NVARCHAR(50),
    @modulo              NVARCHAR(50),
    @accion              NVARCHAR(50),
    @registro_clave      NVARCHAR(50) = NULL,
    @empresa             NVARCHAR(2)  = NULL,
    @valor_anterior      NVARCHAR(MAX) = NULL,
    @valor_nuevo         NVARCHAR(MAX) = NULL,
    @offset_cliente_min  INT          = NULL,
    @origen              NVARCHAR(10) = 'web',
    @ip_cliente          NVARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.AuditoriaMovimiento
        (usuario_id, usuario, modulo, accion, registro_clave, empresa,
         valor_anterior, valor_nuevo, offset_cliente_min, origen, ip_cliente)
    VALUES
        (@usuario_id, @usuario, @modulo, @accion, @registro_clave, @empresa,
         @valor_anterior, @valor_nuevo, @offset_cliente_min, @origen, @ip_cliente);
END
GO

-- ------------------------------------------------------------
-- 4. VISTA DE CONSULTA: fechas ya convertidas a hora del cliente
-- ------------------------------------------------------------
IF OBJECT_ID('dbo.vw_AuditoriaMovimiento', 'V') IS NOT NULL
    DROP VIEW dbo.vw_AuditoriaMovimiento;
GO
CREATE VIEW dbo.vw_AuditoriaMovimiento AS
SELECT
    am.id,
    am.usuario_id,
    am.usuario,
    am.modulo,
    am.accion,
    am.registro_clave,
    am.empresa,
    am.valor_anterior,
    am.valor_nuevo,
    am.fecha_utc,
    am.fecha_cliente,                          -- columna calculada (persistida)
    am.offset_cliente_min,
    am.offset_servidor_min,
    am.diff_min,
    am.origen,
    am.ip_cliente
FROM dbo.AuditoriaMovimiento am;
GO

PRINT 'Migración AuditoriaMovimiento completada.';
