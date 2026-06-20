const crypto = require("node:crypto");

const [username, name, password] = process.argv.slice(2);

if (!username || !name || !password) {
  console.error("Uso: node scripts/create-user-hash.js <usuario> <nombre_visible> <contrasena>");
  process.exit(1);
}

const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(password, salt, 64);
const user = {
  username,
  name,
  passwordHash: `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`,
};

console.log(JSON.stringify(user, null, 2));
