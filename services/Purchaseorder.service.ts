
import PartModel from "../models/Part.model.js";
import PurchaseOrderModel, { IAdditionalCost, IPurchaseOrderItem } from "../models/Purchaseorder.model.js";
import { restockPartService } from "./Part.service.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LineItemInput {
  partId?: number | null;     // omit/null for a one-off item
  partName?: string;          // required for one-off items; looked up otherwise
  quantityOrdered: number;
  unitCost?: number;
}

export interface CreatePurchaseOrderInput {
  vendor?: string | null;     // optional, same as MaintainX
  vendorContact?: string | null;
  items: LineItemInput[];
  taxAmount?: number;
  additionalCosts?: IAdditionalCost[];
  expectedDeliveryDate?: string | Date | null;
  notes?: string | null;
  createdByName: string;
  createdByRole: string;      // "manager" == Administrator, else Full User
}

export interface UpdatePurchaseOrderInput {
  vendor?: string | null;
  vendorContact?: string | null;
  items?: LineItemInput[];
  taxAmount?: number;
  additionalCosts?: IAdditionalCost[];
  expectedDeliveryDate?: string | Date | null;
  notes?: string | null;
}

export interface FulfillItemInput {
  partId: number | null;
  partName?: string;          // needed to match a one-off line (no partId)
  quantityFulfilled: number;
  unitCost?: number;          // actual price paid — triggers moving-average recalculation
}

export interface PurchaseOrderFilters {
  status?: string;
  vendor?: string;
  search?: string;
  requestedOnly?: boolean;
}

const ADMIN_ROLE = "manager"; // maps to MaintainX's "Administrator"

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function buildLineItems(items: LineItemInput[]): Promise<IPurchaseOrderItem[]> {
  const built: IPurchaseOrderItem[] = [];

  for (const item of items) {
    if (!item.quantityOrdered || item.quantityOrdered <= 0) {
      throw new Error("Each item requires a quantityOrdered > 0");
    }

    if (item.partId) {
      // Regular inventory part
      const part = await PartModel.findOne({ id: item.partId }).lean();
      if (!part) throw new Error(`Part #${item.partId} not found`);

      built.push({
        partId: part.id,
        partName: part.name,
        isOneOff: false,
        quantityOrdered: item.quantityOrdered,
        quantityFulfilled: 0,
        unitCost: item.unitCost !== undefined ? item.unitCost : part.unitCost ?? 0,
      });
    } else {
      // One-off item — not tracked in Parts inventory, same as MaintainX's
      // "add items that aren't defined in your parts inventory".
      if (!item.partName?.trim()) {
        throw new Error("One-off items require a partName");
      }

      built.push({
        partId: null,
        partName: item.partName.trim(),
        isOneOff: true,
        quantityOrdered: item.quantityOrdered,
        quantityFulfilled: 0,
        unitCost: item.unitCost ?? 0,
      });
    }
  }

  return built;
}

/**
 * MaintainX: "MaintainX automatically recalculates the restock unit cost
 * using a moving average" when the price paid on a PO differs from the
 * part's current cost. Weighted by quantity on hand vs. quantity received.
 */
async function applyMovingAverageCost(partId: number, qtyReceived: number, unitCostPaid: number) {
  const part = await PartModel.findOne({ id: partId });
  if (!part) return;

  const existingQty = part.quantityOnHand;
  const existingCost = part.unitCost ?? 0;
  const totalQty = existingQty + qtyReceived;

  if (totalQty <= 0) return;

  const movingAverage = (existingQty * existingCost + qtyReceived * unitCostPaid) / totalQty;
  part.unitCost = Math.round(movingAverage * 100) / 100;
  await part.save();
}

function assertAdmin(role: string) {
  if (role !== ADMIN_ROLE) {
    throw new Error("Only an Administrator can perform this action");
  }
}

// ─── Queries ────────────────────────────────────────────────────────────────

export async function fetchAllPurchaseOrders(filters: PurchaseOrderFilters = {}) {
  const { status, vendor, search } = filters;

  const query: Record<string, any> = { active: true };
  if (status) query.status = status;
  if (vendor) query.vendor = { $regex: vendor, $options: "i" };
  if (search) {
    query.$or = [
      { poNumber: { $regex: search, $options: "i" } },
      { vendor: { $regex: search, $options: "i" } },
    ];
  }

  return PurchaseOrderModel.find(query).sort({ createdAt: -1 }).lean();
}

export async function fetchPurchaseOrderById(id: number) {
  return PurchaseOrderModel.findOne({ id }).lean();
}

// ─── Create ─────────────────────────────────────────────────────────────────
// Administrator creating one goes straight to "approved" (no approval needed).
// Full User creating one goes to "requested" and waits on an Administrator.

export async function createPurchaseOrderService(input: CreatePurchaseOrderInput) {
  if (!input.items?.length) {
    throw new Error("At least one line item is required");
  }

  const items = await buildLineItems(input.items);
  const isAdmin = input.createdByRole === ADMIN_ROLE;

  const po = await PurchaseOrderModel.create({
    vendor: input.vendor?.trim() || null,
    vendorContact: input.vendorContact ?? null,
    items,
    taxAmount: input.taxAmount ?? 0,
    additionalCosts: input.additionalCosts ?? [],
    status: isAdmin ? "approved" : "requested",
    approvedByName: isAdmin ? input.createdByName : null,
    expectedDeliveryDate: input.expectedDeliveryDate ?? null,
    notes: input.notes ?? null,
    createdByName: input.createdByName,
    createdByRole: input.createdByRole,
  });

  return po.toObject();
}

// Shortcut mirroring MaintainX's "Order this Part" from the part details page —
// pre-fills vendor + cost from the part and creates a single-item PO/request.
export async function createPurchaseOrderFromPartService(
  partId: number,
  quantity: number,
  actor: { name: string; role: string },
) {
  const part = await PartModel.findOne({ id: partId }).lean();
  if (!part) return null;

  return createPurchaseOrderService({
    vendor: part.vendor ?? null,
    items: [
      {
        partId: part.id,
        quantityOrdered: quantity,
        unitCost: part.unitCost,
      },
    ],
    createdByName: actor.name,
    createdByRole: actor.role,
  });
}

// ─── Update (only while requested/approved, before ordering) ─────────────────

export async function updatePurchaseOrderService(id: number, data: UpdatePurchaseOrderInput) {
  const existing = await PurchaseOrderModel.findOne({ id });
  if (!existing) return null;

  if (!["requested", "approved"].includes(existing.status)) {
    throw new Error("Only requested or approved purchase orders can be edited");
  }

  if (data.vendor !== undefined) existing.vendor = data.vendor?.trim() || null;
  if (data.vendorContact !== undefined) existing.vendorContact = data.vendorContact;
  if (data.taxAmount !== undefined) existing.taxAmount = data.taxAmount;
  if (data.additionalCosts !== undefined) existing.additionalCosts = data.additionalCosts;
  if (data.expectedDeliveryDate !== undefined) {
    existing.expectedDeliveryDate = data.expectedDeliveryDate
      ? new Date(data.expectedDeliveryDate)
      : null;
  }
  if (data.notes !== undefined) existing.notes = data.notes;
  if (data.items !== undefined) {
    existing.items = await buildLineItems(data.items);
  }

  await existing.save();
  return existing.toObject();
}

export async function deletePurchaseOrderService(id: number) {
  const deleted = await PurchaseOrderModel.findOneAndUpdate(
    { id },
    { $set: { active: false } },
    { new: true },
  );
  return deleted;
}

// ─── Approval workflow ────────────────────────────────────────────────────────

export async function approvePurchaseOrderService(id: number, actor: { name: string; role: string }) {
  assertAdmin(actor.role);

  const po = await PurchaseOrderModel.findOne({ id });
  if (!po) return null;

  if (po.status !== "requested") {
    throw new Error("Only requested purchase orders can be approved");
  }

  po.status = "approved";
  po.approvedByName = actor.name;
  await po.save();
  return po.toObject();
}

export async function declinePurchaseOrderService(
  id: number,
  reason: string | undefined,
  actor: { role: string },
) {
  assertAdmin(actor.role);

  const po = await PurchaseOrderModel.findOne({ id });
  if (!po) return null;

  if (po.status !== "requested") {
    throw new Error("Only requested purchase orders can be declined");
  }

  po.status = "declined";
  po.declineReason = reason ?? null;
  await po.save();
  return po.toObject();
}

// ─── Mark as ordered (sent to vendor) ─────────────────────────────────────────

export async function markAsOrderedService(id: number, actor: { role: string }) {
  assertAdmin(actor.role);

  const po = await PurchaseOrderModel.findOne({ id });
  if (!po) return null;

  if (po.status !== "approved") {
    throw new Error("Only approved purchase orders can be marked as ordered");
  }

  po.status = "ordered";
  po.orderDate = new Date();
  await po.save();
  return po.toObject();
}

// ─── Cancel ─────────────────────────────────────────────────────────────────
// Same rule as MaintainX: once fulfillment has started, the PO is locked.

export async function cancelPurchaseOrderService(id: number, actor: { role: string }) {
  assertAdmin(actor.role);

  const po = await PurchaseOrderModel.findOne({ id });
  if (!po) return null;

  const anyFulfilled = po.items.some((i) => i.quantityFulfilled > 0);
  if (anyFulfilled) {
    throw new Error("This purchase order has already started fulfillment and can no longer be cancelled");
  }

  po.status = "cancelled";
  await po.save();
  return po.toObject();
}

// ─── Fulfill items ────────────────────────────────────────────────────────────
// Bumps quantityFulfilled on each matching line, restocks the linked Part
// (writing a stock movement via Part.service), optionally recalculates the
// part's moving-average unit cost, and rolls the PO status forward to
// "partially_fulfilled" or "fulfilled" once every line is complete.

export async function fulfillPurchaseOrderItemsService(
  id: number,
  fulfillItems: FulfillItemInput[],
  actor: { id?: string; name?: string; role: string },
) {
  assertAdmin(actor.role);

  const po = await PurchaseOrderModel.findOne({ id });
  if (!po) return null;

  if (!["ordered", "partially_fulfilled"].includes(po.status)) {
    throw new Error("Purchase order must be ordered before it can be fulfilled");
  }

  for (const fulfill of fulfillItems) {
    if (!fulfill.quantityFulfilled || fulfill.quantityFulfilled <= 0) continue;

    const line = po.items.find((i) =>
      fulfill.partId ? i.partId === fulfill.partId : i.partName === fulfill.partName,
    );
    if (!line) {
      throw new Error(`Item ${fulfill.partId ?? fulfill.partName} is not on this purchase order`);
    }

    const remaining = line.quantityOrdered - line.quantityFulfilled;
    const qtyToApply = Math.min(fulfill.quantityFulfilled, remaining);
    if (qtyToApply <= 0) continue;

    line.quantityFulfilled += qtyToApply;

    // One-off items aren't tracked in inventory — nothing to restock.
    if (!line.isOneOff && line.partId) {
      await restockPartService(
        line.partId,
        qtyToApply,
        `Fulfilled on ${po.poNumber}`,
        { id: actor.id, name: actor.name },
      );

      if (fulfill.unitCost !== undefined && fulfill.unitCost !== line.unitCost) {
        await applyMovingAverageCost(line.partId, qtyToApply, fulfill.unitCost);
      }
    }
  }

  const allFulfilled = po.items.every((i) => i.quantityFulfilled >= i.quantityOrdered);
  const anyFulfilled = po.items.some((i) => i.quantityFulfilled > 0);

  po.status = allFulfilled ? "fulfilled" : anyFulfilled ? "partially_fulfilled" : po.status;
  if (allFulfilled) po.fulfilledDate = new Date();

  await po.save();
  return po.toObject();
}