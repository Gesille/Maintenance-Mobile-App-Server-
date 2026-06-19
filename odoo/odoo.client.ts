import dotenv from "dotenv";
dotenv.config();

const ODOO_URL = process.env.ODOO_URL as string;
const ODOO_DB = process.env.ODOO_DB as string;
const ODOO_UID = Number(process.env.ODOO_UID);
const ODOO_PASSWORD = process.env.ODOO_PASSWORD as string;

export const odooRequest = async (
  model: string,
  method: string,
  domain: any[] = [],
  kwargs: any = {}
) => {
  const url = `${ODOO_URL}/jsonrpc`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: {
        service: "object",
        method: "execute_kw",
        args: [ODOO_DB, ODOO_UID, ODOO_PASSWORD, model, method, domain, kwargs],
      },
      id: Date.now(),
    }),
  });

  // ── Read raw text first so HTML error pages don't crash JSON.parse ──
  const raw = await response.text();

  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    // Odoo returned HTML (session expired, 404, 500, wrong URL, etc.)
    console.error("━━━ 🟠 Odoo returned non-JSON ━━━━━━━━━━━━━━━━━━━━━");
    console.error("Model   :", model);
    console.error("Method  :", method);
    console.error("Domain  :", JSON.stringify(domain));
    console.error("HTTP    :", response.status, response.statusText);
    console.error("Body    :", raw.slice(0, 600));   // first 600 chars is enough
    throw new Error(`Odoo returned HTML instead of JSON (HTTP ${response.status}) — check ODOO_URL, ODOO_UID, ODOO_PASSWORD in .env`);
  }

  if (data.error) {
    console.error("━━━ 🟠 Odoo JSON-RPC error ━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error("Model   :", model);
    console.error("Method  :", method);
    console.error("Error   :", JSON.stringify(data.error, null, 2));
    throw new Error(data.error?.data?.message || "Odoo request failed");
  }

  return data.result;
};