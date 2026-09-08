# Marquee Flow V4 · Demo interna

Aplicación interna de Marquee para probar la gestión de peticiones de eventos corporativos entre fincas, comerciales y administración.

## Rama preparada para Railway

La rama estable de despliegue es:

```text
railway-demo
```

Esta rama evita mezclar la demo publicada con cambios de desarrollo y está preparada para arrancar mediante `npm start`.

## Estado de esta entrega

Esta rama contiene una **demo funcional para revisión de diseño, navegación y flujo de trabajo**. Los datos se guardan en `localStorage`, por lo que cada navegador mantiene su propia copia y todavía no existe sincronización multiusuario real.

No deben introducirse datos personales, presupuestos confidenciales ni documentación real hasta conectar PostgreSQL, autenticación backend y almacenamiento privado S3/R2.

## Ejecutar en local

```bash
npm install
npm start
```

El servidor escucha en `0.0.0.0` y utiliza automáticamente la variable `PORT` proporcionada por Railway.

## Desplegar en Railway

1. Crear un proyecto nuevo con **Deploy from GitHub repo**.
2. Elegir `MARFANCREWWEBAPP/CORPORATE-WEB-APP`.
3. Seleccionar la rama `railway-demo` como fuente del servicio.
4. Añadir las variables de entorno indicadas abajo.
5. Configurar `/health` como healthcheck.
6. Generar un dominio desde **Settings → Networking**.

Railway detectará el script `npm start` definido en `package.json`. Los nuevos commits a `railway-demo` podrán activar despliegues automáticos cuando el repositorio quede conectado.

## Variables recomendadas en Railway

```env
NODE_ENV=production
SITE_ACCESS_USER=marquee-review
SITE_ACCESS_PASSWORD=<CLAVE_LARGA_Y_UNICA>
```

La protección HTTP externa solo se activa cuando están configuradas las dos variables `SITE_ACCESS_USER` y `SITE_ACCESS_PASSWORD`. No guardes la contraseña real en GitHub.

## Healthcheck

```text
/health
```

## Accesos internos de demostración

La pantalla de acceso permite seleccionar rápidamente los perfiles de administrador, comercial y usuario de finca. Todas las identidades son ficticias y están destinadas únicamente a pruebas.

## Funciones incluidas en la demo

- Dashboard operativo por perfil.
- Bandeja **Pendiente de mí**.
- Calendario y listado de eventos.
- Buscador y filtros.
- Comunicación vinculada a cada expediente.
- Presupuestos y documentos con subida y descarga local.
- Tareas, histórico, estados y responsable de la siguiente acción.
- Fincas y separación visual de permisos.
- Exportación, restauración y reinicio de datos de prueba.
- Adaptación responsive para móvil.

## Próxima fase productiva

- PostgreSQL compartido.
- Autenticación real y sesiones seguras.
- Permisos RBAC aplicados en servidor.
- Almacenamiento S3/Cloudflare R2.
- Copias automáticas y restauración probada.
- Comunicación multiusuario y notificaciones.
