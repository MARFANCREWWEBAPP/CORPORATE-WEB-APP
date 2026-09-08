# Marquee Flow V4 · Demo interna

Aplicación interna de Marquee para probar la gestión de peticiones de eventos corporativos entre fincas, comerciales y administración.

## Estado de esta entrega

Esta rama contiene una **demo funcional para revisión de diseño, navegación y flujo de trabajo**. Los datos se guardan en `localStorage`, por lo que cada navegador mantiene su propia copia y todavía no existe sincronización multiusuario real.

No deben introducirse datos personales, presupuestos confidenciales ni documentación real hasta conectar PostgreSQL, autenticación backend y almacenamiento privado S3/R2.

## Ejecutar

```bash
npm install
npm start
```

El servidor escucha en `0.0.0.0` y utiliza automáticamente la variable `PORT` proporcionada por Railway.

## Variables recomendadas en Railway

```env
NODE_ENV=production
SITE_ACCESS_USER=marquee-review
SITE_ACCESS_PASSWORD=<CLAVE_LARGA_Y_UNICA>
```

La protección HTTP externa solo se activa cuando están configuradas las dos variables `SITE_ACCESS_USER` y `SITE_ACCESS_PASSWORD`.

## Healthcheck

```text
/health
```

## Empaquetado de la demo

Para evitar límites de subida del conector, `index.html` se almacena comprimido con Brotli y dividido en varias partes dentro de `app-payload/`. `server.js` recompone y descomprime el contenido en memoria al arrancar. La experiencia web es idéntica a la demo HTML original.

## Accesos internos de demostración

La propia pantalla de acceso permite seleccionar rápidamente los perfiles de administrador, comercial y usuario de finca. Todas las identidades son ficticias y están destinadas únicamente a pruebas.

## Próxima fase

- PostgreSQL compartido.
- Autenticación real y sesiones seguras.
- Permisos RBAC aplicados en servidor.
- Almacenamiento S3/Cloudflare R2.
- Copias automáticas y restauración probada.
- Comunicación multiusuario y notificaciones.
