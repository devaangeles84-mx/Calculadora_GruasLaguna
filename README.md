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
```

Use el mismo valor de `GAS_EXECUTION_TOKEN` en Apps Script > Project Settings > Script Properties.

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
TipoEquipo, TipoOperacion, PorcentajeMinimo, PorcentajeObjetivo, PorcentajeAlto, PorcentajeGarantiaPredeterminado, MonedaPredeterminada, EstadoActivo
```

`Catalogos`:

```text
Catalogo, Valor, EstadoActivo
```

## Configuracion inicial de margenes

- Equipo nuevo: minimo 12%, objetivo 18%, alto 25%.
- Seminuevo: minimo 18%, objetivo 25%, alto 35%.

Los porcentajes representan utilidad sobre costo:

```text
Precio = base economica x (1 + porcentaje)
```

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

## Notas de operacion

- No se realizan busquedas automaticas en internet.
- No se edita silenciosamente un analisis anterior. Al abrir o duplicar desde historial, el formulario se carga como una nueva version y al guardar se genera un folio nuevo.
- El comparativo vender vs rentar usa solo flujos futuros. El historial de renta se muestra aparte.
- La depreciacion no se suma como egreso real.
- La recomendacion es orientativa y no sustituye la evaluacion de liquidez, demanda, riesgo mecanico y disponibilidad de flota.
