import { NextFunction, Request, Response } from "express";
import ErrorHandler from "../utils/ErrorHandler.js";
import { fetchAllParts, fetchPartById, fetchLowStockParts, fetchPartsForEquipment, fetchStockMovements, createPartService, updatePartService, deletePartService, restockPartService, consumePartService, adjustPartQuantityService, linkPartToEquipmentService, unlinkPartFromEquipmentService } from "../services/Part.service.js";


// ─── Get all parts ──────────────────────────────────────────────────────────
// ?category=filters&equipmentId=12&lowStockOnly=true&search=belt

export const getAllParts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { category, equipmentId, lowStockOnly, search } = req.query as {
      category?: string;
      equipmentId?: string;
      lowStockOnly?: string;
      search?: string;
    };

    const parts = await fetchAllParts({
      category,
      equipmentId: equipmentId ? Number(equipmentId) : undefined,
      lowStockOnly: lowStockOnly === "true",
      search,
    });

    res.status(200).json({ success: true, total: parts.length, data: parts });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── Get part by ID ─────────────────────────────────────────────────────────

export const getPartById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid ID" });

    const part = await fetchPartById(id);
    if (!part) return res.status(404).json({ success: false, message: "Part not found" });

    res.status(200).json({ success: true, data: part });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── Low stock parts ────────────────────────────────────────────────────────

export const getLowStockParts = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const parts = await fetchLowStockParts();
    res.status(200).json({ success: true, total: parts.length, data: parts });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── Parts linked to a specific piece of equipment ──────────────────────────

export const getPartsByEquipment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const equipmentId = parseInt(req.params.equipmentId as string);
    if (isNaN(equipmentId))
      return res.status(400).json({ success: false, message: "Invalid equipment ID" });

    const parts = await fetchPartsForEquipment(equipmentId);
    res.status(200).json({ success: true, total: parts.length, data: parts });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── Stock movement history for a part ───────────────────────────────────────

export const getPartStockHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid ID" });

    const movements = await fetchStockMovements(id);
    res.status(200).json({ success: true, total: movements.length, data: movements });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── Create part ────────────────────────────────────────────────────────────

export const createPart = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      name,
      partNumber,
      description,
      category,
      unitOfMeasure,
      quantityOnHand,
      minQuantity,
      reorderQuantity,
      unitCost,
      vendor,
      vendorPartNumber,
      location,
      barcode,
      linkedEquipmentIds,
    } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: "name is required" });
    }

    const part = await createPartService({
      name,
      partNumber,
      description,
      category,
      unitOfMeasure,
      quantityOnHand: quantityOnHand !== undefined ? Number(quantityOnHand) : 0,
      minQuantity: minQuantity !== undefined ? Number(minQuantity) : 0,
      reorderQuantity: reorderQuantity !== undefined ? Number(reorderQuantity) : null,
      unitCost: unitCost !== undefined ? Number(unitCost) : 0,
      vendor,
      vendorPartNumber,
      location,
      barcode,
      linkedEquipmentIds: Array.isArray(linkedEquipmentIds)
        ? linkedEquipmentIds.map(Number)
        : [],
    });

    res.status(201).json({ success: true, message: "Part created successfully", data: part });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: "Part with this number already exists" });
    }
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── Update part (metadata only — not stock quantity) ────────────────────────

export const updatePart = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid ID" });

    const {
      name,
      partNumber,
      description,
      category,
      unitOfMeasure,
      minQuantity,
      reorderQuantity,
      unitCost,
      vendor,
      vendorPartNumber,
      location,
      barcode,
    } = req.body;

    const updated = await updatePartService(id, {
      name,
      partNumber,
      description,
      category,
      unitOfMeasure,
      minQuantity: minQuantity !== undefined ? Number(minQuantity) : undefined,
      reorderQuantity: reorderQuantity !== undefined ? Number(reorderQuantity) : undefined,
      unitCost: unitCost !== undefined ? Number(unitCost) : undefined,
      vendor,
      vendorPartNumber,
      location,
      barcode,
    });

    if (!updated) return res.status(404).json({ success: false, message: "Part not found" });

    res.status(200).json({ success: true, message: "Part updated successfully", data: updated });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── Delete (soft) part ───────────────────────────────────────────────────────

export const deletePart = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid ID" });

    const deleted = await deletePartService(id);
    if (!deleted) return res.status(404).json({ success: false, message: "Part not found" });

    res.status(200).json({ success: true, message: "Part deleted successfully" });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── Restock ────────────────────────────────────────────────────────────────

export const restockPart = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid ID" });

    const { quantity, reason } = req.body as { quantity: number; reason?: string };
    if (!quantity || Number(quantity) <= 0) {
      return res.status(400).json({ success: false, message: "quantity must be greater than 0" });
    }

    const actor = req.user as any;
    const updated = await restockPartService(id, Number(quantity), reason, {
      id: actor?._id?.toString(),
      name: actor?.name,
    });

    if (!updated) return res.status(404).json({ success: false, message: "Part not found" });

    res.status(200).json({ success: true, message: "Stock added", data: updated });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── Consume ────────────────────────────────────────────────────────────────

export const consumePart = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid ID" });

    const { quantity, reason, maintenanceRequestId } = req.body as {
      quantity: number;
      reason?: string;
      maintenanceRequestId?: number;
    };
    if (!quantity || Number(quantity) <= 0) {
      return res.status(400).json({ success: false, message: "quantity must be greater than 0" });
    }

    const actor = req.user as any;
    const updated = await consumePartService(
      id,
      Number(quantity),
      reason,
      { id: actor?._id?.toString(), name: actor?.name },
      maintenanceRequestId ? "maintenance_request" : "manual",
      maintenanceRequestId ? Number(maintenanceRequestId) : null,
    );

    if (!updated) return res.status(404).json({ success: false, message: "Part not found" });

    res.status(200).json({ success: true, message: "Stock consumed", data: updated });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── Manual count correction ──────────────────────────────────────────────────

export const adjustPartQuantity = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid ID" });

    const { newQuantity, reason } = req.body as { newQuantity: number; reason?: string };
    if (newQuantity === undefined || Number(newQuantity) < 0) {
      return res.status(400).json({ success: false, message: "newQuantity must be 0 or greater" });
    }

    const actor = req.user as any;
    const updated = await adjustPartQuantityService(id, Number(newQuantity), reason, {
      id: actor?._id?.toString(),
      name: actor?.name,
    });

    if (!updated) return res.status(404).json({ success: false, message: "Part not found" });

    res.status(200).json({ success: true, message: "Stock adjusted", data: updated });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── Link / unlink equipment ───────────────────────────────────────────────────

export const linkPartToEquipment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    const { equipmentId } = req.body as { equipmentId: number };
    if (isNaN(id) || !equipmentId) {
      return res.status(400).json({ success: false, message: "Valid id and equipmentId are required" });
    }

    const updated = await linkPartToEquipmentService(id, Number(equipmentId));
    if (!updated) return res.status(404).json({ success: false, message: "Part not found" });

    res.status(200).json({ success: true, message: "Equipment linked", data: updated });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

export const unlinkPartFromEquipment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    const equipmentId = parseInt(req.params.equipmentId as string);
    if (isNaN(id) || isNaN(equipmentId)) {
      return res.status(400).json({ success: false, message: "Invalid id or equipmentId" });
    }

    const updated = await unlinkPartFromEquipmentService(id, equipmentId);
    if (!updated) return res.status(404).json({ success: false, message: "Part not found" });

    res.status(200).json({ success: true, message: "Equipment unlinked", data: updated });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};