const assert = require("node:assert/strict");
const api = require("../netlify/functions/api");

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

function resetEnv() {
  process.env = { ...originalEnv };
  process.env.SESSION_SECRET = "secreto-local-de-pruebas-con-mas-de-32-caracteres";
  process.env.GAS_WEBAPP_URL = "https://script.google.com/macros/s/test/exec";
  process.env.GAS_EXECUTION_TOKEN = "token-gas";
  process.env.APP_USERS_JSON = JSON.stringify([
    { username: "ventas", name: "Ventas Laguna", passwordHash: api._test.createPasswordHash("clave-correcta") },
  ]);
}

function event(action, options = {}) {
  return {
    httpMethod: options.method || "GET",
    headers: { host: "localhost:8888", ...(options.cookie ? { cookie: options.cookie } : {}) },
    queryStringParameters: { action },
    body: options.body ? JSON.stringify(options.body) : undefined,
  };
}

function cookieFrom(response) {
  return response.headers["Set-Cookie"];
}

async function loginCookie() {
  const response = await api.handler(event("login", {
    method: "POST",
    body: { username: "ventas", password: "clave-correcta" },
  }));
  assert.equal(response.statusCode, 200);
  return cookieFrom(response);
}

async function run() {
  resetEnv();

  {
    const response = await api.handler(event("config"));
    assert.equal(response.statusCode, 401);
  }

  {
    const response = await api.handler(event("login", {
      method: "POST",
      body: { username: "ventas", password: "incorrecta" },
    }));
    assert.equal(response.statusCode, 401);
  }

  const cookie = await loginCookie();
  assert.match(cookie, /gl_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Max-Age=28800/);

  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, items: [], config: [], saved: true }),
    };
  };

  {
    const response = await api.handler(event("config", { cookie }));
    assert.equal(response.statusCode, 200);
  }

  {
    const response = await api.handler(event("history", { cookie }));
    assert.equal(response.statusCode, 200);
  }

  {
    const response = await api.handler(event("save", {
      method: "POST",
      cookie,
      body: {
        input: { responsible: "Persona Falsa", equipmentType: "Grua" },
        calculated: { input: { responsible: "Persona Falsa" } },
      },
    }));
    assert.equal(response.statusCode, 200);
    const sentBody = JSON.parse(calls.at(-1).options.body);
    assert.equal(sentBody.input.responsible, "Ventas Laguna");
    assert.equal(sentBody.calculated.input.responsible, "Ventas Laguna");
  }

  {
    const expired = api._test.createSession(
      { username: "ventas", name: "Ventas Laguna" },
      Date.now() - api._test.SESSION_MAX_AGE_SECONDS * 1000 - 1000,
    );
    const response = await api.handler(event("config", { cookie: `${api._test.COOKIE_NAME}=${encodeURIComponent(expired)}` }));
    assert.equal(response.statusCode, 401);
  }

  {
    const response = await api.handler(event("logout", { method: "POST", cookie }));
    assert.equal(response.statusCode, 200);
    assert.match(cookieFrom(response), /Max-Age=0/);
  }

  global.fetch = originalFetch;
  console.log("7 pruebas de autenticacion completadas");
}

run().catch((error) => {
  global.fetch = originalFetch;
  process.env = originalEnv;
  throw error;
});
