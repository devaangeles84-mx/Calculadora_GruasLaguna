const assert = require("node:assert/strict");
const { calculate } = require("../src/calculations");

const baseInput = {
  responsible: "Ventas",
  equipmentType: "Grua",
  analysisDate: "2026-06-20",
  discountMode: "amount",
};

function nearly(actual, expected, delta = 0.02) {
  assert.ok(Math.abs(actual - expected) <= delta, `${actual} no coincide con ${expected}`);
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
  ["Error de comunicacion Apps Script verificable", async () => {
    const response = await require("../netlify/functions/api").handler({ httpMethod: "GET", queryStringParameters: { action: "history" } });
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
