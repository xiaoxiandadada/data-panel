import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const targetUrl = String(process.env.IMPORT_TARGET_URL || process.env.APP_URL || "http://127.0.0.1:5173").replace(/\/+$/, "");
const dataFile = resolve(process.env.DATA_FILE || "data/project-data.json");
const adminPassword = String(process.env.ADMIN_PASSWORD || "");
const adminToken = String(process.env.ADMIN_TOKEN || "");

if (!adminPassword && !adminToken) {
  console.error("Missing ADMIN_PASSWORD or ADMIN_TOKEN");
  process.exit(1);
}

const dataset = JSON.parse(await readFile(dataFile, "utf8"));
let token = adminToken;
let cookie = "";

if (!token) {
  const loginResponse = await fetch(`${targetUrl}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: adminPassword })
  });
  const loginResult = await loginResponse.json().catch(() => null);
  if (!loginResponse.ok || !loginResult?.token) {
    console.error(loginResult?.message || `Admin login failed: ${loginResponse.status}`);
    process.exit(1);
  }
  token = loginResult.token;
  cookie = loginResponse.headers.get("set-cookie") || "";
}

const importResponse = await fetch(`${targetUrl}/api/import`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-admin-token": token,
    ...(cookie ? { cookie } : {})
  },
  body: JSON.stringify(dataset)
});
const importResult = await importResponse.json().catch(() => null);
if (!importResponse.ok || importResult?.ok === false) {
  console.error(importResult?.message || `Import failed: ${importResponse.status}`);
  process.exit(1);
}

console.log(`Imported ${importResult.count || dataset.records?.length || 0} records to ${targetUrl}`);
