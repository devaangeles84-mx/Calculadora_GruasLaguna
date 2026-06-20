const GAS_WEBAPP_URL = process.env.GAS_WEBAPP_URL;
const GAS_EXECUTION_TOKEN = process.env.GAS_EXECUTION_TOKEN;

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function json(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function sanitize(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(sanitize);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [String(key).slice(0, 80), sanitize(item)]));
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  return String(value).replace(/[<>]/g, "").trim().slice(0, 5000);
}

function assertConfigured() {
  if (!GAS_WEBAPP_URL || !GAS_EXECUTION_TOKEN) {
    throw new Error("Faltan variables GAS_WEBAPP_URL o GAS_EXECUTION_TOKEN.");
  }
}

async function callGas(action, payload) {
  assertConfigured();
  const url = new URL(GAS_WEBAPP_URL);
  url.searchParams.set("action", action);
  url.searchParams.set("token", GAS_EXECUTION_TOKEN);

  const options = payload
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sanitize(payload)) }
    : { method: "GET" };

  const response = await fetch(url, options);
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error("Apps Script no devolvio JSON valido.");
  }
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || "Apps Script rechazo la solicitud.");
  }
  return data;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };

  try {
    const action = event.queryStringParameters?.action || "config";
    if (!["config", "history", "save"].includes(action)) {
      return json(400, { ok: false, error: "Accion no permitida." });
    }
    if (action === "save" && event.httpMethod !== "POST") {
      return json(405, { ok: false, error: "Guardar requiere POST." });
    }
    if (action !== "save" && event.httpMethod !== "GET") {
      return json(405, { ok: false, error: "Accion de consulta requiere GET." });
    }

    const payload = event.body ? JSON.parse(event.body) : null;
    const data = await callGas(action, payload);
    return json(200, data);
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Error interno." });
  }
};
