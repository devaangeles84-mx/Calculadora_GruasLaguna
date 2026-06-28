const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const formatMoney = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const formatPct = (value) => `${Number(value || 0).toFixed(2)}%`;

let configRows = [];
let historyRows = [];
let lastResult = null;
let dirty = false;
let userTouched = new Set();
let currentUser = null;

const form = $("#analysisForm");
const formMessage = $("#formMessage");
const loginForm = $("#loginForm");
const loginMessage = $("#loginMessage");

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

function setChecked(name, checked) {
  const field = form.elements[name];
  if (field) field.checked = Boolean(checked);
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
    credentials: "same-origin",
    ...options,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.ok === false) {
    const error = new Error(json.error || "No fue posible comunicarse con el servicio.");
    error.status = response.status;
    throw error;
  }
  return json;
}

function showLogin(message = "") {
  document.body.classList.remove("auth-loading", "authenticated");
  document.body.classList.add("logged-out");
  currentUser = null;
  if (message) showMessage(loginMessage, message, "warning");
  else hideMessage(loginMessage);
  iconRefresh();
}

function showApp(user) {
  currentUser = user;
  document.body.classList.remove("auth-loading", "logged-out");
  document.body.classList.add("authenticated");
  $("#currentUserName").textContent = user.name;
  setValue("responsible", user.name);
  iconRefresh();
}

async function checkSession() {
  try {
    const data = await api("session");
    showApp(data.user);
    return data.user;
  } catch (error) {
    showLogin(error.status === 401 ? "Sesion vencida o no iniciada." : "No fue posible validar la sesion.");
    return null;
  }
}

async function login(event) {
  event.preventDefault();
  hideMessage(loginMessage);
  $("#loginBtn").disabled = true;
  try {
    const body = {
      username: $("#loginUsername").value,
      password: $("#loginPassword").value,
    };
    const data = await api("login", { method: "POST", body: JSON.stringify(body) });
    $("#loginPassword").value = "";
    showApp(data.user);
    await loadConfig();
    calculateAndRender();
  } catch (error) {
    showMessage(loginMessage, error.status === 401 ? "Usuario o contrasena incorrectos." : error.message, "error");
  } finally {
    $("#loginBtn").disabled = false;
  }
}

async function logout() {
  try {
    await api("logout", { method: "POST", body: "{}" });
  } finally {
    showLogin("Sesion cerrada correctamente.");
  }
}

async function loadConfig() {
  try {
    const data = await api("config");
    configRows = data.config || [];
    fillDatalist("equipmentTypes", data.catalogs?.equipmentTypes || []);
    fillDatalist("brands", data.catalogs?.brands || []);
    fillDatalist("responsibles", data.catalogs?.responsibles || []);
    $("#connectionStatus").textContent = "Conectado a configuracion";
    applyConfigDefaults();
  } catch (error) {
    if (error.status === 401) {
      showLogin("Sesion vencida. Ingrese nuevamente.");
      return;
    }
    configRows = [];
    $("#connectionStatus").textContent = "Sin Apps Script configurado";
    showMessage(formMessage, "Se usaran porcentajes iniciales. Para guardar o consultar historial falta configurar Apps Script en Netlify.", "warning");
    applyConfigDefaults();
  }
}

function updateOperationVisibility() {
  const type = $("#operationType").value;
  $$(".operation-new").forEach((node) => node.classList.toggle("hidden", type !== "new"));
  $$(".operation-used").forEach((node) => node.classList.toggle("hidden", type !== "used"));
  const manualEnabled = $("#useManualBookValue")?.checked;
  $$(".manual-book-value").forEach((node) => node.classList.toggle("hidden", !manualEnabled));
  const futureManualEnabled = $("#useManualFutureSaleValue")?.checked;
  $$(".manual-future-value").forEach((node) => node.classList.toggle("hidden", !futureManualEnabled));
}

function applyConfigDefaults() {
  const data = formData();
  const config = GruasCalculator.resolveConfig(data, configRows);
  const operation = $("#operationType").value;
  if (!userTouched.has("currency")) {
    setValue("currency", config.defaultCurrency || "MXN");
  }
  const warrantyField = operation === "used" ? "usedWarrantyValue" : "newWarrantyValue";
  const warrantyModeField = operation === "used" ? "usedWarrantyMode" : "newWarrantyMode";
  if (!userTouched.has(warrantyField)) {
    setValue(warrantyField, config.defaultWarrantyPct || "");
  }
  if (!userTouched.has(warrantyModeField) && !userTouched.has(warrantyField)) {
    setValue(warrantyModeField, "percentBase");
  }
  if (operation === "used") {
    setValue("usefulLifeYears", config.usefulLifeYears || 10);
    setValue("residualPercentage", config.residualPercentage ?? 30);
  }
}

function syncDiscountInput() {
  if ($("#discountMode").value === "percent" && Number($("#discountValue").value) > 100) {
    setValue("discountValue", "100");
  }
}

function calculateAndRender() {
  syncDiscountInput();
  const data = formData();
  lastResult = GruasCalculator.calculate(data, configRows);
  renderResults(lastResult);
  renderValidation(lastResult);
  return lastResult;
}

function renderValidation(result) {
  if (result.errors.length) {
    showMessage(formMessage, result.errors.join(" "), "error");
  } else if (result.warnings.length) {
    showMessage(formMessage, result.warnings.join(" "), "warning");
  } else if (!formMessage.classList.contains("warning")) {
    hideMessage(formMessage);
  }
}

function renderResults(result) {
  setValue("elapsedMonths", result.elapsedMonths || 0);
  setValue("accumulatedDepreciation", result.estimatedDepreciation || 0);
  setValue("bookValue", result.automaticBookValue || 0);
  setValue("depreciationMethod", result.depreciationMethod || "Lineal interno");
  setValue("futureEvaluationDate", result.futureEvaluationDate || "");
  setValue("projectedElapsedAge", `${result.projectedElapsedMonths || 0} meses / ${Number(result.projectedElapsedYears || 0).toFixed(2)} anos`);
  setValue("futureResidualValue", result.futureResidualValue || 0);
  setValue("estimatedSaleValueAfter", result.automaticFutureSaleValue || 0);
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
  $("#usedOriginalCost").textContent = formatMoney.format(result.originalCost || 0);
  $("#usedElapsedAge").textContent = `${result.elapsedMonths || 0} meses / ${Number(result.elapsedYears || 0).toFixed(2)} anos`;
  $("#usedEstimatedDepreciation").textContent = formatMoney.format(result.estimatedDepreciation || 0);
  $("#usedResidualValue").textContent = formatMoney.format(result.residualValue || 0);
  $("#usedAutomaticBookValue").textContent = formatMoney.format(result.automaticBookValue || 0);
  $("#usedManualBookValue").textContent = result.manualBookValueEnabled ? formatMoney.format(result.manualBookValue || 0) : "No aplica";
  $("#usedSelectedBookValue").textContent = formatMoney.format(result.selectedBookValue || result.bookValue || 0);
  $("#usedDepreciationParams").textContent = `${Number(result.usefulLifeYears || 0).toFixed(2)} anos / ${formatPct(result.residualPercentage || 0)}`;
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
  userTouched = new Set();
  setChecked("useManualBookValue", false);
  setChecked("useManualFutureSaleValue", false);
  setValue("analysisDate", today());
  setValue("quoteDate", today());
  setValue("exchangeRate", "1");
  setValue("operationType", "new");
  setValue("currency", "MXN");
  if (currentUser) setValue("responsible", currentUser.name);
  updateOperationVisibility();
  applyConfigDefaults();
  dirty = false;
  calculateAndRender();
  hideMessage(formMessage);
}

function payload(status = "complete") {
  const result = calculateAndRender();
  if (currentUser) {
    result.input.responsible = currentUser.name;
  }
  return {
    status,
    input: { ...result.input, responsible: currentUser?.name || result.input.responsible },
    calculated: { ...result, input: { ...result.input, responsible: currentUser?.name || result.input.responsible } },
  };
}

async function saveAnalysis() {
  const result = calculateAndRender();
  if (result.errors.length) {
    showMessage(formMessage, result.errors.join(" "), "error");
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
    if (error.status === 401) {
      showLogin("Sesion vencida. Ingrese nuevamente.");
      return;
    }
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
    if (error.status === 401) {
      $("#historyModal").close();
      showLogin("Sesion vencida. Ingrese nuevamente.");
      return;
    }
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
  setChecked("useManualBookValue", row.input?.useManualBookValue === true || row.input?.useManualBookValue === "on");
  setChecked("useManualFutureSaleValue", row.input?.useManualFutureSaleValue === true || row.input?.useManualFutureSaleValue === "on");
  setValue("folio", "");
  userTouched = new Set(Object.keys(row.input || row));
  updateOperationVisibility();
  calculateAndRender();
  $("#historyModal").close();
  dirty = true;
  showMessage(formMessage, "Analisis cargado como nueva version. Al guardar se generara un folio nuevo.", "info");
}

function handleFormChange(event) {
  if (event.target?.name && !["usefulLifeYears", "residualPercentage"].includes(event.target.name)) {
    userTouched.add(event.target.name);
  }
  dirty = true;
  updateOperationVisibility();
  if (event.target?.name === "operationType" || event.target?.name === "equipmentType") {
    applyConfigDefaults();
  }
  calculateAndRender();
}

form.addEventListener("input", handleFormChange);
form.addEventListener("change", handleFormChange);
loginForm.addEventListener("submit", login);
$("#logoutBtn").addEventListener("click", logout);
$("#operationType").addEventListener("change", () => {
  updateOperationVisibility();
  applyConfigDefaults();
  calculateAndRender();
});
$("#calculateBtn").addEventListener("click", calculateAndRender);
$("#saveBtn").addEventListener("click", saveAnalysis);
$("#clearBtn").addEventListener("click", () => clearForm(false));
$("#printBtn").addEventListener("click", () => {
  calculateAndRender();
  document.body.classList.remove("quote-printing");
  document.body.classList.add("internal-printing");
  window.print();
});
function openQuotePreview() {
  const result = calculateAndRender();
  const input = { ...formData(), folio: $("#folio").value };
  const model = GruasQuote.buildClientQuoteModel(input, result);
  $("#quotePreview").innerHTML = GruasQuote.renderClientQuoteHtml(model);
  $("#quoteModal").showModal();
  iconRefresh();
}

$("#quoteBtn").addEventListener("click", openQuotePreview);
$("#closeQuoteBtn").addEventListener("click", () => $("#quoteModal").close());
$("#printQuoteBtn").addEventListener("click", () => {
  calculateAndRender();
  document.body.classList.remove("internal-printing");
  document.body.classList.add("quote-printing");
  window.print();
});
window.addEventListener("afterprint", () => {
  document.body.classList.remove("quote-printing", "internal-printing");
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
  setValue("quoteDate", today());
  updateOperationVisibility();
  const user = await checkSession();
  if (!user) {
    calculateAndRender();
    iconRefresh();
    return;
  }
  setValue("responsible", user.name);
  await loadConfig();
  applyConfigDefaults();
  calculateAndRender();
  iconRefresh();
});
