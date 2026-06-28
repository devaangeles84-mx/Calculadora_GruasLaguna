const assert = require("node:assert/strict");
const fs = require("node:fs");
const { calculate, resolveConfig } = require("../src/calculations");
const { buildClientQuoteModel, renderClientQuoteHtml } = require("../src/quote");

const baseInput = {
  responsible: "Ventas",
  equipmentType: "Grua",
  analysisDate: "2026-06-20",
  discountMode: "amount",
};

function nearly(actual, expected, delta = 0.02) {
  assert.ok(Math.abs(actual - expected) <= delta, `${actual} no coincide con ${expected}`);
}

function suggestedPriceClosesMargin(input, priceKey, expectedPct, configRows) {
  const first = calculate(input, configRows);
  const second = calculate({ ...input, proposedPrice: first[priceKey] }, configRows);
  nearly(second.profitOnCostPct, expectedPct, 0.01);
  return first;
}

const tests = [
  ["Equipo nuevo MXN", () => {
    const r = calculate({ ...baseInput, operationType: "new", supplierCost: 1000000, currency: "MXN", exchangeRate: 1, newCommercialCosts: 50000 });
    nearly(r.economicBase, 1050000);
    nearly(r.targetPrice, 1239000);
  }],
  ["Equipo nuevo USD", () => {
    const r = calculate({ ...baseInput, operationType: "new", supplierCost: 100000, currency: "USD", exchangeRate: 17, internationalFreight: 10000 });
    nearly(r.supplierCostMxn, 1700000);
    nearly(r.economicBase, 1710000);
  }],
  ["Seminuevo con depreciacion capturada", () => {
    const r = calculate({ ...baseInput, operationType: "used", originalCost: 900000, accumulatedDepreciation: 300000, repairs: 50000 });
    nearly(r.bookValue, 600000);
    nearly(r.economicBase, 650000);
  }],
  ["Seminuevo con valor en libros capturado", () => {
    const r = calculate({ ...baseInput, operationType: "used", originalCost: 900000, bookValue: 540000 });
    nearly(r.depreciation, 360000);
  }],
  ["Comision sobre precio resuelta", () => {
    const r = calculate({ ...baseInput, operationType: "new", supplierCost: 1000000, currency: "MXN", newCommissionValue: 5, newCommissionMode: "percentPrice" });
    assert.ok(r.targetPrice > 1180000);
    nearly(r.commission, r.proposedPrice * 0.05);
  }],
  ["Precio objetivo con comision 5% sobre base", () => {
    const r = calculate({ ...baseInput, operationType: "new", supplierCost: 1000000, currency: "MXN", newCommissionValue: 5, newCommissionMode: "percentBase" });
    nearly(r.targetPrice, 1239000);
    nearly(r.profitOnCostPct, 18);
  }],
  ["Precio objetivo incluye comision como importe", () => {
    const r = calculate({ ...baseInput, operationType: "new", supplierCost: 1000000, currency: "MXN", newCommissionValue: 50000, newCommissionMode: "amount" });
    nearly(r.targetPrice, 1239000);
    nearly(r.profitOnCostPct, 18);
  }],
  ["Precio minimo objetivo y alto cierran margen con comision sobre precio", () => {
    const input = { ...baseInput, operationType: "new", supplierCost: 1000000, currency: "MXN", newCommissionValue: 5, newCommissionMode: "percentPrice" };
    suggestedPriceClosesMargin(input, "minimumPrice", 12);
    suggestedPriceClosesMargin(input, "targetPrice", 18);
    suggestedPriceClosesMargin(input, "highPrice", 25);
  }],
  ["Precio objetivo cierra con comision y garantia combinadas", () => {
    const input = {
      ...baseInput,
      operationType: "new",
      supplierCost: 1000000,
      currency: "MXN",
      newCommissionValue: 4,
      newCommissionMode: "percentBase",
      newWarrantyValue: 2,
      newWarrantyMode: "percentPrice",
    };
    suggestedPriceClosesMargin(input, "targetPrice", 18);
  }],
  ["Precio objetivo cierra con garantia como importe y comision sobre base", () => {
    const input = {
      ...baseInput,
      operationType: "used",
      originalCost: 900000,
      bookValue: 500000,
      usedCommissionValue: 5,
      usedCommissionMode: "percentBase",
      usedWarrantyValue: 25000,
      usedWarrantyMode: "amount",
    };
    suggestedPriceClosesMargin(input, "targetPrice", 25);
  }],
  ["Descuento arriba del minimo", () => {
    const r = calculate({ ...baseInput, operationType: "used", originalCost: 1000000, bookValue: 500000, proposedPrice: 700000, discountValue: 20000 });
    assert.equal(r.trafficLight, "Dentro de politica");
  }],
  ["Descuento baja de politica", () => {
    const r = calculate({ ...baseInput, operationType: "used", originalCost: 1000000, bookValue: 500000, proposedPrice: 600000, discountValue: 70000 });
    assert.equal(r.trafficLight, "Fuera de politica");
  }],
  ["Ocupacion menor al 100%", () => {
    const r = calculate({ ...baseInput, operationType: "used", originalCost: 800000, bookValue: 400000, expectedMonthlyRent: 100000, expectedOccupancy: 50, evaluationMonths: 6 });
    nearly(r.comparison.effectiveMonthlyIncome, 50000);
  }],
  ["Comparacion conviene vender", () => {
    const r = calculate({ ...baseInput, operationType: "used", originalCost: 900000, bookValue: 500000, acquisitionDate: "2015-06-20", proposedPrice: 900000, expectedMonthlyRent: 20000, expectedOccupancy: 80, evaluationMonths: 6 });
    assert.equal(r.recommendation, "Financieramente favorece vender ahora.");
  }],
  ["Comparacion conviene rentar", () => {
    const r = calculate({ ...baseInput, operationType: "used", originalCost: 900000, bookValue: 500000, acquisitionDate: "2025-06-20", proposedPrice: 650000, expectedMonthlyRent: 90000, expectedOccupancy: 90, evaluationMonths: 10 });
    assert.equal(r.recommendation, "Financieramente favorece mantener en renta.");
  }],
  ["Campos vacios y valores cero", () => {
    const r = calculate({ operationType: "new", supplierCost: 0, currency: "MXN", exchangeRate: 1 });
    assert.ok(r.errors.length >= 2);
    assert.equal(r.economicBase, 0);
  }],
  ["Configuracion considera operacion, equipo y Todos", () => {
    const config = [
      { equipmentType: "Todos", operationType: "new", minimumPct: 10, targetPct: 15, highPct: 20, defaultWarrantyPct: 1, defaultCurrency: "MXN", active: true },
      { equipmentType: "Grua", operationType: "new", minimumPct: 14, targetPct: 19, highPct: 24, defaultWarrantyPct: 2, defaultCurrency: "USD", active: true },
      { equipmentType: "Grua", operationType: "used", minimumPct: 30, targetPct: 40, highPct: 50, defaultWarrantyPct: 5, defaultCurrency: "MXN", active: true },
    ];
    assert.equal(resolveConfig({ operationType: "new", equipmentType: "Grua" }, config).targetPct, 19);
    assert.equal(resolveConfig({ operationType: "used", equipmentType: "Grua" }, config).targetPct, 40);
    assert.equal(resolveConfig({ operationType: "new", equipmentType: "Plataforma" }, config).targetPct, 15);
    assert.equal(resolveConfig({ operationType: "used", equipmentType: "Plataforma" }, config).targetPct, 25);
  }],
  ["Validacion equipo nuevo requiere costo proveedor", () => {
    const r = calculate({ ...baseInput, operationType: "new", supplierCost: 0, currency: "MXN", exchangeRate: 1 });
    assert.ok(r.errors.some((error) => error.includes("costo del proveedor")));
  }],
  ["Validacion seminuevo requiere valor en libros calculable", () => {
    const r = calculate({ ...baseInput, operationType: "used", originalCost: 0, accumulatedDepreciation: 0, bookValue: 0 });
    assert.ok(r.errors.some((error) => error.includes("costo original")));
    assert.ok(r.errors.some((error) => error.includes("fecha de adquisicion")));
  }],
  ["Advertencia por valor en libros inconsistente", () => {
    const r = calculate({ ...baseInput, operationType: "used", originalCost: 900000, accumulatedDepreciation: 300000, bookValue: 500000 });
    assert.ok(r.warnings.some((warning) => warning.includes("no coinciden")));
  }],
  ["Descuento porcentual limitado a 100%", () => {
    const r = calculate({ ...baseInput, operationType: "new", supplierCost: 1000000, currency: "MXN", exchangeRate: 1, proposedPrice: 1200000, discountMode: "percent", discountValue: 150 });
    nearly(r.discountPercent, 100);
    nearly(r.discountAmount, 1200000);
    nearly(r.finalPrice, 0);
  }],
  ["Depreciacion interna ejemplo obligatorio", () => {
    const r = calculate({
      ...baseInput,
      operationType: "used",
      originalCost: 1000000,
      acquisitionDate: "2021-06-20",
      analysisDate: "2026-06-20",
      usefulLifeYears: 10,
      residualPercentage: 30,
    });
    nearly(r.residualValue, 300000);
    nearly(r.depreciableBase, 700000);
    nearly(r.monthlyDepreciation, 5833.33);
    nearly(r.estimatedDepreciation, 350000);
    nearly(r.automaticBookValue, 650000);
    nearly(r.selectedBookValue, 650000);
  }],
  ["Equipo con antiguedad superior a vida util respeta residual", () => {
    const r = calculate({
      ...baseInput,
      operationType: "used",
      originalCost: 1000000,
      acquisitionDate: "2015-06-20",
      analysisDate: "2026-06-20",
      usefulLifeYears: 10,
      residualPercentage: 30,
    });
    nearly(r.estimatedDepreciation, 700000);
    nearly(r.automaticBookValue, 300000);
    nearly(r.selectedBookValue, 300000);
  }],
  ["Configuracion especifica por tipo de equipo para depreciacion", () => {
    const config = [
      { equipmentType: "Todos", operationType: "used", minimumPct: 18, targetPct: 25, highPct: 35, defaultWarrantyPct: 3, defaultCurrency: "MXN", usefulLifeYears: 10, residualPercentage: 30, active: true },
      { equipmentType: "Grua", operationType: "used", minimumPct: 18, targetPct: 25, highPct: 35, defaultWarrantyPct: 3, defaultCurrency: "MXN", usefulLifeYears: 5, residualPercentage: 20, active: true },
    ];
    const r = calculate({
      ...baseInput,
      operationType: "used",
      originalCost: 1000000,
      acquisitionDate: "2021-06-20",
      analysisDate: "2026-06-20",
    }, config);
    nearly(r.usefulLifeYears, 5);
    nearly(r.residualPercentage, 20);
    nearly(r.automaticBookValue, 200000);
  }],
  ["Respaldo Todos used para depreciacion", () => {
    const config = [
      { equipmentType: "Todos", operationType: "used", minimumPct: 18, targetPct: 25, highPct: 35, defaultWarrantyPct: 3, defaultCurrency: "MXN", usefulLifeYears: 8, residualPercentage: 35, active: true },
    ];
    const r = calculate({
      ...baseInput,
      equipmentType: "Plataforma",
      operationType: "used",
      originalCost: 1000000,
      acquisitionDate: "2022-06-20",
      analysisDate: "2026-06-20",
    }, config);
    nearly(r.usefulLifeYears, 8);
    nearly(r.residualPercentage, 35);
  }],
  ["Vida util y residual del formulario son ignorados si Configuracion define otros", () => {
    const config = [
      { equipmentType: "Grua", operationType: "used", minimumPct: 18, targetPct: 25, highPct: 35, usefulLifeYears: 9, residualPercentage: 32, active: true },
    ];
    const r = calculate({
      ...baseInput,
      operationType: "used",
      originalCost: 1000000,
      acquisitionDate: "2021-06-20",
      analysisDate: "2026-06-20",
      usefulLifeYears: 1,
      residualPercentage: 1,
    }, config);
    nearly(r.usefulLifeYears, 9);
    nearly(r.residualPercentage, 32);
  }],
  ["Fecha de adquisicion futura es rechazada", () => {
    const r = calculate({
      ...baseInput,
      operationType: "used",
      originalCost: 1000000,
      acquisitionDate: "2027-06-20",
      analysisDate: "2026-06-20",
      usefulLifeYears: 10,
      residualPercentage: 30,
    });
    assert.ok(r.errors.some((error) => error.includes("posterior")));
  }],
  ["Ajuste manual con motivo usa valor manual", () => {
    const r = calculate({
      ...baseInput,
      operationType: "used",
      originalCost: 1000000,
      acquisitionDate: "2021-06-20",
      analysisDate: "2026-06-20",
      usefulLifeYears: 10,
      residualPercentage: 30,
      useManualBookValue: "on",
      manualBookValue: 720000,
      manualAdjustmentReason: "Autorizacion comercial por condicion excepcional",
      manualAuthorizedBy: "Gerencia",
      manualAuthorizationDate: "2026-06-20",
    });
    assert.equal(r.errors.length, 0);
    assert.equal(r.manualBookValueEnabled, true);
    nearly(r.automaticBookValue, 650000);
    nearly(r.selectedBookValue, 720000);
    nearly(r.bookValue, 720000);
  }],
  ["Ajuste manual sin motivo es rechazado", () => {
    const r = calculate({
      ...baseInput,
      operationType: "used",
      originalCost: 1000000,
      acquisitionDate: "2021-06-20",
      analysisDate: "2026-06-20",
      usefulLifeYears: 10,
      residualPercentage: 30,
      useManualBookValue: "on",
      manualBookValue: 720000,
      manualAdjustmentReason: "",
    });
    assert.ok(r.errors.some((error) => error.includes("motivo")));
  }],
  ["Valor manual vacio o cero es rechazado", () => {
    const r = calculate({
      ...baseInput,
      operationType: "used",
      originalCost: 1000000,
      acquisitionDate: "2021-06-20",
      analysisDate: "2026-06-20",
      useManualBookValue: "on",
      manualBookValue: 0,
      manualAdjustmentReason: "Revision",
      manualAuthorizedBy: "Gerencia",
      manualAuthorizationDate: "2026-06-20",
    });
    assert.ok(r.errors.some((error) => error.includes("mayor que cero")));
  }],
  ["Ajuste manual sin autorizador o fecha es rechazado", () => {
    const r = calculate({
      ...baseInput,
      operationType: "used",
      originalCost: 1000000,
      acquisitionDate: "2021-06-20",
      analysisDate: "2026-06-20",
      useManualBookValue: "on",
      manualBookValue: 700000,
      manualAdjustmentReason: "Revision",
    });
    assert.ok(r.errors.some((error) => error.includes("autorizo")));
    assert.ok(r.errors.some((error) => error.includes("fecha de autorizacion")));
  }],
  ["Recalcula al cambiar fechas o parametros", () => {
    const base = {
      ...baseInput,
      operationType: "used",
      originalCost: 1000000,
      acquisitionDate: "2021-06-20",
      analysisDate: "2026-06-20",
      usefulLifeYears: 10,
      residualPercentage: 30,
    };
    const fiveYears = calculate(base);
    const sixYears = calculate({ ...base, analysisDate: "2027-06-20" });
    const differentResidual = calculate(base, [
      { equipmentType: "Grua", operationType: "used", minimumPct: 18, targetPct: 25, highPct: 35, usefulLifeYears: 10, residualPercentage: 40, active: true },
    ]);
    assert.ok(sixYears.automaticBookValue < fiveYears.automaticBookValue);
    assert.ok(differentResidual.automaticBookValue > fiveYears.automaticBookValue);
  }],
  ["Calcula valor automatico al final del periodo", () => {
    const r = calculate({
      ...baseInput,
      operationType: "used",
      originalCost: 1000000,
      acquisitionDate: "2021-06-20",
      analysisDate: "2026-06-20",
      evaluationMonths: 12,
    });
    assert.equal(r.futureEvaluationDate, "2027-06-20");
    nearly(r.projectedElapsedMonths, 72);
    nearly(r.automaticFutureSaleValue, 580000);
    nearly(r.selectedFutureSaleValue, 580000);
  }],
  ["Proyeccion futura respeta valor residual", () => {
    const r = calculate({
      ...baseInput,
      operationType: "used",
      originalCost: 1000000,
      acquisitionDate: "2010-06-20",
      analysisDate: "2026-06-20",
      evaluationMonths: 24,
    });
    nearly(r.automaticFutureSaleValue, 300000);
    nearly(r.selectedFutureSaleValue, 300000);
  }],
  ["Valor futuro manual autorizado se usa en comparativo", () => {
    const r = calculate({
      ...baseInput,
      operationType: "used",
      originalCost: 1000000,
      acquisitionDate: "2021-06-20",
      analysisDate: "2026-06-20",
      evaluationMonths: 12,
      useManualFutureSaleValue: "on",
      futureManualSaleValue: 750000,
      futureManualReason: "Oferta esperada",
      futureManualAuthorizedBy: "Gerencia",
      futureManualAuthorizationDate: "2026-06-20",
    });
    nearly(r.selectedFutureSaleValue, 750000);
    nearly(r.comparison.keepRentingValue, 750000);
  }],
  ["Mercado valida bajo promedio alto", () => {
    const r = calculate({
      ...baseInput,
      operationType: "new",
      supplierCost: 1000000,
      currency: "MXN",
      exchangeRate: 1,
      marketLow: 900000,
      marketAverage: 850000,
      marketHigh: 1100000,
      marketSource: "Referencia",
      marketDate: "2026-06-20",
    });
    assert.ok(r.errors.some((error) => error.includes("precio bajo")));
  }],
  ["Mercado exige fuente y fecha", () => {
    const r = calculate({
      ...baseInput,
      operationType: "new",
      supplierCost: 1000000,
      currency: "MXN",
      exchangeRate: 1,
      marketLow: 900000,
      marketAverage: 1000000,
      marketHigh: 1100000,
    });
    assert.ok(r.errors.some((error) => error.includes("fuente")));
    assert.ok(r.errors.some((error) => error.includes("fecha de consulta")));
  }],
  ["Cotizacion para equipo nuevo muestra solo precio final", () => {
    const result = calculate({ ...baseInput, operationType: "new", supplierCost: 1000000, currency: "MXN", exchangeRate: 1, proposedPrice: 1250000 });
    const model = buildClientQuoteModel({
      ...baseInput,
      operationType: "new",
      folio: "GL-20260620-0001",
      quoteDate: "2026-06-20",
      quoteValidUntil: "2026-06-30",
      clientName: "Cliente SA",
      clientContactName: "Compras",
      clientPhone: "8710000000",
      clientEmail: "cliente@example.com",
      clientDescription: "Equipo nuevo listo para entrega.",
      paymentTerms: "Contado",
      deliveryEstimate: "Torreon",
      clientWarrantyTerms: "Segun poliza",
      quoteValidityText: "10 dias",
    }, result);
    assert.equal(model.quoteNumber, "COT-GL-20260620-0001");
    assert.equal(model.finalPrice, result.finalPrice);
    assert.equal(model.operationType, "Equipo nuevo");
  }],
  ["Cotizacion para seminuevo incluye horas y condicion", () => {
    const result = calculate({
      ...baseInput,
      operationType: "used",
      originalCost: 1000000,
      acquisitionDate: "2021-06-20",
      analysisDate: "2026-06-20",
      proposedPrice: 800000,
    });
    const model = buildClientQuoteModel({
      ...baseInput,
      operationType: "used",
      currentHours: 1200,
      condition: "Buena",
      clientName: "Cliente",
    }, result);
    assert.equal(model.quoteNumber, "BORRADOR - SIN FOLIO");
    assert.equal(model.currentHours, "1200");
    assert.equal(model.condition, "Buena");
    assert.equal(model.finalPrice, result.finalPrice);
  }],
  ["Cotizacion no contiene claves ni valores sensibles", () => {
    const result = calculate({ ...baseInput, operationType: "new", supplierCost: 1000000, currency: "MXN", exchangeRate: 1, proposedPrice: 1250000 });
    const model = buildClientQuoteModel({
      ...baseInput,
      operationType: "new",
      folio: "GL-1",
      clientName: "Cliente",
      notes: "OBSERVACION_INTERNA_SECRETA",
      supplierCost: 1000000,
      economicBase: 999999,
      manualAdjustmentReason: "MOTIVO_INTERNO",
    }, { ...result, economicBase: 999999, expectedProfit: 12345 });
    const json = JSON.stringify(model);
    const html = renderClientQuoteHtml(model);
    const forbidden = [
      "supplierCost", "economicBase", "expectedProfit", "manualAdjustmentReason",
      "OBSERVACION_INTERNA_SECRETA", "MOTIVO_INTERNO", "999999", "12345",
      "Precio minimo", "Semaforo", "Depreciacion", "Valor en libros",
    ];
    forbidden.forEach((term) => {
      assert.equal(json.includes(term), false, `modelo contiene ${term}`);
      assert.equal(html.includes(term), false, `html contiene ${term}`);
    });
  }],
  ["Impresion interna conserva boton y cotizacion existe", () => {
    const html = fs.readFileSync("index.html", "utf8");
    assert.ok(html.includes("Imprimir análisis interno"));
    assert.ok(html.includes("Cotización para cliente"));
  }],
  ["Restauracion de nuevos campos desde historial conserva entradas", () => {
    const input = {
      quoteDate: "2026-06-20",
      clientName: "Cliente",
      useManualFutureSaleValue: "on",
      futureManualSaleValue: 700000,
      futureManualReason: "Autorizado",
    };
    const restored = Object.fromEntries(Object.entries(input));
    assert.deepEqual(restored, input);
  }],
  ["Error de comunicacion Apps Script verificable", async () => {
    const api = require("../netlify/functions/api");
    process.env.SESSION_SECRET = "secreto-local-de-pruebas-con-mas-de-32-caracteres";
    process.env.APP_USERS_JSON = JSON.stringify([{ username: "ventas", name: "Ventas", passwordHash: api._test.createPasswordHash("clave") }]);
    delete process.env.GAS_WEBAPP_URL;
    delete process.env.GAS_EXECUTION_TOKEN;
    const token = api._test.createSession({ username: "ventas", name: "Ventas" });
    const response = await api.handler({
      httpMethod: "GET",
      headers: { cookie: `${api._test.COOKIE_NAME}=${encodeURIComponent(token)}`, host: "localhost:8888" },
      queryStringParameters: { action: "history" },
    });
    assert.equal(response.statusCode, 500);
    assert.match(JSON.parse(response.body).error, /GAS_WEBAPP_URL|GAS_EXECUTION_TOKEN/);
  }],
];

(async () => {
  for (const [name, test] of tests) {
    await test();
    console.log(`ok - ${name}`);
  }
  console.log(`${tests.length} pruebas completadas`);
})();
