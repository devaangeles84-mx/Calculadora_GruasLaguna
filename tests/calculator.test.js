const assert = require("node:assert/strict");
const { calculate, resolveConfig } = require("../src/calculations");

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
    const r = calculate({ ...baseInput, operationType: "used", originalCost: 900000, bookValue: 500000, proposedPrice: 900000, expectedMonthlyRent: 20000, expectedOccupancy: 80, evaluationMonths: 6, estimatedSaleValueAfter: 500000 });
    assert.equal(r.recommendation, "Financieramente favorece vender ahora.");
  }],
  ["Comparacion conviene rentar", () => {
    const r = calculate({ ...baseInput, operationType: "used", originalCost: 900000, bookValue: 500000, proposedPrice: 650000, expectedMonthlyRent: 90000, expectedOccupancy: 90, evaluationMonths: 10, estimatedSaleValueAfter: 500000 });
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
    assert.ok(r.errors.some((error) => error.includes("valor en libros")));
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
