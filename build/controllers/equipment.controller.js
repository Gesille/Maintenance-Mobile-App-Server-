import ErrorHandler from "../utils/ErrorHandler.js";
import EquipmentModel from "../models/equipment.model.js";
import { fetchAllEquipment, fetchEquipmentById, fetchEquipmentForScan, createMaintenanceRequest as createMaintenanceRequestSvc, buildAllQRPdf, buildSingleQRPdf, createEquipmentService, deleteEquipmentService, updateEquipmentService, generateEquipmentQRService, generateMissingQRsService, } from "../services/equipment.service.js";
// ─── Get all equipment ─────────────────────────────────────────────────────────
export const getAllEquipment = async (req, res, next) => {
    try {
        const equipment = await fetchAllEquipment();
        res.status(200).json({
            success: true,
            total: equipment.length,
            data: equipment,
        });
    }
    catch (error) {
        return next(new ErrorHandler(error.message || "Something went wrong", 400));
    }
};
// ─── Get equipment by ID ────────────────────────────────────────────────────────
export const getEquipmentById = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id))
            return res.status(400).json({ success: false, message: "Invalid ID" });
        const equipment = await fetchEquipmentById(id);
        if (!equipment)
            return res.status(404).json({ success: false, message: "Equipment not found" });
        res.status(200).json({ success: true, data: equipment });
    }
    catch (error) {
        return next(new ErrorHandler(error.message || "Something went wrong", 400));
    }
};
// ─── QR PDFs ────────────────────────────────────────────────────────────────────
// (grid-building logic lives in equipment.service.ts — buildAllQRPdf / buildSingleQRPdf)
export const printAllQRPdf = async (req, res) => {
    try {
        const doc = await buildAllQRPdf();
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "attachment; filename=all-equipment-qr.pdf");
        doc.pipe(res);
        doc.end();
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
export const printSingleQRPdf = async (req, res) => {
    try {
        const { id } = req.params;
        const equipmentId = parseInt(id, 10);
        if (isNaN(equipmentId))
            return res.status(400).json({ success: false, message: "Invalid ID" });
        const result = await buildSingleQRPdf(equipmentId);
        if (!result)
            return res.status(404).json({ success: false, message: "Equipment not found" });
        const { doc, filename } = result;
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
        doc.pipe(res);
        doc.end();
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
// ─── QR scan → prefill damage form ───────────────────────────────────────────────
export const scanEquipmentQR = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id))
            return res.status(400).json({ success: false, message: "Invalid ID" });
        const equipment = await fetchEquipmentForScan(id);
        if (!equipment)
            return res.status(404).json({ success: false, message: "Equipment not found" });
        res.status(200).json({ success: true, data: equipment });
    }
    catch (error) {
        return next(new ErrorHandler(error.message || "Something went wrong", 400));
    }
};
// ─── Create maintenance request ────────────────────────────────────────────────
// (equipment lookup, media upload, request creation, and email all happen inside
// createMaintenanceRequestSvc in equipment.service.ts)
export const createMaintenanceRequest = async (req, res, next) => {
    try {
        const { equipmentId, priority, description, reportedBy, reportedByEmail } = req.body;
        if (!equipmentId || !description || !reportedBy || !reportedByEmail) {
            return res.status(400).json({
                success: false,
                message: "equipmentId, description, reportedBy and reportedByEmail are required",
            });
        }
        const files = req.files;
        const jsonMedia = req.body.media;
        const responseData = await createMaintenanceRequestSvc({
            equipmentId: Number(equipmentId),
            priority,
            description,
            reportedBy,
            reportedByEmail,
            files,
            jsonMedia,
        });
        if (!responseData)
            return res.status(404).json({ success: false, message: "Equipment not found" });
        res.status(201).json({
            success: true,
            message: "Maintenance request created successfully",
            data: responseData,
        });
    }
    catch (error) {
        return next(new ErrorHandler(error.message || "Something went wrong", 400));
    }
};
// ─── Equipment schema fields (replaces Odoo fields_get) ──────────────────────────
export const getEquipmentFields = async (req, res) => {
    try {
        const paths = EquipmentModel.schema.paths;
        const fields = Object.entries(paths).reduce((acc, [key, val]) => {
            acc[key] = { type: val.instance, required: !!val.isRequired };
            return acc;
        }, {});
        res.status(200).json({ success: true, data: fields });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
// ─── Create equipment ────────────────────────────────────────────────────────
export const createEquipment = async (req, res, next) => {
    try {
        const { name, category, maintenanceTeam, technician, owner, assignedDate, scrapDate, usedInLocation, restaurant, assetCode, reference, vendor, vendorReference, model, serialNumber, effectiveDate, cost, warrantyExpirationDate, description, } = req.body;
        if (!name) {
            return res.status(400).json({
                success: false,
                message: "name is required",
            });
        }
        const equipment = await createEquipmentService({
            name,
            category,
            maintenanceTeam,
            technician,
            owner,
            assignedDate,
            scrapDate,
            usedInLocation,
            restaurant,
            assetCode,
            reference,
            vendor,
            vendorReference,
            model,
            serialNumber,
            effectiveDate,
            cost: cost !== undefined ? Number(cost) : 0,
            warrantyExpirationDate,
            description,
        });
        res.status(201).json({
            success: true,
            message: "Equipment created successfully",
            data: equipment,
        });
    }
    catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "Equipment with this id or assetCode already exists",
            });
        }
        return next(new ErrorHandler(error.message || "Something went wrong", 400));
    }
};
// ─── Update equipment ─────────────────────────────────────────────────────────
export const updateEquipment = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id))
            return res.status(400).json({ success: false, message: "Invalid ID" });
        const { name, category, maintenanceTeam, technician, owner, assignedDate, scrapDate, usedInLocation, restaurant, assetCode, reference, vendor, vendorReference, model, serialNumber, effectiveDate, cost, warrantyExpirationDate, description, } = req.body;
        const updated = await updateEquipmentService(id, {
            name,
            category,
            maintenanceTeam,
            technician,
            owner,
            assignedDate,
            scrapDate,
            usedInLocation,
            restaurant,
            assetCode,
            reference,
            vendor,
            vendorReference,
            model,
            serialNumber,
            effectiveDate,
            cost: cost !== undefined ? Number(cost) : undefined,
            warrantyExpirationDate,
            description,
        });
        if (!updated)
            return res.status(404).json({ success: false, message: "Equipment not found" });
        res.status(200).json({
            success: true,
            message: "Equipment updated successfully",
            data: updated,
        });
    }
    catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "Equipment with this assetCode already exists",
            });
        }
        return next(new ErrorHandler(error.message || "Something went wrong", 400));
    }
};
// ─── Delete equipment ─────────────────────────────────────────────────────────
export const deleteEquipment = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id))
            return res.status(400).json({ success: false, message: "Invalid ID" });
        const deleted = await deleteEquipmentService(id);
        if (!deleted)
            return res.status(404).json({ success: false, message: "Equipment not found" });
        res.status(200).json({ success: true, message: "Equipment deleted successfully" });
    }
    catch (error) {
        return next(new ErrorHandler(error.message || "Something went wrong", 400));
    }
};
export const generateEquipmentQR = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id))
            return res.status(400).json({ success: false, message: "Invalid ID" });
        const updated = await generateEquipmentQRService(id);
        if (!updated)
            return res.status(404).json({ success: false, message: "Equipment not found" });
        res.status(200).json({ success: true, message: "QR code generated", data: updated });
    }
    catch (error) {
        return next(new ErrorHandler(error.message || "Something went wrong", 400));
    }
};
export const generateMissingQRs = async (req, res, next) => {
    try {
        const results = await generateMissingQRsService();
        res.status(200).json({
            success: true,
            message: `Generated ${results.length} QR code(s)`,
            data: results,
        });
    }
    catch (error) {
        return next(new ErrorHandler(error.message || "Something went wrong", 400));
    }
};
