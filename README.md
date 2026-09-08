# Restauracion pendiente de la V4 original

Esta rama es un importador protegido; no es la web restaurada y no debe conectarse a Railway.

Falta cargar **MARQUEE_V4_ORIGINAL_RESTAURADA_GITHUB.zip** en la raiz de esta rama.
No descomprimir ni reconstruir el ZIP. Se exige el paquete exacto entregado en la conversacion.

Una vez cargado, GitHub Actions comprueba el SHA-256 del ZIP y del HTML, ejecuta las pruebas y publica un arbol limpio en `main` y `railway-demo`, en una unica operacion atomica sin force-push. Si las ramas han cambiado desde la copia previa o no se conserva la copia, se detiene sin publicar.

## Version aprobada

- HTML: 812095 bytes.
- SHA-256 HTML: `e7b2f81b2a26010b8c96d3450349f5b4caa2b7430e2732be93ca8cf4c1e93472`.
- Objeto Git del HTML: `c2190917dc81afa89e666e6bf697920f1b82a94a`.
- SHA-256 ZIP: `b8d48996fbc562df979d9de7031aeba6434609d404e026f15dcea39b8b35d106`.

## Copias previas

- `backup/pre-v4-original-main-20260908`.
- `backup/pre-v4-original-railway-demo-20260908`.

El importador mantiene el HTML, CSS, JavaScript y los logotipos originales byte a byte. Solo corrige el servidor, los comandos de arranque y las comprobaciones.

## Alcance

Sigue siendo una demo local de navegador. Esto no configura autenticacion multiusuario, PostgreSQL, almacenamiento compartido o copias externas. No introducir datos personales reales.

En Railway el servidor original requiere `SITE_ACCESS_USER` y `SITE_ACCESS_PASSWORD` de al menos 20 caracteres cuando `NODE_ENV=production`. No se modifican ni leen esas credenciales desde este flujo.
