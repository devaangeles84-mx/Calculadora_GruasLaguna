const crypto = require("node:crypto");

const COOKIE_NAME = "gl_session";
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

const baseHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function env(name) {
  return process.env[name] || "";
}

function json(statusCode, body, extraHeaders = {}) {
  return { statusCode, headers: { ...baseHeaders, ...extraHeaders }, body: JSON.stringify(body) };
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(value) {
  const secret = env("SESSION_SECRET");
  if (!secret) throw new Error("SESSION_SECRET no esta configurado.");
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function parseUsers() {
  const raw = env("APP_USERS_JSON");
  if (!raw) throw new Error("APP_USERS_JSON no esta configurado.");
  const parsed = JSON.parse(raw);
  const users = Array.isArray(parsed) ? parsed : Object.entries(parsed).map(([username, value]) => ({ username, ...value }));
  return users.map((user) => ({
    username: String(user.username || "").trim(),
    name: String(user.name || user.displayName || user.username || "").trim(),
    passwordHash: String(user.passwordHash || user.hash || "").trim(),
  })).filter((user) => user.username && user.name && user.passwordHash);
}

function timingSafeTextEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function verifyPassword(password, storedHash) {
  const parts = String(storedHash).split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "base64url");
  const expected = Buffer.from(parts[2], "base64url");
  const actual = crypto.scryptSync(String(password || ""), salt, expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function createPasswordHash(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

function createSession(user, now = Date.now()) {
  const payload = {
    sub: user.username,
    name: user.name,
    exp: now + SESSION_MAX_AGE_SECONDS * 1000,
  };
  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

function parseCookies(event) {
  const cookieHeader = event.headers?.cookie || event.headers?.Cookie || "";
  return Object.fromEntries(cookieHeader.split(";").map((item) => {
    const index = item.indexOf("=");
    if (index === -1) return ["", ""];
    return [item.slice(0, index).trim(), decodeURIComponent(item.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

function readSession(event, now = Date.now()) {
  const token = parseCookies(event)[COOKIE_NAME];
  if (!token || !token.includes(".")) return null;
  const [encoded, signature] = token.split(".");
  if (!timingSafeTextEqual(signature, sign(encoded))) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch (error) {
    return null;
  }
  if (!payload.sub || !payload.name || Number(payload.exp) <= now) return null;
  return { username: payload.sub, name: payload.name, expiresAt: payload.exp };
}

function isProduction(event) {
  const host = event.headers?.host || event.headers?.Host || "";
  return env("CONTEXT") === "production" && !host.includes("localhost") && !host.includes("127.0.0.1");
}

function sessionCookie(token, event) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ];
  if (isProduction(event)) parts.push("Secure");
  return parts.join("; ");
}

function clearSessionCookie(event) {
  const parts = [`${COOKIE_NAME}=`, "Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=0"];
  if (isProduction(event)) parts.push("Secure");
  return parts.join("; ");
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

function assertGasConfigured() {
  if (!env("GAS_WEBAPP_URL") || !env("GAS_EXECUTION_TOKEN")) {
    throw new Error("Faltan variables GAS_WEBAPP_URL o GAS_EXECUTION_TOKEN.");
  }
}

async function callGas(action, payload) {
  assertGasConfigured();
  const url = new URL(env("GAS_WEBAPP_URL"));
  url.searchParams.set("action", action);
  url.searchParams.set("token", env("GAS_EXECUTION_TOKEN"));

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

function enforceResponsible(payload, session) {
  const clean = sanitize(payload || {});
  clean.input = { ...(clean.input || {}), responsible: session.name };
  clean.calculated = { ...(clean.calculated || {}) };
  clean.calculated.input = { ...(clean.calculated.input || clean.input), responsible: session.name };
  return clean;
}

async function login(event) {
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Ingresar requiere POST." });
  const body = JSON.parse(event.body || "{}");
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const user = parseUsers().find((candidate) => candidate.username === username);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return json(401, { ok: false, error: "Usuario o contrasena incorrectos." });
  }
  const token = createSession(user);
  return json(200, { ok: true, user: { username: user.username, name: user.name } }, { "Set-Cookie": sessionCookie(token, event) });
}

async function logout(event) {
  return json(200, { ok: true }, { "Set-Cookie": clearSessionCookie(event) });
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: baseHeaders, body: "" };

  try {
    const action = event.queryStringParameters?.action || "config";
    if (action === "login") return login(event);
    if (action === "logout") return logout(event);

    const session = readSession(event);
    if (!session) return json(401, { ok: false, error: "Sesion vencida o no iniciada." });
    if (action === "session") return json(200, { ok: true, user: { username: session.username, name: session.name } });

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
    const protectedPayload = action === "save" ? enforceResponsible(payload, session) : payload;
    const data = await callGas(action, protectedPayload);
    return json(200, data);
  } catch (error) {
    const message = error.message || "Error interno.";
    const status = message.includes("APP_USERS_JSON") || message.includes("SESSION_SECRET") ? 500 : 500;
    return json(status, { ok: false, error: message });
  }
};

exports._test = {
  COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  createPasswordHash,
  createSession,
  readSession,
  verifyPassword,
  enforceResponsible,
};
