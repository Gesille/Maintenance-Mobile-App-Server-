import { NextFunction, Request, Response } from "express";
import { odooRequest } from "../odoo/odoo.client.js";
import { mapEquipment, mapEquipmentList } from "../mapper/equipment.mapper.js";
import ErrorHandler from "../utils/ErrorHandler.js";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import path from "path";
import { fileURLToPath } from "url";
import { uploadMedia } from "../utils/uploadImages.js";
import { CreateRequestInput, fetchAllEquipment } from "../services/equipment.service.js";
import sendMail from "../utils/sendMail.js";

const EQUIPMENT_FIELDS = [
  "id",
  "name",
  "category_id",
  "maintenance_team_id",
  "technician_user_id",
  "owner_user_id",
  "assign_date",
  "scrap_date",
  "x_location",
  "x_restaurant",
  // "x_asset_code",
  "partner_ref",
  "partner_id",
  "model",
  "serial_no",
  "effective_date",
  "cost",
  "warranty_date",
  "note",
];

// get all equipment
export const getAllEquipment = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const equipment = await odooRequest(
      "maintenance.equipment",
      "search_read",
      [[["active", "=", true]]],
      { fields: EQUIPMENT_FIELDS, order: "name asc" },
    );

    res.status(200).json({
      success: true,
      total: equipment.length,
      data: mapEquipmentList(equipment),
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// get equipment by ID
export const getEquipmentById = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id))
      return res.status(400).json({ success: false, message: "Invalid ID" });

    const equipment = await odooRequest(
      "maintenance.equipment",
      "search_read",
      [[["id", "=", id]]],
      { fields: EQUIPMENT_FIELDS },
    );

    if (!equipment?.length)
      return res
        .status(404)
        .json({ success: false, message: "Equipment not found" });

    res.status(200).json({
      success: true,
      data: mapEquipment(equipment[0]),
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

const generateQRGrid = async (
  doc: InstanceType<typeof PDFDocument>,
  items: any[],
) => {
  const itemsPerRow = 3;
  const itemsPerPage = 9;
  const cardWidth = 160;
  const cardHeight = 210;
  const marginX = 40;
  const marginY = 40;
  const gapX = 20;
  const gapY = 20;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    if (i > 0 && i % itemsPerPage === 0) doc.addPage();

    const pos = i % itemsPerPage;
    const col = pos % itemsPerRow;
    const row = Math.floor(pos / itemsPerRow);

    const x = marginX + col * (cardWidth + gapX);
    const y = marginY + row * (cardHeight + gapY);

    const qrBuffer = await QRCode.toBuffer(String(item.id), {
      errorCorrectionLevel: "H",
      width: 130,
    });

    // Use partner_ref as the reference code (mapped to "reference" in your API)
    const displayCode = item.partner_ref || "-";

    doc.rect(x, y, cardWidth, cardHeight).stroke();
    doc.image(qrBuffer, x + 15, y + 10, { width: 130, height: 130 });
    doc.fontSize(8).fillColor("black").text(item.name, x + 5, y + 148, {
      width: cardWidth - 10,
      align: "center",
      ellipsis: true,
    });
    doc.fontSize(9).fillColor("#333").text(displayCode, x + 5, y + 168, {
      width: cardWidth - 10,
      align: "center",
    });
    doc.fontSize(7).fillColor("#999").text(`ID: ${item.id}`, x + 5, y + 185, {
      width: cardWidth - 10,
      align: "center",
    });
    doc.fillColor("black");
  }
};

export const printAllQRPdf = async (req: Request, res: Response) => {
  try {
    const raw = await odooRequest(
      "maintenance.equipment",
      "search_read",
      [[["active", "=", true]]],
      { fields: ["id", "name", "partner_ref"], order: "name asc" }, 
    );
 console.log("FIRST 3 RAW ITEMS:", JSON.stringify(raw.slice(0, 3), null, 2));
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=all-equipment-qr.pdf");
    doc.pipe(res);
    await generateQRGrid(doc, raw);
    doc.end();
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const printSingleQRPdf = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const equipmentId = parseInt(id as string, 10);

    if (isNaN(equipmentId))
      return res.status(400).json({ success: false, message: "Invalid ID" });

    const raw = await odooRequest(
      "maintenance.equipment",
      "search_read",
      [[["id", "=", equipmentId]]],
      { fields: ["id", "name", "partner_ref"] }, // ← partner_ref here too
    );

    if (!raw?.length)
      return res.status(404).json({ success: false, message: "Equipment not found" });

    const item = raw[0];
    const displayCode = item.partner_ref || "";

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=qr-${displayCode || item.id}.pdf`);
    doc.pipe(res);

    const qrBuffer = await QRCode.toBuffer(String(item.id), {
      errorCorrectionLevel: "H",
      width: 250,
    });

    doc.image(qrBuffer, 172, 150, { width: 250, height: 250 });
    doc.fontSize(16).text(item.name, 40, 420, { align: "center" });
    doc.fontSize(12).fillColor("#555").text(displayCode, 40, 445, { align: "center" });
    doc.fontSize(10).fillColor("#999").text(`ID: ${item.id}`, 40, 465, { align: "center" });
    doc.end();
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// called after QR scan, returns data to pre-fill damage form
export const scanEquipmentQR = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id))
      return res.status(400).json({ success: false, message: "Invalid ID" });

    const equipment = await odooRequest(
      "maintenance.equipment",
      "search_read",
      [[["id", "=", id], ["active", "=", true]]],
      { fields: EQUIPMENT_FIELDS },
    );

    if (!equipment?.length)
      return res.status(404).json({ success: false, message: "Equipment not found" });

    res.status(200).json({ success: true, data: mapEquipment(equipment[0]) });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── Priority map ─────────────────────────────────────────────────────────────
const PRIORITY_MAP: Record<string, string> = {
  Normal: "0",
  High: "1",
  "Very Urgent": "3",
  Low: "0",
  Critical: "3",
};

// ─── Create maintenance request ───────────────────────────────────────────────
export const createMaintenanceRequest = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { equipmentId, priority, description, reportedBy, reportedByEmail } = req.body;

    if (!equipmentId || !description || !reportedBy || !reportedByEmail) {
      return res.status(400).json({
        success: false,
        message: "equipmentId, description, reportedBy and reportedByEmail are required",
      });
    }

    const equipment = await odooRequest(
      "maintenance.equipment",
      "search_read",
      [[["id", "=", Number(equipmentId)], ["active", "=", true]]],
      { fields: EQUIPMENT_FIELDS },
    );

    if (!equipment?.length)
      return res.status(404).json({ success: false, message: "Equipment not found" });

    const eq = equipment[0];

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

    const files = req.files as Express.Multer.File[] | undefined;
    const uploadedMedia: { url: string; public_id: string | null; type: "image" | "video" }[] = [];

    if (files && files.length > 0) {
      for (const file of files) {
        const isVideo = file.mimetype.startsWith("video/");
        const result = await uploadMedia(file.path, isVideo ? "video" : "image");
        uploadedMedia.push({ url: result.url, public_id: result.public_id, type: isVideo ? "video" : "image" });
        await odooRequest("ir.attachment", "create", [{
          name: file.originalname,
          type: "url",
          url: result.url,
          res_model: "maintenance.request",
          res_id: newId,
        }]);
      }
    }

    const jsonMedia = req.body.media as { url: string; type: "image" | "video" }[] | undefined;
    if (!files?.length && jsonMedia?.length) {
      for (const item of jsonMedia) {
        uploadedMedia.push({ url: item.url, public_id: null, type: item.type });
      }
    }

    const responseData = {
      id: newId,
      name: `[${reportedBy}] Issue with ${eq.name}`,
      priority,
      description,
      reportedBy,
      reportedByEmail,
      media: uploadedMedia,
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
      body: `
        <p><b>📱 Mobile App — Maintenance Request</b></p>
        <table style="border-collapse:collapse;width:100%">
          <tr><td style="padding:4px 8px;color:#666">Reported By</td><td style="padding:4px 8px"><b>${reportedBy}</b></td></tr>
          <tr><td style="padding:4px 8px;color:#666">Priority</td><td style="padding:4px 8px"><b>${priority}</b></td></tr>
          <tr style="background:#f9f9f9"><td style="padding:4px 8px;color:#666">Equipment</td><td style="padding:4px 8px"><b>${eq.name}</b></td></tr>
          <tr><td style="padding:4px 8px;color:#666">Asset Code</td><td style="padding:4px 8px">${eq.x_asset_code || "—"}</td></tr>
          <tr style="background:#f9f9f9"><td style="padding:4px 8px;color:#666">Restaurant</td><td style="padding:4px 8px">${eq.x_restaurant || "—"}</td></tr>
         <tr><td style="padding:4px 8px;color:#666">Location</td><td style="padding:4px 8px">${eq.x_location || "—"}</td></tr>
          <tr style="background:#f9f9f9"><td style="padding:4px 8px;color:#666">Category</td><td style="padding:4px 8px">${eq.category_id ? eq.category_id[1] : "—"}</td></tr>
          <tr><td style="padding:4px 8px;color:#666">Maint. Team</td><td style="padding:4px 8px">${eq.maintenance_team_id ? eq.maintenance_team_id[1] : "—"}</td></tr>
          <tr><td style="padding:4px 8px;color:#666">Owner</td><td style="padding:4px 8px">${eq.owner_user_id ? eq.owner_user_id[1] : "—"}</td></tr>
          <tr style="background:#f9f9f9"><td style="padding:4px 8px;color:#666">Vendor</td><td style="padding:4px 8px">${eq.partner_id ? eq.partner_id[1] : "—"}</td></tr>
          <tr><td style="padding:4px 8px;color:#666">Vendor Ref</td><td style="padding:4px 8px">${eq.partner_ref || "—"}</td></tr>
          <tr style="background:#f9f9f9"><td style="padding:4px 8px;color:#666">Model</td><td style="padding:4px 8px">${eq.model || "—"}</td></tr>
          <tr><td style="padding:4px 8px;color:#666">Serial No.</td><td style="padding:4px 8px">${eq.serial_no || "—"}</td></tr>
          <tr style="background:#f9f9f9"><td style="padding:4px 8px;color:#666">In Service Date</td><td style="padding:4px 8px">${eq.effective_date || "—"}</td></tr>
          <tr><td style="padding:4px 8px;color:#666">Warranty Exp.</td><td style="padding:4px 8px">${eq.warranty_date || "—"}</td></tr>
          <tr style="background:#f9f9f9"><td style="padding:4px 8px;color:#666">Cost</td><td style="padding:4px 8px">${eq.cost != null ? `$${eq.cost}` : "—"}</td></tr>
        </table>
        <br/>
        <p><b>🔧 Issue Description:</b></p>
        <p>${description}</p>
      `,
      message_type: "comment",
      subtype_xmlid: "mail.mt_note",
    }).catch(() => {});

    // Non-fatal: email via sendMail (nodemailer)
    sendMail({
      email: process.env.MAINTENANCE_EMAIL as string,
      subject: `New Maintenance Request: ${responseData.name}`,
      template: "maintenance-request.ejs",
      data: responseData,
      replyTo: reportedByEmail,
    }).catch((err) => {
      console.error("[SMTP] Failed to send maintenance email:", err.message);
    });

    res.status(201).json({
      success: true,
      message: "Maintenance request created successfully",
      data: responseData,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

export const getEquipmentFields = async (req:Request, res:Response) => {
  try {
    const fields = await odooRequest(
      "maintenance.equipment",
      "fields_get",
      [],
      { attributes: ["string", "type", "required"] }
    );
    res.status(200).json({ success: true, data: fields });
  } catch (error:any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

