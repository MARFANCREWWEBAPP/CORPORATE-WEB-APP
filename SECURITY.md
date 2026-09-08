# Seguridad del entorno de demostración

Esta versión está destinada exclusivamente a validar experiencia de usuario y diseño.

- No introducir información real de clientes.
- No subir presupuestos reales ni documentos confidenciales.
- Mantener el repositorio privado cuando empiecen las pruebas internas.
- Activar `SITE_ACCESS_USER` y `SITE_ACCESS_PASSWORD` en Railway.
- No reutilizar las contraseñas de la demo en otros servicios.
- La autorización interna mostrada por la demo no sustituye a permisos aplicados en backend.

La versión productiva deberá incorporar autenticación real, sesiones seguras, RBAC en servidor, cifrado, almacenamiento privado, enlaces de descarga firmados, registros de auditoría y copias externas verificadas.
