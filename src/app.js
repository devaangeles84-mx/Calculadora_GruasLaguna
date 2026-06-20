const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const formatMoney = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const formatPct = (value) => `${Number(value || 0).toFixed(2)}%`;

let configRows = [];
let historyRows = [];
let lastResult = null;
let dirty = false;

const form = $("#analysisForm");
const formMessage = $("#formMessage");

function iconRefresh() {
  if (window.lucide) window.lucide.createIcons();
}

function showMessage(element, text, type = "info") {
  element.textContent = text;
  element.className = `message ${type}`;
  element.classList.remove("hidden");
}

function hideMessage(element) {
  element.classList.add("hidden");
}

function formData() {
  return Object.fromEntries(new FormData(form).entries());
}

function setValue(name, value) {
  const field = form.elements[name];
  if (field) field.value = value ?? "";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function fillDatalist(id, values) {
  const list = $(`#${id}`);
  list.innerHTML = "";
  [...new Set(values.filter(Boolean))].forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    list.appendChild(option);
  });
}

async function api(action, options = {}) {
  const url = `/.netlify/functions/api?action=${encodeURIComponent(action)}`;
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.ok === false) {
    throw new Error(json.error || "No fue posible comunicarse con el servicio.");
  }
  return json;
}

async function loadConfig() {
  try {
    const data = await api("config");
    configRows = data.config || [];
    fillDatalist("equipmentTypes", data.catalogs?.equipmentTypes || []);
    fillDatalist("brands", data.catalogs?.brands || []);
    fillDatalist("responsibles", data.catalogs?.responsibles || []);
    $("#connectionStatus").textContent = "Conectado a configuracion";
  } catch (error) {
    configRows = [];
    $("#connectionStatus").textContent = "Sin Apps Script configurado";
    showMessage(formMessage, "Se usaran porcentajes iniciales. Para guardar o consultar historial falta configurar Apps Script en Netlify.", "warning");
  }
}

function updateOperationVisibility() {
  const type = $("#operationType").value;
  $$(".operation-new").forEach((node) => node.classList.toggle("hidden", type !== "new"));
  $$(".operation-used").forEach((node) => node.classList.toggle("hidden", type !== "used"));
}

function calculateAndRender() {
  const data = formData();
  lastResult = GruasCalculator.calculate(data, configRows);
  renderResults(lastResult);
  renderValidation(lastResult);
  return lastResult;
}

function renderValidation(result) {
  const blocking = result.errors.filter((error) => error.includes("obligatorio") || error.includes("tipo de cambio"));
  if (blocking.length) {
    showMessage(formMessage, blocking.join(" "), "warning");
  } else if (!formMessage.classList.contains("warning")) {
    hideMessage(formMessage);
  }
}

function renderResults(result) {
  $("#economicBase").textContent = formatMoney.format(result.economicBase);
  $("#finalPrice").textContent = formatMoney.format(result.finalPrice);
  $("#expectedProfit").textContent = formatMoney.format(result.expectedProfit);
  $("#profitOnCost").textContent = formatPct(result.profitOnCostPct);
  $("#minimumPrice").textContent = formatMoney.format(result.minimumPrice);
  $("#targetPrice").textContent = formatMoney.format(result.targetPrice);
  $("#highPrice").textContent = formatMoney.format(result.highPrice);
  $("#minimumPct").textContent = formatPct(result.margins.minimumPct);
  $("#targetPct").textContent = formatPct(result.margins.targetPct);
  $("#highPct").textContent = formatPct(result.margins.highPct);
  $("#marginOnSale").textContent = formatPct(result.marginOnSalePct);
  $("#maxDiscount").textContent = formatMoney.format(result.maxDiscountAllowed);
  $("#historicalResult").textContent = formatMoney.format(result.historicalRentalResult);
  $("#historicalRecovery").textContent = formatPct(result.historicalRecoveryPct);
  $("#totalRecovery").textContent = formatPct(result.totalRecoveryPct);
  $("#sellNowValue").textContent = formatMoney.format(result.comparison.sellNowValue);
  $("#keepRentingValue").textContent = formatMoney.format(result.comparison.keepRentingValue);
  $("#rentVsSellDifference").textContent = formatMoney.format(result.comparison.difference);
  $("#monthsToRecover").textContent = result.comparison.monthsToRecoverSale ? `${result.comparison.monthsToRecoverSale} meses` : "No disponible";
  $("#marketPosition").textContent = result.marketPosition;
  $("#recommendation").textContent = result.recommendation;
  $("#trafficLight").textContent = result.trafficLight;
  $("#trafficLight").className = `traffic ${result.trafficLight === "Dentro de politica" ? "green" : result.trafficLight === "Requiere autorizacion" ? "yellow" : "red"}`;

  $("#newCommissionEquivalent").textContent = `Equivalente: ${formatMoney.format(result.input.operationType === "new" ? result.commission : 0)}`;
  $("#newWarrantyEquivalent").textContent = `Equivalente: ${formatMoney.format(result.input.operationType === "new" ? result.warranty : 0)}`;
  $("#usedCommissionEquivalent").textContent = `Equivalente: ${formatMoney.format(result.input.operationType === "used" ? result.commission : 0)}`;
  $("#usedWarrantyEquivalent").textContent = `Equivalente: ${formatMoney.format(result.input.operationType === "used" ? result.warranty : 0)}`;
  $("#discountEquivalent").textContent = `Equivalente: ${formatMoney.format(result.discountAmount)} (${formatPct(result.discountPercent)})`;
}

function clearForm(force = false) {
  if (!force && dirty && !confirm("Hay datos capturados. Desea limpiar el analisis?")) return;
  form.reset();
  setValue("analysisDate", today());
  setValue("exchangeRate", "1");
  setValue("operationType", "new");
  setValue("currency", "MXN");
  updateOperationVisibility();
  dirty = false;
  calculateAndRender();
  hideMessage(formMessage);
}

function payload(status = "complete") {
  const result = calculateAndRender();
  return {
    status,
    input: result.input,
    calculated: result,
  };
}

async function saveAnalysis() {
  const result = calculateAndRender();
  const missingCore = result.errors.filter((error) => error.includes("obligatorio") || error.includes("tipo de cambio"));
  if (missingCore.length) {
    showMessage(formMessage, missingCore.join(" "), "error");
    return;
  }
  $("#saveBtn").disabled = true;
  showMessage(formMessage, "Guardando analisis...", "info");
  try {
    const data = await api("save", { method: "POST", body: JSON.stringify(payload("complete")) });
    setValue("folio", data.folio);
    dirty = false;
    showMessage(formMessage, `Analisis guardado con folio ${data.folio}.`, "success");
  } catch (error) {
    showMessage(formMessage, `${error.message} Verifique GAS_WEBAPP_URL y GAS_EXECUTION_TOKEN en Netlify.`, "error");
  } finally {
    $("#saveBtn").disabled = false;
  }
}

async function openHistory() {
  const modal = $("#historyModal");
  $("#historyRows").innerHTML = `<tr><td colspan="7">Cargando historial...</td></tr>`;
  hideMessage($("#historyMessage"));
  modal.showModal();
  iconRefresh();
  try {
    const data = await api("history");
    historyRows = data.items || [];
    renderHistory();
  } catch (error) {
    historyRows = [];
    $("#historyRows").innerHTML = "";
    showMessage($("#historyMessage"), `${error.message} El historial requiere Apps Script configurado.`, "error");
  }
}

function matchesHistory(row) {
  const search = $("#historySearch").value.toLowerCase();
  const date = String(row.analysisDate || row.timestamp || "").slice(0, 10);
  const from = $("#historyFrom").value;
  const to = $("#historyTo").value;
  const type = $("#historyType").value;
  const traffic = $("#historyTraffic").value;
  const haystack = [row.folio, row.economicNumber, row.brand, row.model, row.responsible].join(" ").toLowerCase();
  return (!search || haystack.includes(search))
    && (!from || date >= from)
    && (!to || date <= to)
    && (!type || row.operationType === type)
    && (!traffic || row.trafficLight === traffic);
}

function renderHistory() {
  const rows = historyRows.filter(matchesHistory);
  const tbody = $("#historyRows");
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7">No hay analisis con esos filtros.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map((row, index) => `
    <tr>
      <td>${escapeHtml(row.folio || "")}</td>
      <td>${escapeHtml(String(row.analysisDate || row.timestamp || "").slice(0, 10))}</td>
      <td>${escapeHtml([row.brand, row.model, row.economicNumber].filter(Boolean).join(" / "))}</td>
      <td>${escapeHtml(row.responsible || "")}</td>
      <td>${formatMoney.format(Number(row.finalPrice || 0))}</td>
      <td>${escapeHtml(row.trafficLight || "")}</td>
      <td class="row-actions">
        <button class="icon-btn" data-action="open" data-index="${index}" title="Abrir detalle"><i data-lucide="eye"></i></button>
        <button class="icon-btn" data-action="duplicate" data-index="${index}" title="Duplicar"><i data-lucide="copy"></i></button>
        <button class="icon-btn" data-action="print" data-index="${index}" title="Imprimir"><i data-lucide="printer"></i></button>
      </td>
    </tr>
  `).join("");
  iconRefresh();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[char]));
}

function loadHistoryRow(index) {
  const row = historyRows.filter(matchesHistory)[index];
  if (!row) return;
  clearForm(true);
  Object.entries(row.input || row).forEach(([key, value]) => setValue(key, value));
  setValue("folio", "");
  updateOperationVisibility();
  calculateAndRender();
  $("#historyModal").close();
  dirty = true;
  showMessage(formMessage, "Analisis cargado como nueva version. Al guardar se generara un folio nuevo.", "info");
}

form.addEventListener("input", () => {
  dirty = true;
  updateOperationVisibility();
  calculateAndRender();
});

$("#operationType").addEventListener("change", updateOperationVisibility);
$("#calculateBtn").addEventListener("click", calculateAndRender);
$("#saveBtn").addEventListener("click", saveAnalysis);
$("#clearBtn").addEventListener("click", () => clearForm(false));
$("#printBtn").addEventListener("click", () => {
  calculateAndRender();
  window.print();
});
$("#newAnalysisBtn").addEventListener("click", () => clearForm(false));
$("#historyBtn").addEventListener("click", openHistory);
$("#closeHistoryBtn").addEventListener("click", () => $("#historyModal").close());
$$(".history-filters input, .history-filters select").forEach((node) => node.addEventListener("input", renderHistory));
$("#historyRows").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const index = Number(button.dataset.index);
  if (button.dataset.action === "duplicate" || button.dataset.action === "open") loadHistoryRow(index);
  if (button.dataset.action === "print") {
    loadHistoryRow(index);
    setTimeout(() => window.print(), 50);
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  setValue("analysisDate", today());
  updateOperationVisibility();
  await loadConfig();
  calculateAndRender();
  iconRefresh();
});
