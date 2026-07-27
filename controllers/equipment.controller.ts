import { NextFunction, Request, Response } from "express";

import ErrorHandler from "../utils/ErrorHandler.js";
import EquipmentModel from "../models/equipment.model.js";
import {
  fetchAllEquipment,
  fetchEquipmentById,
  fetchEquipmentForScan,
  
  createMaintenanceRequest as createMaintenanceRequestSvc,
  buildAllQRPdf,
  buildSingleQRPdf,
  createEquipmentService,
} from "../services/equipment.service.js";

// ─── Get all equipment ─────────────────────────────────────────────────────────

export const getAllEquipment = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const equipment = await fetchAllEquipment();

    res.status(200).json({
      success: true,
      total: equipment.length,
      data: equipment,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── Get equipment by ID ────────────────────────────────────────────────────────

export const getEquipmentById = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id))
      return res.status(400).json({ success: false, message: "Invalid ID" });

    const equipment = await fetchEquipmentById(id);

    if (!equipment)
      return res.status(404).json({ success: false, message: "Equipment not found" });

    res.status(200).json({ success: true, data: equipment });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── QR PDFs ────────────────────────────────────────────────────────────────────
// (grid-building logic lives in equipment.service.ts — buildAllQRPdf / buildSingleQRPdf)

export const printAllQRPdf = async (req: Request, res: Response) => {
  try {
    const doc = await buildAllQRPdf();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=all-equipment-qr.pdf");
    doc.pipe(res);
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

    const result = await buildSingleQRPdf(equipmentId);
    if (!result)
      return res.status(404).json({ success: false, message: "Equipment not found" });

    const { doc, filename } = result;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    doc.pipe(res);
    doc.end();
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── QR scan → prefill damage form ───────────────────────────────────────────────

export const scanEquipmentQR = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id))
      return res.status(400).json({ success: false, message: "Invalid ID" });

    const equipment = await fetchEquipmentForScan(id);

    if (!equipment)
      return res.status(404).json({ success: false, message: "Equipment not found" });

    res.status(200).json({ success: true, data: equipment });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── Create maintenance request ────────────────────────────────────────────────
// (equipment lookup, media upload, request creation, and email all happen inside
// createMaintenanceRequestSvc in equipment.service.ts)

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

    const files = req.files as Express.Multer.File[] | undefined;
    const jsonMedia = req.body.media as { url: string; type: "image" | "video" }[] | undefined;

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
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── Equipment schema fields (replaces Odoo fields_get) ──────────────────────────

export const getEquipmentFields = async (req: Request, res: Response) => {
  try {
    const paths = EquipmentModel.schema.paths;
    const fields = Object.entries(paths).reduce((acc: Record<string, any>, [key, val]: [string, any]) => {
      acc[key] = { type: val.instance, required: !!val.isRequired };
      return acc;
    }, {});

    res.status(200).json({ success: true, data: fields });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Create equipment ────────────────────────────────────────────────────────

export const createEquipment = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const {
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
      cost,
      warrantyExpirationDate,
      description,
    } = req.body;

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
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Equipment with this id or assetCode already exists",
      });
    }
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};