/* Roles estándar y alcance por empresa para sediApp.
   Script idempotente: no modifica tablas operativas ni columnas existentes. */
SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID('dbo.Empresas_Acceso', 'U') IS NULL
    BEGIN
        CREATE TABLE dbo.Empresas_Acceso (
            id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Empresas_Acceso PRIMARY KEY,
            tabla200_numero INT NOT NULL CONSTRAINT UQ_Empresas_Acceso_Tabla200 UNIQUE,
            codigo_producto CHAR(2) NOT NULL CONSTRAINT UQ_Empresas_Acceso_CodigoProducto UNIQUE,
            nombre_ventas NVARCHAR(100) NOT NULL CONSTRAINT UQ_Empresas_Acceso_NombreVentas UNIQUE,
            nombre_visible NVARCHAR(100) NOT NULL,
            activo BIT NOT NULL CONSTRAINT DF_Empresas_Acceso_Activo DEFAULT (1),
            fecha_creacion DATETIME2 NOT NULL CONSTRAINT DF_Empresas_Acceso_Fecha DEFAULT (SYSUTCDATETIME())
        );
    END;

    IF OBJECT_ID('dbo.Usuarios_Empresas', 'U') IS NULL
    BEGIN
        CREATE TABLE dbo.Usuarios_Empresas (
            usuario_id INT NOT NULL,
            empresa_id INT NOT NULL,
            activo BIT NOT NULL CONSTRAINT DF_Usuarios_Empresas_Activo DEFAULT (1),
            asignado_por NVARCHAR(100) NULL,
            fecha_asignacion DATETIME2 NOT NULL CONSTRAINT DF_Usuarios_Empresas_Fecha DEFAULT (SYSUTCDATETIME()),
            CONSTRAINT PK_Usuarios_Empresas PRIMARY KEY (usuario_id, empresa_id),
            CONSTRAINT FK_Usuarios_Empresas_Usuario FOREIGN KEY (usuario_id)
                REFERENCES dbo.usuariosweb(id) ON DELETE CASCADE,
            CONSTRAINT FK_Usuarios_Empresas_Empresa FOREIGN KEY (empresa_id)
                REFERENCES dbo.Empresas_Acceso(id)
        );
        CREATE INDEX IX_Usuarios_Empresas_UsuarioActivo ON dbo.Usuarios_Empresas(usuario_id, activo);
    END;

    MERGE dbo.Empresas_Acceso AS target
    USING (VALUES
        (2, '02', N'Cocineria', N'Cocineria'),
        (4, '04', N'Mar Picante 1', N'Mar Picante'),
        (6, '06', N'Inversiones Abruzzo Sac', N'Abruzzo')
    ) AS source(tabla200_numero, codigo_producto, nombre_ventas, nombre_visible)
    ON target.tabla200_numero = source.tabla200_numero
    WHEN MATCHED THEN UPDATE SET codigo_producto = source.codigo_producto,
        nombre_ventas = source.nombre_ventas, nombre_visible = source.nombre_visible, activo = 1
    WHEN NOT MATCHED THEN INSERT (tabla200_numero, codigo_producto, nombre_ventas, nombre_visible)
        VALUES (source.tabla200_numero, source.codigo_producto, source.nombre_ventas, source.nombre_visible);

    IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE LOWER(LTRIM(RTRIM(nombre))) = 'supervisor')
        INSERT INTO dbo.Roles(nombre) VALUES (N'Supervisor');

    DECLARE @rolOperador INT = (SELECT TOP 1 id FROM dbo.Roles WHERE LOWER(LTRIM(RTRIM(nombre))) = 'operador');
    DECLARE @rolSupervisor INT = (SELECT TOP 1 id FROM dbo.Roles WHERE LOWER(LTRIM(RTRIM(nombre))) = 'supervisor');

    IF @rolOperador IS NULL THROW 50001, 'No existe el rol Operador.', 1;
    IF @rolSupervisor IS NULL THROW 50002, 'No se pudo crear o encontrar el rol Supervisor.', 1;

    DECLARE @modHerramientas INT = (SELECT id FROM dbo.Modulos WHERE clave = 'herramientas');
    DECLARE @modOperaciones INT = (SELECT id FROM dbo.Modulos WHERE clave = 'operaciones');
    DECLARE @modReportes INT = (SELECT id FROM dbo.Modulos WHERE clave = 'reportes');
    IF @modHerramientas IS NULL OR @modOperaciones IS NULL OR @modReportes IS NULL
        THROW 50003, 'Faltan módulos requeridos: herramientas, operaciones o reportes.', 1;

    /* Plantillas fijas. Administrador no se modifica. */
    DELETE FROM dbo.Roles_Permisos WHERE rol_id IN (@rolOperador, @rolSupervisor);
    INSERT INTO dbo.Roles_Permisos(rol_id, modulo_id)
    VALUES (@rolOperador, @modHerramientas), (@rolOperador, @modOperaciones),
           (@rolSupervisor, @modHerramientas), (@rolSupervisor, @modOperaciones), (@rolSupervisor, @modReportes);

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;

SELECT id, tabla200_numero, codigo_producto, nombre_ventas, nombre_visible, activo
FROM dbo.Empresas_Acceso ORDER BY tabla200_numero;

