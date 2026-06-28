const SHEETS = {
  analysis: "Analisis",
  config: "Configuracion",
  catalogs: "Catalogos",
};

const ANALYSIS_HEADERS = [
  "Folio", "FechaHora", "Version", "Estado", "Usuario", "FechaAnalisis", "TipoOperacion",
  "NumeroEconomico", "TipoEquipo", "Marca", "Modelo", "Anio", "NumeroSerie", "HorasActuales",
  "Condicion", "Observaciones", "PayloadJSON", "BaseEconomica", "ValorEnLibros",
  "CostosIncrementalesVenta", "PrecioMinimo", "PrecioObjetivo", "PrecioAlto",
  "PrecioPropuesto", "DescuentoImporte", "DescuentoPorcentaje", "PrecioFinal",
  "Utilidad", "UtilidadSobreCosto", "MargenSobreVenta", "ResultadoHistoricoRenta",
  "RecuperacionHistorica", "RecuperacionTotal", "VenderAhora", "MantenerEnRenta",
  "DiferenciaVenderRentar", "MesesRecuperacionVenta", "Semaforo", "Recomendacion",
  "Mercado", "ActualizadoEn", "MetodoDepreciacion", "FechaInicialDepreciacion",
  "VidaUtilAnios", "ValorResidualPorcentaje", "ValorResidual", "MesesTranscurridos",
  "DepreciacionEstimada", "ValorAutomatico", "AjusteManual", "ValorManual",
  "MotivoAjusteManual", "ValorUtilizadoAnalisis", "AutorizadorValorManual",
  "FechaAutorizacionValorManual", "FechaFuturaEvaluacion", "MesesProyectados",
  "ValorFuturoAutomatico", "AjusteManualValorFuturo", "ValorFuturoManual",
  "MotivoValorFuturoManual", "AutorizadorValorFuturo", "FechaAutorizacionValorFuturo",
  "ValorFuturoUtilizado", "ClienteNombre", "ClienteContacto", "ClienteTelefono",
  "ClienteCorreo", "FechaCotizacion", "FechaVigenciaCotizacion", "DescripcionCliente",
  "CondicionesPago", "EntregaEstimada", "GarantiaCliente", "VigenciaTexto",
  "ObservacionesCliente",
];

const CONFIG_HEADERS = [
  "TipoEquipo", "TipoOperacion", "PorcentajeMinimo", "PorcentajeObjetivo", "PorcentajeAlto",
  "PorcentajeGarantiaPredeterminado", "MonedaPredeterminada", "EstadoActivo",
  "VidaUtilAnios", "ValorResidualPorcentaje",
];

const CATALOG_HEADERS = ["Catalogo", "Valor", "EstadoActivo"];

function setup() {
  ensureSheets_();
}

function doGet(e) {
  try {
    validateToken_(e.parameter.token);
    ensureSheets_();
    const action = e.parameter.action || "config";
    if (action === "config") return json_({ ok: true, config: readConfig_(), catalogs: readCatalogs_() });
    if (action === "history") return json_({ ok: true, items: readHistory_() });
    return json_({ ok: false, error: "Accion no permitida." }, 400);
  } catch (error) {
    return json_({ ok: false, error: error.message }, 500);
  }
}

function doPost(e) {
  try {
    validateToken_(e.parameter.token);
    ensureSheets_();
    const action = e.parameter.action || "save";
    if (action !== "save") return json_({ ok: false, error: "Accion no permitida." }, 400);
    const body = JSON.parse(e.postData.contents || "{}");
    const clean = sanitize_(body);
    const result = saveAnalysis_(clean);
    return json_({ ok: true, folio: result.folio, version: result.version });
  } catch (error) {
    return json_({ ok: false, error: error.message }, 500);
  }
}

function validateToken_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty("GAS_EXECUTION_TOKEN");
  if (!expected) throw new Error("GAS_EXECUTION_TOKEN no esta configurado en Script Properties.");
  if (!token || token !== expected) throw new Error("Token invalido.");
}

function ensureSheets_() {
  const ss = SpreadsheetApp.getActive();
  ensureSheet_(ss, SHEETS.analysis, ANALYSIS_HEADERS);
  const config = ensureSheet_(ss, SHEETS.config, CONFIG_HEADERS);
  const catalogs = ensureSheet_(ss, SHEETS.catalogs, CATALOG_HEADERS);
  if (config.getLastRow() === 1) {
    config.getRange(2, 1, 2, CONFIG_HEADERS.length).setValues([
      ["Todos", "new", 12, 18, 25, 2, "MXN", "Activo", "", ""],
      ["Todos", "used", 18, 25, 35, 3, "MXN", "Activo", 10, 30],
    ]);
  }
  if (catalogs.getLastRow() === 1) {
    catalogs.getRange(2, 1, 9, CATALOG_HEADERS.length).setValues([
      ["Tipos de equipo", "Grua titan", "Activo"],
      ["Tipos de equipo", "Plataforma", "Activo"],
      ["Tipos de equipo", "Montacargas", "Activo"],
      ["Marcas", "Terex", "Activo"],
      ["Marcas", "JLG", "Activo"],
      ["Marcas", "Genie", "Activo"],
      ["Condiciones", "Excelente", "Activo"],
      ["Condiciones", "Buena", "Activo"],
      ["Condiciones", "Regular", "Activo"],
    ]);
  }
}

function ensureSheet_(ss, name, headers) {
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return sheet;
  }
  const current = sheet.getRange(1, 1, 1, Math.max(headers.length, sheet.getLastColumn())).getValues()[0].filter(String);
  const missing = headers.filter((header) => current.indexOf(header) === -1);
  if (missing.length) {
    sheet.getRange(1, current.length + 1, 1, missing.length).setValues([missing]);
  }
  sheet.setFrozenRows(1);
  return sheet;
}

function readConfig_() {
  const rows = rowsAsObjects_(SHEETS.config);
  const active = rows.filter((row) => String(row.EstadoActivo || "").toLowerCase() !== "inactivo");
  if (!active.length) {
    return [
      { equipmentType: "Todos", operationType: "new", minimumPct: 12, targetPct: 18, highPct: 25, defaultWarrantyPct: 2, defaultCurrency: "MXN", active: true },
      { equipmentType: "Todos", operationType: "used", minimumPct: 18, targetPct: 25, highPct: 35, defaultWarrantyPct: 3, defaultCurrency: "MXN", usefulLifeYears: 10, residualPercentage: 30, active: true },
    ];
  }
  return active.map((row) => ({
    equipmentType: row.TipoEquipo,
    operationType: row.TipoOperacion,
    minimumPct: Number(row.PorcentajeMinimo) || 0,
    targetPct: Number(row.PorcentajeObjetivo) || 0,
    highPct: Number(row.PorcentajeAlto) || 0,
    defaultWarrantyPct: Number(row.PorcentajeGarantiaPredeterminado) || 0,
    defaultCurrency: row.MonedaPredeterminada || "MXN",
    usefulLifeYears: Number(row.VidaUtilAnios) || 10,
    residualPercentage: Number(row.ValorResidualPorcentaje) || 30,
    active: true,
  }));
}

function readCatalogs_() {
  const rows = rowsAsObjects_(SHEETS.catalogs).filter((row) => String(row.EstadoActivo || "").toLowerCase() !== "inactivo");
  return {
    equipmentTypes: valuesFor_(rows, "Tipos de equipo"),
    brands: valuesFor_(rows, "Marcas"),
    responsibles: valuesFor_(rows, "Usuarios"),
    conditions: valuesFor_(rows, "Condiciones"),
  };
}

function valuesFor_(rows, catalog) {
  return rows.filter((row) => row.Catalogo === catalog).map((row) => row.Valor).filter(Boolean);
}

function readHistory_() {
  const rows = rowsAsObjects_(SHEETS.analysis);
  return rows.reverse().slice(0, 500).map((row) => {
    let payload = {};
    try {
      payload = JSON.parse(row.PayloadJSON || "{}");
    } catch (error) {
      payload = {};
    }
    return {
      folio: row.Folio,
      timestamp: row.FechaHora,
      version: row.Version,
      status: row.Estado,
      responsible: row.Usuario,
      analysisDate: row.FechaAnalisis,
      operationType: row.TipoOperacion,
      economicNumber: row.NumeroEconomico,
      equipmentType: row.TipoEquipo,
      brand: row.Marca,
      model: row.Modelo,
      finalPrice: row.PrecioFinal,
      trafficLight: row.Semaforo,
      recommendation: row.Recomendacion,
      input: payload.input || {},
      calculated: payload.calculated || {},
    };
  });
}

function saveAnalysis_(body) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.analysis);
    const calculated = body.calculated || {};
    const input = body.input || calculated.input || {};
    const folio = generateFolio_(sheet);
    const version = 1;
    const now = new Date();
    const row = [
      folio,
      now,
      version,
      body.status || "complete",
      input.responsible || "",
      input.analysisDate || "",
      input.operationType || "",
      input.economicNumber || "",
      input.equipmentType || "",
      input.brand || "",
      input.model || "",
      input.year || "",
      input.serialNumber || "",
      input.currentHours || "",
      input.condition || "",
      input.notes || "",
      JSON.stringify(body),
      calculated.economicBase || 0,
      calculated.bookValue || 0,
      calculated.incrementalSaleCosts || 0,
      calculated.minimumPrice || 0,
      calculated.targetPrice || 0,
      calculated.highPrice || 0,
      calculated.proposedPrice || 0,
      calculated.discountAmount || 0,
      calculated.discountPercent || 0,
      calculated.finalPrice || 0,
      calculated.expectedProfit || 0,
      calculated.profitOnCostPct || 0,
      calculated.marginOnSalePct || 0,
      calculated.historicalRentalResult || 0,
      calculated.historicalRecoveryPct || 0,
      calculated.totalRecoveryPct || 0,
      calculated.comparison ? calculated.comparison.sellNowValue : 0,
      calculated.comparison ? calculated.comparison.keepRentingValue : 0,
      calculated.comparison ? calculated.comparison.difference : 0,
      calculated.comparison ? calculated.comparison.monthsToRecoverSale : "",
      calculated.trafficLight || "",
      calculated.recommendation || "",
      calculated.marketPosition || "",
      now,
      calculated.depreciationMethod || "",
      calculated.acquisitionDate || input.acquisitionDate || "",
      calculated.usefulLifeYears || "",
      calculated.residualPercentage || "",
      calculated.residualValue || 0,
      calculated.elapsedMonths || 0,
      calculated.estimatedDepreciation || 0,
      calculated.automaticBookValue || 0,
      calculated.manualBookValueEnabled ? "Si" : "No",
      calculated.manualBookValue || 0,
      calculated.manualAdjustmentReason || "",
      calculated.selectedBookValue || calculated.bookValue || 0,
      calculated.manualAuthorizedBy || input.manualAuthorizedBy || "",
      calculated.manualAuthorizationDate || input.manualAuthorizationDate || "",
      calculated.futureEvaluationDate || "",
      calculated.projectedElapsedMonths || 0,
      calculated.automaticFutureSaleValue || 0,
      calculated.futureManualSaleValueEnabled ? "Si" : "No",
      calculated.futureManualSaleValue || 0,
      calculated.futureManualReason || input.futureManualReason || "",
      calculated.futureManualAuthorizedBy || input.futureManualAuthorizedBy || "",
      calculated.futureManualAuthorizationDate || input.futureManualAuthorizationDate || "",
      calculated.selectedFutureSaleValue || 0,
      input.clientName || "",
      input.clientContactName || "",
      input.clientPhone || "",
      input.clientEmail || "",
      input.quoteDate || "",
      input.quoteValidUntil || "",
      input.clientDescription || "",
      input.paymentTerms || "",
      input.deliveryEstimate || "",
      input.clientWarrantyTerms || "",
      input.quoteValidityText || "",
      input.clientCommercialNotes || "",
    ];
    sheet.appendRow(row);
    return { folio: folio, version: version };
  } finally {
    lock.releaseLock();
  }
}

function generateFolio_(sheet) {
  const datePart = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd");
  const prefix = "GL-" + datePart + "-";
  const values = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat()
    : [];
  const count = values.filter((value) => String(value).indexOf(prefix) === 0).length + 1;
  return prefix + String(count).padStart(4, "0");
}

function rowsAsObjects_(sheetName) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).filter((row) => row.some((cell) => cell !== "")).map((row) => {
    const object = {};
    headers.forEach((header, index) => object[header] = row[index]);
    return object;
  });
}

function sanitize_(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(sanitize_);
  if (typeof value === "object") {
    const object = {};
    Object.keys(value).slice(0, 200).forEach((key) => object[String(key).slice(0, 80)] = sanitize_(value[key]));
    return object;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  return String(value).replace(/[<>]/g, "").trim().slice(0, 5000);
}

function json_(payload, status) {
  const output = ContentService.createTextOutput(JSON.stringify(payload));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
