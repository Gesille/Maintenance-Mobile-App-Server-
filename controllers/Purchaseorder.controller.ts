import { NextFunction, Request, Response } from "express";
import ErrorHandler from "../utils/ErrorHandler.js";
import { VALID_PO_STATUSES } from "../models/Purchaseorder.model.js";
import { fetchAllPurchaseOrders, fetchPurchaseOrderById, createPurchaseOrderService, createPurchaseOrderFromPartService, updatePurchaseOrderService, deletePurchaseOrderService, approvePurchaseOrderService, declinePurchaseOrderService, markAsOrderedService, cancelPurchaseOrderService, fulfillPurchaseOrderItemsService } from "../services/Purchaseorder.service.js";


const ADMIN_ROLE = "manager"; // MaintainX's "Administrator"

// ─── Cost visibility ─────────────────────────────────────────────────────────
// "By default, Full Users can view and request purchase orders, but they
// can't see cost information." Strip cost fields for non-Administrators.

function stripCostsIfNotAdmin(po: any, role: string) {
  if (role === ADMIN_ROLE) return po;

  const { taxAmount, additionalCosts, subtotal, totalCost, ...rest } = po;
  return {
    ...rest,
    items: rest.items?.map((item: any) => {
      const { unitCost, ...itemRest } = item;
      return itemRest;
    }),
  };
}

// ─── Get all purchase orders ──────────────────────────────────────────────────
// ?status=approved&vendor=acme&search=PO-0001

export const getAllPurchaseOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, vendor, search } = req.query as {
      status?: string;
      vendor?: string;
      search?: string;
    };

    if (status && !VALID_PO_STATUSES.includes(status as any)) {
      return res.status(400).json({
        success: false,
        message: `status must be one of: ${VALID_PO_STATUSES.join(", ")}`,
      });
    }

    const role = (req.user as any)?.role;
    const orders = await fetchAllPurchaseOrders({ status: status as any, vendor, search });
    const data = orders.map((po) => stripCostsIfNotAdmin(po, role));

    res.status(200).json({ success: true, total: data.length, data });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── Get purchase order by ID ──────────────────────────────────────────────────

export const getPurchaseOrderById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid ID" });

    const po = await fetchPurchaseOrderById(id);
    if (!po) return res.status(404).json({ success: false, message: "Purchase order not found" });

    const role = (req.user as any)?.role;
    res.status(200).json({ success: true, data: stripCostsIfNotAdmin(po, role) });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── Create / request purchase order ───────────────────────────────────────────
// Administrator -> created as "approved" directly.
// Full User     -> created as "requested", awaiting approval.

export const createPurchaseOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { vendor, vendorContact, items, taxAmount, additionalCosts, expectedDeliveryDate, notes } =
      req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "items must be a non-empty array of { partId?, partName?, quantityOrdered, unitCost? }",
      });
    }

    const actor = req.user as any;
    const po = await createPurchaseOrderService({
      vendor,
      vendorContact,
      items,
      taxAmount,
      additionalCosts,
      expectedDeliveryDate,
      notes,
      createdByName: actor?.name ?? "Unknown",
      createdByRole: actor?.role ?? "Enduser",
    });

    const isRequest = po.status === "requested";
    res.status(201).json({
      success: true,
      message: isRequest ? "Purchase order requested — awaiting approval" : "Purchase order created successfully",
      data: stripCostsIfNotAdmin(po, actor?.role),
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── Order a part directly from its details page ──────────────────────────────
// Mirrors MaintainX's "Order this Part" shortcut.

export const createPurchaseOrderFromPart = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partId = parseInt(req.params.partId as string);
    const { quantity } = req.body as { quantity: number };

    if (isNaN(partId)) return res.status(400).json({ success: false, message: "Invalid part ID" });
    if (!quantity || quantity <= 0) {
      return res.status(400).json({ success: false, message: "quantity must be greater than 0" });
    }

    const actor = req.user as any;
    const po = await createPurchaseOrderFromPartService(partId, quantity, {
      name: actor?.name ?? "Unknown",
      role: actor?.role ?? "Enduser",
    });

    if (!po) return res.status(404).json({ success: false, message: "Part not found" });

    res.status(201).json({ success: true, message: "Purchase order created from part", data: po });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── Update purchase order (requested/approved only) ──────────────────────────

export const updatePurchaseOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid ID" });

    const { vendor, vendorContact, items, taxAmount, additionalCosts, expectedDeliveryDate, notes } =
      req.body;

    const updated = await updatePurchaseOrderService(id, {
      vendor,
      vendorContact,
      items,
      taxAmount,
      additionalCosts,
      expectedDeliveryDate,
      notes,
    });

    if (!updated) return res.status(404).json({ success: false, message: "Purchase order not found" });

    res.status(200).json({ success: true, message: "Purchase order updated successfully", data: updated });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── Delete (soft) purchase order ──────────────────────────────────────────────

export const deletePurchaseOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid ID" });

    const deleted = await deletePurchaseOrderService(id);
    if (!deleted) return res.status(404).json({ success: false, message: "Purchase order not found" });

    res.status(200).json({ success: true, message: "Purchase order deleted successfully" });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── Approve / decline a request ───────────────────────────────────────────────

export const approvePurchaseOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid ID" });

    const actor = req.user as any;
    const updated = await approvePurchaseOrderService(id, { name: actor?.name, role: actor?.role });
    if (!updated) return res.status(404).json({ success: false, message: "Purchase order not found" });

    res.status(200).json({ success: true, message: "Purchase order approved", data: updated });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

export const declinePurchaseOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid ID" });

    const { reason } = req.body as { reason?: string };
    const actor = req.user as any;
    const updated = await declinePurchaseOrderService(id, reason, { role: actor?.role });
    if (!updated) return res.status(404).json({ success: false, message: "Purchase order not found" });

    res.status(200).json({ success: true, message: "Purchase order declined", data: updated });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── Mark as ordered ────────────────────────────────────────────────────────────

export const markPurchaseOrderAsOrdered = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid ID" });

    const actor = req.user as any;
    const updated = await markAsOrderedService(id, { role: actor?.role });
    if (!updated) return res.status(404).json({ success: false, message: "Purchase order not found" });

    res.status(200).json({ success: true, message: "Purchase order marked as ordered", data: updated });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── Cancel ─────────────────────────────────────────────────────────────────────

export const cancelPurchaseOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid ID" });

    const actor = req.user as any;
    const updated = await cancelPurchaseOrderService(id, { role: actor?.role });
    if (!updated) return res.status(404).json({ success: false, message: "Purchase order not found" });

    res.status(200).json({ success: true, message: "Purchase order cancelled", data: updated });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── Fulfill items ────────────────────────────────────────────────────────────
// Body: { items: [{ partId?, partName?, quantityFulfilled, unitCost? }] }

export const fulfillPurchaseOrderItems = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid ID" });

    const { items } = req.body as {
      items: { partId?: number; partName?: string; quantityFulfilled: number; unitCost?: number }[];
    };
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "items must be a non-empty array of { partId or partName, quantityFulfilled, unitCost? }",
      });
    }

    const actor = req.user as any;
    const updated = await fulfillPurchaseOrderItemsService(
      id,
      items.map((i) => ({ partId: i.partId ?? null, partName: i.partName, quantityFulfilled: i.quantityFulfilled, unitCost: i.unitCost })),
      { id: actor?._id?.toString(), name: actor?.name, role: actor?.role },
    );

    if (!updated) return res.status(404).json({ success: false, message: "Purchase order not found" });

    res.status(200).json({ success: true, message: "Items fulfilled", data: updated });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};