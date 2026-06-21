# Calculadora de precio de venta y rentabilidad de maquinaria

Aplicacion web operativa para Gruas Laguna. Calcula precios sugeridos, utilidad, descuento maximo, recuperacion historica, comparativo vender vs rentar, semaforo de politica y recomendacion orientativa. Todos los resultados son antes de IVA.

## Arquitectura

- Frontend estatico listo para Netlify: `index.html`, `src/app.js`, `src/styles.css`.
- Logica de calculo compartida: `src/calculations.js`.
- Netlify Function segura: `netlify/functions/api.js`.
- Google Apps Script como API: `google-apps-script/Code.gs`.
- Google Sheets como base de datos con hojas `Analisis`, `Configuracion` y `Catalogos`.

El navegador solo llama a `/.netlify/functions/api`. El token privado viaja desde Netlify hacia Apps Script y nunca se expone en el frontend.

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

El script crea o valida estas hojas:

- `Analisis`: una fila por analisis con folio, datos capturados, payload JSON completo, valores calculados, semaforo y recomendacion.
- `Configuracion`: porcentajes configurables por tipo de equipo y operacion.
- `Catalogos`: tipos de equipo, marcas, responsables, condiciones u otros catalogos.

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

Existe una opcion excepcional `Usar valor manual autorizado`. Si se activa, exige valor manual y motivo; la app conserva el valor automatico, guarda el motivo y usa el valor manual como base economica.

## Desarrollo local

Sin Netlify CLI puede abrirse con un servidor estatico para revisar calculos e interfaz. Guardar e historial mostraran error hasta configurar Netlify Functions con Apps Script.

```bash
npx netlify dev
```

o, para revisar solo la interfaz:

```bash
python -m http.server 8080
```

## Pruebas

Ejecutar:

```bash
node tests/calculator.test.js
node tests/auth.test.js
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
