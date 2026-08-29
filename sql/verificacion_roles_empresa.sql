/* Ejecutar antes de activar usuarios Operador/Supervisor en producción. */
SET NOCOUNT ON;

SELECT r.nombre AS rol, m.clave AS permiso
FROM dbo.Roles_Permisos rp
JOIN dbo.Roles r ON r.id = rp.rol_id
JOIN dbo.Modulos m ON m.id = rp.modulo_id
WHERE LOWER(LTRIM(RTRIM(r.nombre))) IN ('operador', 'supervisor')
ORDER BY r.nombre, m.clave;

SELECT ue.usuario_id, ue.empresa_id, COUNT(*) AS duplicados
FROM dbo.Usuarios_Empresas ue
GROUP BY ue.usuario_id, ue.empresa_id
HAVING COUNT(*) > 1;

SELECT u.id, u.usuario, u.nombre, r.nombre AS rol
FROM dbo.usuariosweb u
JOIN dbo.Roles r ON r.id = u.rol_id
WHERE LOWER(LTRIM(RTRIM(r.nombre))) IN ('operador', 'supervisor')
  AND NOT EXISTS (
      SELECT 1 FROM dbo.Usuarios_Empresas ue
      JOIN dbo.Empresas_Acceso ea ON ea.id = ue.empresa_id AND ea.activo = 1
      WHERE ue.usuario_id = u.id AND ue.activo = 1
  )
ORDER BY r.nombre, u.usuario;

SELECT ea.id, ea.nombre_visible, ea.codigo_producto, ea.tabla200_numero, ea.nombre_ventas,
       ea.activo, t.c_describe AS tabla200_descripcion,
       CASE WHEN t.n_numero IS NULL THEN N'REVISAR: no existe en Tablas(200)'
            ELSE N'OK' END AS validacion_tabla200
FROM dbo.Empresas_Acceso ea
LEFT JOIN dbo.Tablas t ON t.n_codtabla = 200 AND t.n_numero = ea.tabla200_numero
ORDER BY ea.tabla200_numero;
