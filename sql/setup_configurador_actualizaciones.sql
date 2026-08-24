-- ============================================================
--  CONFIGURADOR DE ACTUALIZACIONES ERP (solo Administrador)
--  Tabla de historial + módulo/permiso 'config_actualizaciones'
--  Ejecutar una sola vez en la base de datos (Azure SQL).
--  El script es re-ejecutable (usa guardas IF NOT EXISTS).
-- ============================================================

-- 1) Tabla de historial de actualizaciones
IF OBJECT_ID('dbo.Actualizaciones_ERP', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Actualizaciones_ERP (
        id              INT IDENTITY(1,1) PRIMARY KEY,
        drive_id        VARCHAR(100)  NOT NULL,           -- ID del archivo extraído del enlace Drive
        drive_url       VARCHAR(500)  NOT NULL,           -- Enlace original pegado por el administrador
        zip_name        VARCHAR(200)  NOT NULL DEFAULT 'actualizacionSedim.zip',
        sha256          VARCHAR(64)   NULL,               -- Opcional: si es NULL el .bat omite la validación
        nota            VARCHAR(300)  NULL,               -- Versión / descripción del cambio
        activo          BIT           NOT NULL DEFAULT 1, -- Solo un registro activo a la vez
        creado_por      VARCHAR(100)  NOT NULL,
        fecha_creacion  DATETIME2     NOT NULL DEFAULT SYSDATETIME()
    );
END;
GO

-- 2) Nuevo módulo (permiso)
IF NOT EXISTS (SELECT 1 FROM dbo.Modulos WHERE clave = 'config_actualizaciones')
BEGIN
    INSERT INTO dbo.Modulos (clave, nombre) VALUES ('config_actualizaciones', N'Configurador de Actualizaciones');
END;
GO

-- 3) Asignar el permiso SOLO al rol Administrador
--    (LOWER() para no depender del collation: el rol está registrado como 'administrador')
DECLARE @modulo_id INT = (SELECT id FROM dbo.Modulos WHERE clave = 'config_actualizaciones');
DECLARE @rol_admin INT = (SELECT TOP 1 id FROM dbo.Roles WHERE LOWER(nombre) = 'administrador');

IF @modulo_id IS NOT NULL AND @rol_admin IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM dbo.Roles_Permisos WHERE rol_id = @rol_admin AND modulo_id = @modulo_id)
BEGIN
    INSERT INTO dbo.Roles_Permisos (rol_id, modulo_id) VALUES (@rol_admin, @modulo_id);
END;
GO

-- 4) Seed: migrar los valores actuales del .bat como configuración activa inicial
--    (mantiene el comportamiento actual hasta que el admin guarde una nueva)
IF NOT EXISTS (SELECT 1 FROM dbo.Actualizaciones_ERP)
BEGIN
    INSERT INTO dbo.Actualizaciones_ERP
        (drive_id, drive_url, zip_name, sha256, nota, activo, creado_por)
    VALUES
        ('1LFzUE6xf3kwR2QlfwsJ2qOZY0OGxBR_J',
         'https://drive.google.com/file/d/1LFzUE6xf3kwR2QlfwsJ2qOZY0OGxBR_J/view',
         'actualizacionSedim.zip',
         'aaf342cb0cdb1fa5d0e021a2750bd127ece3138d813e54dc53b4e62a79b38cc4',
         'Configuración inicial migrada desde Actualizar_ERP_Nube.bat', 1, 'sistema');
END;
GO

-- Verificación rápida
SELECT * FROM dbo.Modulos WHERE clave = 'config_actualizaciones';
SELECT r.nombre AS rol, m.clave AS permiso FROM dbo.Roles_Permisos rp
    JOIN dbo.Roles r ON r.id = rp.rol_id JOIN dbo.Modulos m ON m.id = rp.modulo_id
    WHERE m.clave = 'config_actualizaciones';
SELECT * FROM dbo.Actualizaciones_ERP ORDER BY fecha_creacion DESC;
