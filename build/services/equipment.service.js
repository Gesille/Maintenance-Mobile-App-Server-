import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import EquipmentModel from "../models/equipment.model.js";
import MaintenanceRequestModel from "../models/Maintenancerequest.model.js";
import { uploadMedia } from "../utils/uploadImages.js";
import { PRIORITY_MAP, QR_GRID } from "../@types/equipment.constants.js";
import sendMail from "../utils/sendMail.js";
import fs from "fs/promises";
import os from "os";
import path from "path";
// ─── Equipment queries ────────────────────────────────────────────────────────
export async function fetchAllEquipment() {
    return EquipmentModel.find({ active: true }).sort({ name: 1 }).lean();
}
export async function fetchEquipmentById(id) {
    return EquipmentModel.findOne({ id }).lean();
}
export async function fetchEquipmentForQR(id) {
    const filter = id ? { id, active: true } : { active: true };
    return EquipmentModel.find(filter).sort({ name: 1 }).lean();
}
export async function fetchEquipmentForScan(id) {
    return EquipmentModel.findOne({ id, active: true }).lean();
}
// ─── PDF generation ───────────────────────────────────────────────────────────
// NOTE: these no longer call doc.end() themselves — the controller pipes the
// doc to the response first, then ends it, so no buffered data is lost.
async function renderQRCard(doc, item, x, y, qrWidth) {
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
        .text(item.assetCode || "-", x + 5, y + 168, {
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
async function buildQRGrid(doc, items) {
    const { itemsPerRow, itemsPerPage, cardWidth, marginX, marginY, gapX, gapY } = QR_GRID;
    for (let i = 0; i < items.length; i++) {
        if (i > 0 && i % itemsPerPage === 0)
            doc.addPage();
        const pos = i % itemsPerPage;
        const col = pos % itemsPerRow;
        const row = Math.floor(pos / itemsPerRow);
        const x = marginX + col * (cardWidth + gapX);
        const y = marginY + row * (QR_GRID.cardHeight + gapY);
        await renderQRCard(doc, items[i], x, y, 130);
    }
}
export async function buildAllQRPdf() {
    const items = await fetchEquipmentForQR();
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    await buildQRGrid(doc, items);
    return doc;
}
export async function buildSingleQRPdf(id) {
    const items = await fetchEquipmentForQR(id);
    if (!items?.length)
        return null;
    const item = items[0];
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const qrBuffer = await QRCode.toBuffer(String(item.id), {
        errorCorrectionLevel: "H",
        width: 250,
    });
    doc.image(qrBuffer, 172, 150, { width: 250, height: 250 });
    doc.fontSize(16).text(item.name, 40, 420, { align: "center" });
    doc.fontSize(12).fillColor("#555").text(item.assetCode || "", 40, 445, {
        align: "center",
    });
    doc.fontSize(10).fillColor("#999").text(`ID: ${item.id}`, 40, 465, {
        align: "center",
    });
    return { doc, filename: `qr-${item.assetCode || item.id}.pdf` };
}
// ─── Media upload ─────────────────────────────────────────────────────────────
async function handleMediaUploads(files, jsonMedia) {
    const uploaded = [];
    if (files?.length) {
        for (const file of files) {
            const isVideo = file.mimetype.startsWith("video/");
            const result = await uploadMedia(file.path, isVideo ? "video" : "image");
            uploaded.push({
                url: result.url,
                public_id: result.public_id,
                type: isVideo ? "video" : "image",
            });
        }
        return uploaded;
    }
    if (jsonMedia?.length) {
        for (const item of jsonMedia) {
            uploaded.push({ url: item.url, public_id: null, type: item.type });
        }
    }
    return uploaded;
}
// ─── Email ────────────────────────────────────────────────────────────────────
export async function sendMaintenanceEmail(data) {
    await sendMail({
        email: process.env.MAINTENANCE_EMAIL,
        subject: `New Maintenance Request: ${data.name}`,
        template: "maintenance-request.ejs",
        data,
        replyTo: data.reportedByEmail,
    });
    console.log(`[SMTP] Email sent for request #${data.id}`);
}
// ─── Create maintenance request ───────────────────────────────────────────────
export async function createMaintenanceRequest(input) {
    const { equipmentId, priority, description, reportedBy, reportedByEmail, files, jsonMedia } = input;
    const eq = await EquipmentModel.findOne({ id: equipmentId, active: true }).lean();
    if (!eq)
        return null;
    const media = await handleMediaUploads(files, jsonMedia);
    const requestName = `[${reportedBy}] Issue with ${eq.name}`;
    const request = await MaintenanceRequestModel.create({
        name: requestName,
        equipmentId: eq.id,
        priority: PRIORITY_MAP[priority] ?? priority,
        description,
        reportedBy,
        reportedByEmail,
        media,
        status: "new",
    });
    const responseData = {
        id: request.id,
        name: requestName,
        priority,
        description,
        reportedBy,
        reportedByEmail,
        media,
        equipment: {
            id: eq.id,
            name: eq.name,
            assetCode: eq.assetCode || null,
            reference: eq.reference || null,
            restaurant: eq.restaurant || null,
            location: eq.usedInLocation || null,
            category: eq.category || null,
            maintenanceTeam: eq.maintenanceTeam || null,
            technician: eq.technician || null,
            owner: eq.owner || null,
            vendor: eq.vendor || null,
            vendorReference: eq.vendorReference || null,
            model: eq.model || null,
            serialNumber: eq.serialNumber || null,
            effectiveDate: eq.effectiveDate || null,
            warrantyExpirationDate: eq.warrantyExpirationDate || null,
            cost: eq.cost ?? 0,
            description: eq.description || null,
        },
    };
    sendMaintenanceEmail(responseData).catch((err) => {
        console.error("[SMTP] Failed to send maintenance email:", err.message);
    });
    return responseData;
}
export async function createEquipmentService(input) {
    const equipment = await EquipmentModel.create({
        name: input.name,
        category: input.category ?? null,
        maintenanceTeam: input.maintenanceTeam ?? null,
        technician: input.technician ?? null,
        owner: input.owner ?? null,
        assignedDate: input.assignedDate ?? null,
        scrapDate: input.scrapDate ?? null,
        usedInLocation: input.usedInLocation ?? null,
        restaurant: input.restaurant ?? null,
        assetCode: input.assetCode ?? null,
        reference: input.reference ?? null,
        vendor: input.vendor ?? null,
        vendorReference: input.vendorReference ?? null,
        model: input.model ?? null,
        serialNumber: input.serialNumber ?? null,
        effectiveDate: input.effectiveDate ?? null,
        cost: input.cost ?? 0,
        warrantyExpirationDate: input.warrantyExpirationDate ?? null,
        description: input.description ?? null,
    });
    try {
        const { url, public_id } = await generateAndStoreQR(equipment.id);
        equipment.qrCodeUrl = url;
        equipment.qrPublicId = public_id;
        equipment.qrGenerated = true;
        await equipment.save();
    }
    catch (err) {
        // don't block equipment creation just because the QR upload hiccuped
        console.error(`[QR] Failed to generate QR for equipment #${equipment.id}:`, err.message);
    }
    return equipment.toObject();
}
export const updateEquipmentService = async (id, data) => {
    const updated = await EquipmentModel.findOneAndUpdate({ id }, { $set: data }, { new: true, runValidators: true });
    return updated; // null if not found
};
export const deleteEquipmentService = async (id) => {
    const deleted = await EquipmentModel.findOneAndDelete({ id });
    return deleted; // null if not found
};
// ─── QR generation + storage ─────────────────────────────────────────────────
async function generateAndStoreQR(id) {
    const dataUrl = await QRCode.toDataURL(String(id), {
        errorCorrectionLevel: "H",
        width: 400,
    });
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
    const tempPath = path.join(os.tmpdir(), `qr-${id}-${Date.now()}.png`);
    await fs.writeFile(tempPath, base64, "base64");
    try {
        const result = await uploadMedia(tempPath, "image");
        return { url: result.url, public_id: result.public_id };
    }
    finally {
        await fs.unlink(tempPath).catch(() => { });
    }
}
export async function generateEquipmentQRService(id) {
    const eq = await EquipmentModel.findOne({ id });
    if (!eq)
        return null;
    const { url, public_id } = await generateAndStoreQR(eq.id);
    eq.qrCodeUrl = url;
    eq.qrPublicId = public_id;
    eq.qrGenerated = true;
    await eq.save();
    return eq.toObject();
}
export async function generateMissingQRsService() {
    const items = await EquipmentModel.find({
        active: true,
        $or: [{ qrGenerated: { $ne: true } }, { qrCodeUrl: null }],
    });
    const results = [];
    for (const eq of items) {
        const { url, public_id } = await generateAndStoreQR(eq.id);
        eq.qrCodeUrl = url;
        eq.qrPublicId = public_id;
        eq.qrGenerated = true;
        await eq.save();
        results.push(eq.toObject());
    }
    return results;
}
