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
  const response = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: {
        service: "object",
        method: "execute_kw",
        args: [
          ODOO_DB,
          ODOO_UID,
          ODOO_PASSWORD,
          model,
          method,
          domain,
          kwargs,
        ],
      },
      id: Date.now(),
    }),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error?.data?.message || "Odoo request failed");
  }

  return data.result;
};