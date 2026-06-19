

import PDFDocument from "pdfkit";
import QRCode from "qrcode";


import { odooRequest } from "../odoo/odoo.client.js";
import { mapEquipment, mapEquipmentList } from "../mapper/equipment.mapper.js";
import { uploadMedia } from "../utils/uploadImages.js";
import { EQUIPMENT_FIELDS, EQUIPMENT_QR_FIELDS, PRIORITY_MAP, QR_GRID } from "../@types/equipment.constants.js";


// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateRequestInput {
  equipmentId: number;
  priority: string;
  description: string;
  reportedBy: string;
  reportedByEmail: string;
  files?: Express.Multer.File[];
  jsonMedia?: { url: string; type: "image" | "video" }[];
}

export interface UploadedMedia {
  url: string;
  public_id: string | null;
  type: "image" | "video";
}

// ─── Equipment queries ────────────────────────────────────────────────────────

export async function fetchAllEquipment() {
  const raw = await odooRequest(
    "maintenance.equipment",
    "search_read",
    [[["active", "=", true]]],
    { fields: EQUIPMENT_FIELDS, order: "name asc" },
  );
  return mapEquipmentList(raw);
}

export async function fetchEquipmentById(id: number) {
  const raw = await odooRequest(
    "maintenance.equipment",
    "search_read",
    [[["id", "=", id]]],
    { fields: EQUIPMENT_FIELDS },
  );
  return raw?.length ? mapEquipment(raw[0]) : null;
}

export async function fetchEquipmentForQR(id?: number) {
  const domain = id
    ? [[["id", "=", id], ["active", "=", true]]]
    : [[["active", "=", true]]];

  return odooRequest("maintenance.equipment", "search_read", domain, {
    fields: EQUIPMENT_QR_FIELDS,
    order: "name asc",
  });
}

export async function fetchEquipmentForScan(id: number) {
  const raw = await odooRequest(
    "maintenance.equipment",
    "search_read",
    [[["id", "=", id], ["active", "=", true]]],
    { fields: EQUIPMENT_FIELDS },
  );
  return raw?.length ? mapEquipment(raw[0]) : null;
}

// ─── PDF generation ───────────────────────────────────────────────────────────

async function renderQRCard(
  doc: InstanceType<typeof PDFDocument>,
  item: any,
  x: number,
  y: number,
  qrWidth: number,
) {
  const { cardWidth } = QR_GRID;

  const qrBuffer = await QRCode.toBuffer(String(item.id), {
    errorCorrectionLevel: "H",
    width: qrWidth,
  });

  doc.rect(x, y, cardWidth, QR_GRID.cardHeight).stroke();
  doc.image(qrBuffer, x + 15, y + 10, { width: 130, height: 130 });

  doc
    .fontSize(8)
    .fillColor("black")
    .text(item.name, x + 5, y + 148, {
      width: cardWidth - 10,
      align: "center",
      ellipsis: true,
    });

  doc
    .fontSize(9)
    .fillColor("#333")
    .text(item.x_asset_code || "-", x + 5, y + 168, {
      width: cardWidth - 10,
      align: "center",
    });

  doc
    .fontSize(7)
    .fillColor("#999")
    .text(`ID: ${item.id}`, x + 5, y + 185, {
      width: cardWidth - 10,
      align: "center",
    });

  doc.fillColor("black");
}

async function buildQRGrid(
  doc: InstanceType<typeof PDFDocument>,
  items: any[],
) {
  const { itemsPerRow, itemsPerPage, cardWidth, cardHeight, marginX, marginY, gapX, gapY } =
    QR_GRID;

  for (let i = 0; i < items.length; i++) {
    if (i > 0 && i % itemsPerPage === 0) doc.addPage();

    const pos = i % itemsPerPage;
    const col = pos % itemsPerRow;
    const row = Math.floor(pos / itemsPerRow);

    const x = marginX + col * (cardWidth + gapX);
    const y = marginY + row * (cardHeight + gapY);

    await renderQRCard(doc, items[i], x, y, 130);
  }
}

export async function generateAllQRPdf(): Promise<InstanceType<typeof PDFDocument>> {
  const raw = await fetchEquipmentForQR();
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  await buildQRGrid(doc, raw);
  doc.end();
  return doc;
}

export async function generateSingleQRPdf(
  id: number,
): Promise<{ doc: InstanceType<typeof PDFDocument>; filename: string } | null> {
  const raw = await fetchEquipmentForQR(id);
  if (!raw?.length) return null;

  const item = raw[0];
  const doc = new PDFDocument({ size: "A4", margin: 40 });

  const qrBuffer = await QRCode.toBuffer(String(item.id), {
    errorCorrectionLevel: "H",
    width: 250,
  });

  doc.image(qrBuffer, 172, 150, { width: 250, height: 250 });
  doc.fontSize(16).text(item.name, 40, 420, { align: "center" });
  doc.fontSize(12).fillColor("#555").text(item.x_asset_code || "", 40, 445, {
    align: "center",
  });
  doc.fontSize(10).fillColor("#999").text(`ID: ${item.id}`, 40, 465, {
    align: "center",
  });
  doc.end();

  return { doc, filename: `qr-${item.x_asset_code || item.id}.pdf` };
}

// ─── Media upload ─────────────────────────────────────────────────────────────

async function handleMediaUploads(
  requestId: number,
  files?: Express.Multer.File[],
  jsonMedia?: { url: string; type: "image" | "video" }[],
): Promise<UploadedMedia[]> {
  const uploaded: UploadedMedia[] = [];

  if (files?.length) {
    for (const file of files) {
      const isVideo = file.mimetype.startsWith("video/");
      const result = await uploadMedia(file.path, isVideo ? "video" : "image");

      uploaded.push({
        url: result.url,
        public_id: result.public_id,
        type: isVideo ? "video" : "image",
      });

      await odooRequest("ir.attachment", "create", [
        {
          name: file.originalname,
          type: "url",
          url: result.url,
          res_model: "maintenance.request",
          res_id: requestId,
        },
      ]);
    }
    return uploaded;
  }

  // Fallback: JSON media (e.g. Postman testing)
  if (jsonMedia?.length) {
    for (const item of jsonMedia) {
      uploaded.push({ url: item.url, public_id: null, type: item.type });
    }
  }

  return uploaded;
}

// ─── Email ────────────────────────────────────────────────────────────────────

function buildChatterNote(reportedBy: string, priority: string, description: string, eq: any): string {
  const row = (label: string, value: string, shaded = false) =>
    `<tr${shaded ? ' style="background:#f9f9f9"' : ""}><td style="padding:4px 8px;color:#666">${label}</td><td style="padding:4px 8px">${value}</td></tr>`;

  return `
    <p><b>📱 Mobile App — Maintenance Request</b></p>
    <table style="border-collapse:collapse;width:100%">
      ${row("Reported By", `<b>${reportedBy}</b>`)}
      ${row("Priority", `<b>${priority}</b>`, true)}
      ${row("Equipment", `<b>${eq.name}</b>`)}
      ${row("Asset Code", eq.x_asset_code || "—", true)}
      ${row("Restaurant", eq.x_restaurant || "—")}
     ${row("Restaurant", eq.x_restaurant || "—")}
      ${row("Category", eq.category_id ? eq.category_id[1] : "—")}
      ${row("Maint. Team", eq.maintenance_team_id ? eq.maintenance_team_id[1] : "—", true)}
      ${row("Owner", eq.owner_user_id ? eq.owner_user_id[1] : "—")}
      ${row("Vendor", eq.partner_id ? eq.partner_id[1] : "—", true)}
      ${row("Vendor Ref", eq.partner_ref || "—")}
      ${row("Model", eq.model || "—", true)}
      ${row("Serial No.", eq.serial_no || "—")}
      ${row("In Service Date", eq.effective_date || "—", true)}
      ${row("Warranty Exp.", eq.warranty_date || "—")}
      ${row("Cost", eq.cost != null ? `$${eq.cost}` : "—", true)}
    </table>
    <br/>
    <p><b>🔧 Issue Description:</b></p>
    <p>${description}</p>
  `;
}

import sendMail from "../utils/sendMail.js";

export async function sendMaintenanceEmail(data: {
  id: number;
  name: string;
  priority: string;
  description: string;
  reportedBy: string;
  reportedByEmail: string;
  equipment: Record<string, any>;
}): Promise<void> {
  await sendMail({
    email: process.env.MAINTENANCE_EMAIL as string,
    subject: `New Maintenance Request: ${data.name}`,
    template: "maintenance-request.ejs",
    data,
    replyTo: data.reportedByEmail,
  });

  console.log(`[SMTP] Email sent for request #${data.id}`);
}

// ─── Create maintenance request ───────────────────────────────────────────────

export async function createMaintenanceRequest(input: CreateRequestInput) {
  const { equipmentId, priority, description, reportedBy, reportedByEmail, files, jsonMedia } =
    input;

  const rawEq = await odooRequest(
    "maintenance.equipment",
    "search_read",
    [[["id", "=", equipmentId], ["active", "=", true]]],
    { fields: EQUIPMENT_FIELDS },
  );

  if (!rawEq?.length) return null;
  const eq = rawEq[0];

  const newId = await odooRequest("maintenance.request", "create", [
    {
      name: `[${reportedBy}] Issue with ${eq.name}`,
      equipment_id: eq.id,
      description,
      priority: PRIORITY_MAP[priority] ?? "0",
      maintenance_team_id: eq.maintenance_team_id ? eq.maintenance_team_id[0] : false,
      category_id: eq.category_id ? eq.category_id[0] : false,
    },
  ]);

  const media = await handleMediaUploads(newId, files, jsonMedia);

  const responseData = {
    id: newId,
    name: `[${reportedBy}] Issue with ${eq.name}`,
    priority,
    description,
    reportedBy,
    reportedByEmail,
    media,
    equipment: {
      id: eq.id,
      name: eq.name,
      assetCode: eq.x_asset_code || null,
      restaurant: eq.x_restaurant || null,
      location: eq.x_location || null,
      category: eq.category_id ? eq.category_id[1] : null,
      maintenanceTeam: eq.maintenance_team_id ? eq.maintenance_team_id[1] : null,
      owner: eq.owner_user_id ? eq.owner_user_id[1] : null,
      vendor: eq.partner_id ? eq.partner_id[1] : null,
      vendorReference: eq.partner_ref || null,
      model: eq.model || null,
      serialNumber: eq.serial_no || null,
      effectiveDate: eq.effective_date || null,
      warrantyExpirationDate: eq.warranty_date || null,
      cost: eq.cost ?? 0,
    },
  };

  // Non-fatal: chatter note
  odooRequest("maintenance.request", "message_post", [[newId]], {
    body: buildChatterNote(reportedBy, priority, description, eq),
    message_type: "comment",
    subtype_xmlid: "mail.mt_note",
  }).catch(() => {});

  // Non-fatal: email
  sendMaintenanceEmail(responseData).catch((err) => {
    console.error("[SMTP] Failed to send maintenance email:", err.message);
  });

  return responseData;
}