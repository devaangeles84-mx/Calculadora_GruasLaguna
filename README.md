# Calculadora de precio de venta y rentabilidad de maquinaria

Aplicacion web operativa para Gruas Laguna. Calcula precios sugeridos, utilidad, descuento maximo, recuperacion historica, comparativo vender vs rentar, semaforo de politica y recomendacion orientativa. Todos los resultados son antes de IVA.

## Estado estable actual

La version estable es la arquitectura Netlify + Netlify Functions + Apps Script API. La migracion completa del frontend a Google Apps Script queda pausada para una fase posterior porque Apps Script genero errores de carga al intentar hospedar toda la interfaz.

No se debe copiar `outputs/apps-script-migration` al proyecto principal ni subirlo a Netlify. Esa carpeta queda solo como respaldo del experimento de migracion completa.

## Arquitectura

- Frontend estatico listo para Netlify: `index.html`, `src/app.js`, `src/styles.css`.
- Logica de calculo compartida: `src/calculations.js`.
- Cotizacion imprimible para cliente: `src/quote.js`.
- Netlify Function segura: `netlify/functions/api.js`.
- Google Apps Script como backend/API exclusivamente: `google-apps-script/Code.gs`.
- Google Sheets como base de datos con hojas `Analisis`, `Configuracion` y `Catalogos`.

El navegador solo llama a `/.netlify/functions/api`. El token privado viaja desde Netlify hacia Apps Script y nunca se expone en el frontend.

## Estructura principal

```text
index.html                  Frontend principal
src/app.js                  Interaccion, login, guardado, historial
src/calculations.js         Formulas y validaciones de calculo
src/quote.js                Cotizacion comercial para cliente
src/styles.css              Diseno visual
netlify/functions/api.js    Sesion, seguridad y proxy hacia Apps Script
google-apps-script/Code.gs  API para Google Sheets
tests/                      Pruebas locales
outputs/apps-script-migration/  Respaldo pausado, no usar en esta fase
```

## Variables de entorno en Netlify

Crear estas variables en Site configuration > Environment variables:

```text
GAS_WEBAPP_URL=https://script.google.com/macros/s/AKfycbx_REEMPLAZAR/exec
GAS_EXECUTION_TOKEN=un-token-largo-y-privado
SESSION_SECRET=otro-secreto-largo-minimo-32-caracteres
APP_USERS_JSON=[{"username":"ventas","name":"Ventas Laguna","passwordHash":"scrypt$...$..."}]
```

Use el mismo valor de `GAS_EXECUTION_TOKEN` en Apps Script > Project Settings > Script Properties.

## Usuarios y acceso

La calculadora requiere inicio de sesion antes de consultar configuracion, historial o guardar analisis. La proteccion vive en `netlify/functions/api.js`, por lo que tambien bloquea llamadas directas a `/.netlify/functions/api`.

No use contrasenas en texto plano. Para crear un usuario, genere primero el hash localmente:

```bash
node scripts/create-user-hash.js ventas "Ventas Laguna" "CONTRASENA_TEMPORAL"
```

El comando imprime un objeto como este:

```json
{
  "username": "ventas",
  "name": "Ventas Laguna",
  "passwordHash": "scrypt$SALT_BASE64URL$HASH_BASE64URL"
}
```

Copie uno o varios objetos dentro de `APP_USERS_JSON` en Netlify:

```json
[
  {
    "username": "ventas",
    "name": "Ventas Laguna",
    "passwordHash": "scrypt$SALT_BASE64URL$HASH_BASE64URL"
  },
  {
    "username": "gerencia",
    "name": "Gerencia Comercial",
    "passwordHash": "scrypt$OTRO_SALT$OTRO_HASH"
  }
]
```

`SESSION_SECRET` firma las sesiones. Use un valor largo y privado, distinto de `GAS_EXECUTION_TOKEN`. Las sesiones duran maximo 8 horas y se guardan en cookie `HttpOnly`, `SameSite=Strict` y `Secure` en produccion.

El responsable del analisis siempre se toma de la sesion autenticada. Aunque alguien modifique el formulario o la peticion desde el navegador, la funcion de Netlify sobrescribe el responsable antes de enviar los datos a Apps Script.

## Crear Google Sheets y Apps Script

1. Cree un Google Sheet nuevo.
2. Abra Extensions > Apps Script.
3. Pegue el contenido completo de `google-apps-script/Code.gs`.
4. En Project Settings, agregue la Script Property `GAS_EXECUTION_TOKEN`.
5. Ejecute manualmente `setup` una vez para autorizar y crear encabezados.
6. Deploy > New deployment > Web app.
7. Configure Execute as: Me.
8. Configure Who has access: Anyone with the link.
9. Copie la URL `/exec` en `GAS_WEBAPP_URL` de Netlify.

Si ya existe el archivo de Google Sheets, vuelva a ejecutar `setup`. La migracion es no destructiva: solo agrega encabezados faltantes al final de `Analisis` y `Configuracion`; no borra ni reordena informacion existente.

El script crea o valida estas hojas:

- `Analisis`: una fila por analisis con folio, datos capturados, payload JSON completo, valores calculados, semaforo y recomendacion.
- `Configuracion`: porcentajes configurables por tipo de equipo y operacion.
- `Catalogos`: tipos de equipo, marcas, responsables, condiciones u otros catalogos.

Apps Script expone estas acciones:

```text
GET  ?action=config&token=...   Devuelve configuracion y catalogos
GET  ?action=history&token=...  Devuelve historial reciente
POST ?action=save&token=...     Guarda una cotizacion / analisis
```

Netlify es quien llama esas acciones. El navegador no debe llamar Apps Script directamente.

## Encabezados

`Analisis`:

```text
Folio, FechaHora, Version, Estado, Usuario, FechaAnalisis, TipoOperacion, NumeroEconomico, TipoEquipo, Marca, Modelo, Anio, NumeroSerie, HorasActuales, Condicion, Observaciones, PayloadJSON, BaseEconomica, ValorEnLibros, CostosIncrementalesVenta, PrecioMinimo, PrecioObjetivo, PrecioAlto, PrecioPropuesto, DescuentoImporte, DescuentoPorcentaje, PrecioFinal, Utilidad, UtilidadSobreCosto, MargenSobreVenta, ResultadoHistoricoRenta, RecuperacionHistorica, RecuperacionTotal, VenderAhora, MantenerEnRenta, DiferenciaVenderRentar, MesesRecuperacionVenta, Semaforo, Recomendacion, Mercado, ActualizadoEn
```

`Configuracion`:

```text
TipoEquipo, TipoOperacion, PorcentajeMinimo, PorcentajeObjetivo, PorcentajeAlto, PorcentajeGarantiaPredeterminado, MonedaPredeterminada, EstadoActivo, VidaUtilAnios, ValorResidualPorcentaje
```

`Catalogos`:

```text
Catalogo, Valor, EstadoActivo
```

## Configuracion inicial de margenes

- Fila general `Todos` + `new`: minimo 12%, objetivo 18%, alto 25%.
- Fila general `Todos` + `used`: minimo 18%, objetivo 25%, alto 35%, vida util 10 anos, residual 30%.

Puede agregar filas mas especificas por `TipoEquipo` y `TipoOperacion`; la app busca primero coincidencia exacta y luego la fila `Todos` de la misma operacion.

Los porcentajes representan utilidad sobre costo:

```text
Precio = base economica x (1 + porcentaje)
```

## Valor en libros estimado para seminuevos

Para equipos seminuevos la app calcula una referencia interna conservadora. Es una estimacion interna para analisis comercial; no representa un valor contable o fiscal oficial.

Politica predeterminada:

- Metodo: depreciacion lineal interna.
- Vida util: 10 anos.
- Valor residual minimo: 30% del costo original.
- Fecha inicial: fecha de adquisicion o puesta en operacion.
- Fecha final: fecha del analisis.

Formulas:

```text
Valor residual = costo original x porcentaje residual
Base depreciable = costo original - valor residual
Depreciacion mensual = base depreciable / (vida util en anos x 12)
Meses transcurridos = meses completos entre fecha inicial y fecha de analisis
Depreciacion acumulada = depreciacion mensual x meses transcurridos
Valor en libros estimado = costo original - depreciacion acumulada
```

La depreciacion acumulada nunca supera la base depreciable y el valor estimado nunca baja del valor residual.

Puede configurar `VidaUtilAnios` y `ValorResidualPorcentaje` por `TipoEquipo` + `used`. La app busca primero una coincidencia exacta, despues `Todos` + `used`, y finalmente usa 10 anos / 30% como respaldo interno.

Existe una opcion excepcional `Usar valor manual autorizado`. Si se activa, exige valor manual mayor que cero, motivo, persona autorizadora y fecha de autorizacion; la app conserva el valor automatico, guarda la autorizacion y usa el valor manual como base economica.

## Valor futuro en renta

En la proyeccion de renta futura, el valor estimado de venta al final del periodo se calcula automaticamente con la misma politica de depreciacion del seminuevo. La fecha futura se obtiene sumando el periodo de evaluacion en meses a la fecha del analisis.

Puede activarse `Usar valor futuro manual autorizado`, pero exige valor mayor que cero, motivo, persona autorizadora y fecha. El comparativo `Mantener en renta` usa el valor automatico o el manual autorizado, segun corresponda.

## Impresiones

- `Imprimir análisis interno`: conserva la impresion completa con costos, depreciacion, margenes, rentabilidad, comparativo, recomendacion y semaforo.
- `Cotización para cliente`: abre una vista previa imprimible separada, construida con una lista permitida de campos comerciales. No incluye costos internos, depreciacion, base economica, descuentos, margenes, semaforo, recomendaciones ni observaciones internas.

Para probar localmente ambas impresiones, ejecute `npx netlify dev`, inicie sesion, capture un analisis y use cada boton. En el navegador seleccione `Guardar como PDF` para validar la salida en tamano carta.

## Desarrollo local

Instale dependencias locales:

```bash
npm install
```

Ejecute la app con Netlify Functions:

```bash
npm run dev
```

Si no tiene Netlify CLI instalado, `npm run dev` usara `npx` cuando corresponda. Tambien puede ejecutar directamente:

```bash
npx netlify dev
```

Para revisar solo la interfaz sin login real ni guardado:

```bash
python -m http.server 8080
```

En ese modo estatico, guardar e historial mostraran error porque no esta corriendo `netlify/functions/api.js`.

Variables locales sugeridas en `.env`:

```text
GAS_WEBAPP_URL=https://script.google.com/macros/s/AKfycbx_REEMPLAZAR/exec
GAS_EXECUTION_TOKEN=token-privado-igual-al-de-apps-script
SESSION_SECRET=secreto-largo-para-firmar-sesiones
APP_USERS_JSON=[{"username":"ventas","name":"Ventas Laguna","passwordHash":"scrypt$...$..."}]
```

## Pruebas

Ejecutar:

```bash
npm test
```

Casos cubiertos:

- Equipo nuevo en MXN.
- Equipo nuevo en USD.
- Seminuevo con depreciacion capturada.
- Seminuevo con valor en libros capturado.
- Comision calculada sobre precio.
- Descuento que permanece arriba del minimo.
- Descuento que baja de la politica.
- Ocupacion de renta menor al 100%.
- Comparacion donde conviene vender.
- Comparacion donde conviene rentar.
- Campos vacios y valores cero.
- Error de comunicacion con Apps Script cuando faltan variables.
- Depreciacion interna de seminuevos.
- Valor residual minimo.
- Configuracion especifica y respaldo `Todos` + `used`.
- Ajuste manual autorizado con motivo.
- Rechazo de ajuste manual sin motivo.
- Peticiones sin sesion devuelven 401.
- Credenciales incorrectas son rechazadas.
- Inicio de sesion valido genera cookie.
- Sesion valida permite `config`, `history` y `save`.
- Sesion vencida es rechazada.
- Cerrar sesion elimina la cookie.
- No se puede falsificar el responsable.

## Notas de operacion

- No se realizan busquedas automaticas en internet.
- No se edita silenciosamente un analisis anterior. Al abrir o duplicar desde historial, el formulario se carga como una nueva version y al guardar se genera un folio nuevo.
- El comparativo vender vs rentar usa solo flujos futuros. El historial de renta se muestra aparte.
- La depreciacion no se suma como egreso real.
- La recomendacion es orientativa y no sustituye la evaluacion de liquidez, demanda, riesgo mecanico y disponibilidad de flota.

## GitHub

Antes de subir:

1. Confirme que `.env` no se incluya en Git.
2. Confirme que `outputs/apps-script-migration/` no se incluya; es solo respaldo de migracion pausada.
3. Ejecute `npm test`.
4. Revise `git status`.
5. Suba solo codigo, documentacion y archivos de configuracion seguros.

Comandos tipicos:

```bash
git status
git add .
git commit -m "Estabilizar version Netlify"
git push origin main
```

## Netlify

Configuracion recomendada:

```text
Build command: sin comando / vacio
Publish directory: .
Functions directory: netlify/functions
```

El archivo `netlify.toml` ya define `publish = "."` y `functions = "netlify/functions"`.

Variables obligatorias en Netlify:

```text
GAS_WEBAPP_URL
GAS_EXECUTION_TOKEN
SESSION_SECRET
APP_USERS_JSON
```

Para validar el despliegue:

1. Abra la URL de Netlify.
2. Inicie sesion con un usuario de `APP_USERS_JSON`.
3. Capture un analisis de prueba.
4. Use `Guardar`.
5. Confirme que se genere folio y que aparezca una fila nueva en la hoja `Analisis`.
6. Abra `Historial` y confirme que el registro regrese desde Apps Script.

## Pendiente: migracion completa a Apps Script

La carpeta `outputs/apps-script-migration/` queda como respaldo tecnico, pero no forma parte del flujo estable. Para una fase futura habria que:

- Simplificar el frontend antes de llevarlo a Apps Script.
- Evitar sintaxis moderna que Apps Script inyecta con dificultad.
- Crear pruebas especificas de carga dentro del contenedor de Apps Script.
- Mantener una sola fuente de verdad para `src/calculations.js`.
- Decidir si el acceso sera por cuentas Google o por usuarios administrados.
