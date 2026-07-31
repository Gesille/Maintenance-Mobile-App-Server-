// ─── Types ────────────────────────────────────────────────────────────────────

import PartModel, { PartStockMovementModel, StockMovementType, IPartDocument } from "../models/Part.model.js";
import sendMail from "../utils/sendMail.js";

export interface CreatePartInput {
  name: string;
  partNumber?: string | null;
  description?: string | null;
  category?: string | null;
  unitOfMeasure?: string;
  quantityOnHand?: number;
  minQuantity?: number;
  reorderQuantity?: number | null;
  unitCost?: number;
  vendor?: string | null;
  vendorPartNumber?: string | null;
  location?: string | null;
  barcode?: string | null;
  linkedEquipmentIds?: number[];
}

export interface UpdatePartInput {
  name?: string;
  partNumber?: string | null;
  description?: string | null;
  category?: string | null;
  unitOfMeasure?: string;
  minQuantity?: number;
  reorderQuantity?: number | null;
  unitCost?: number;
  vendor?: string | null;
  vendorPartNumber?: string | null;
  location?: string | null;
  barcode?: string | null;
}

export interface PartFilters {
  category?: string;
  equipmentId?: number;
  lowStockOnly?: boolean;
  search?: string;
}

export interface PerformedBy {
  id?: string | null;
  name?: string | null;
}

// ─── Queries ────────────────────────────────────────────────────────────────

export async function fetchAllParts(filters: PartFilters = {}) {
  const query: Record<string, any> = { active: true };

  if (filters.category) query.category = filters.category;
  if (filters.equipmentId !== undefined) query.linkedEquipmentIds = filters.equipmentId;
  if (filters.search) {
    query.$or = [
      { name: { $regex: filters.search, $options: "i" } },
      { partNumber: { $regex: filters.search, $options: "i" } },
      { barcode: { $regex: filters.search, $options: "i" } },
    ];
  }

  let parts = await PartModel.find(query).sort({ name: 1 }).lean({ virtuals: true });

  if (filters.lowStockOnly) {
    parts = parts.filter((p: any) => p.quantityOnHand <= p.minQuantity);
  }

  return parts;
}

export async function fetchPartById(id: number) {
  return PartModel.findOne({ id }).lean({ virtuals: true });
}

export async function fetchLowStockParts() {
  const parts = await PartModel.find({ active: true }).lean({ virtuals: true });
  return parts.filter((p: any) => p.quantityOnHand <= p.minQuantity);
}

export async function fetchPartsForEquipment(equipmentId: number) {
  return PartModel.find({ active: true, linkedEquipmentIds: equipmentId })
    .sort({ name: 1 })
    .lean({ virtuals: true });
}

export async function fetchStockMovements(partId: number) {
  return PartStockMovementModel.find({ partId }).sort({ createdAt: -1 }).lean();
}

// ─── Create / update / delete ────────────────────────────────────────────────

export async function createPartService(input: CreatePartInput) {
  const initialQty = input.quantityOnHand ?? 0;

  const part = await PartModel.create({
    name: input.name,
    partNumber: input.partNumber ?? null,
    description: input.description ?? null,
    category: input.category ?? null,
    unitOfMeasure: input.unitOfMeasure ?? "pcs",
    quantityOnHand: initialQty,
    minQuantity: input.minQuantity ?? 0,
    reorderQuantity: input.reorderQuantity ?? null,
    unitCost: input.unitCost ?? 0,
    vendor: input.vendor ?? null,
    vendorPartNumber: input.vendorPartNumber ?? null,
    location: input.location ?? null,
    barcode: input.barcode ?? null,
    linkedEquipmentIds: input.linkedEquipmentIds ?? [],
  });

  if (initialQty > 0) {
    await PartStockMovementModel.create({
      partId: part.id,
      type: "initial",
      quantityDelta: initialQty,
      previousQuantity: 0,
      newQuantity: initialQty,
      reason: "Initial stock on part creation",
      referenceType: "manual",
      referenceId: null,
    });
  }

  return part.toObject({ virtuals: true });
}

// NOTE: quantityOnHand is intentionally not editable here — it only moves
// through adjustStock() below, so every change is captured in the audit log.
export async function updatePartService(id: number, data: UpdatePartInput) {
  const updated = await PartModel.findOneAndUpdate(
    { id },
    { $set: data },
    { new: true, runValidators: true },
  );
  return updated?.toObject({ virtuals: true }) ?? null;
}

export async function deletePartService(id: number) {
  // Soft delete — keeps stock-movement history and equipment links intact.
  const deleted = await PartModel.findOneAndUpdate(
    { id },
    { $set: { active: false } },
    { new: true },
  );
  return deleted;
}

// ─── Low-stock alert ──────────────────────────────────────────────────────────
// Fires once, at the moment stock CROSSES into low-stock territory (not on
// every read/consume after that) so managers get one email, not a flood.

async function maybeSendLowStockAlert(
  part: IPartDocument,
  previousQuantity: number,
  newQuantity: number,
) {
  const crossedIntoLowStock = previousQuantity > part.minQuantity && newQuantity <= part.minQuantity;
  if (!crossedIntoLowStock) return;

  const alertEmail = process.env.MAINTENANCE_EMAIL;
  if (!alertEmail) return;

  try {
    await sendMail({
      email: alertEmail,
      subject: `⚠️ Low Stock: ${part.name} (${newQuantity} ${part.unitOfMeasure} left)`,
      template: "low-stock-alert.ejs",
      data: {
        partId: part.id,
        name: part.name,
        partNumber: part.partNumber || "—",
        quantityOnHand: newQuantity,
        minQuantity: part.minQuantity,
        reorderQuantity: part.reorderQuantity,
        vendor: part.vendor || "—",
        location: part.location || "—",
      },
    });
  } catch (err: any) {
    console.error(`[SMTP] Failed to send low-stock alert for part #${part.id}:`, err.message);
  }
}

// ─── Stock adjustments (the one path that ever changes quantityOnHand) ──────

async function adjustStock(
  partId: number,
  delta: number,
  type: StockMovementType,
  opts: {
    reason?: string | null;
    referenceType?: "maintenance_request" | "manual" | null;
    referenceId?: number | null;
    performedBy?: PerformedBy;
  } = {},
) {
  const part = await PartModel.findOne({ id: partId });
  if (!part) return null;

  const previousQuantity = part.quantityOnHand;
  const newQuantity = previousQuantity + delta;

  if (newQuantity < 0) {
    throw new Error(
      `Insufficient stock for "${part.name}": have ${previousQuantity}, tried to remove ${-delta}`,
    );
  }

  part.quantityOnHand = newQuantity;
  await part.save();

  await PartStockMovementModel.create({
    partId,
    type,
    quantityDelta: delta,
    previousQuantity,
    newQuantity,
    reason: opts.reason ?? null,
    referenceType: opts.referenceType ?? "manual",
    referenceId: opts.referenceId ?? null,
    performedById: opts.performedBy?.id ?? null,
    performedByName: opts.performedBy?.name ?? null,
  });

  // fire-and-forget — never block the stock update on an email
  maybeSendLowStockAlert(part, previousQuantity, newQuantity).catch(() => {});

  return part.toObject({ virtuals: true });
}

export async function restockPartService(
  partId: number,
  quantity: number,
  reason: string | undefined,
  performedBy?: PerformedBy,
) {
  if (quantity <= 0) throw new Error("Restock quantity must be greater than 0");
  return adjustStock(partId, quantity, "restock", {
    reason: reason ?? "Manual restock",
    referenceType: "manual",
    performedBy,
  });
}

export async function consumePartService(
  partId: number,
  quantity: number,
  reason: string | undefined,
  performedBy?: PerformedBy,
  referenceType: "maintenance_request" | "manual" = "manual",
  referenceId?: number | null,
) {
  if (quantity <= 0) throw new Error("Consume quantity must be greater than 0");
  return adjustStock(partId, -quantity, "consume", {
    reason: reason ?? "Manual consumption",
    referenceType,
    referenceId,
    performedBy,
  });
}

export async function adjustPartQuantityService(
  partId: number,
  newQuantity: number,
  reason: string | undefined,
  performedBy?: PerformedBy,
) {
  const part = await PartModel.findOne({ id: partId });
  if (!part) return null;

  const delta = newQuantity - part.quantityOnHand;
  if (delta === 0) return part.toObject({ virtuals: true });

  return adjustStock(partId, delta, "adjustment", {
    reason: reason ?? "Manual count correction",
    referenceType: "manual",
    performedBy,
  });
}

// Used when multiple parts are consumed on a single work order — e.g. from
// maintenance.service.ts when a technician completes a repair. Stops at the
// first insufficient-stock error so nothing is partially deducted silently.
export async function consumePartsForRequest(
  requestId: number,
  items: { partId: number; quantity: number }[],
  performedBy?: PerformedBy,
) {
  const results = [];
  for (const item of items) {
    const updated = await consumePartService(
      item.partId,
      item.quantity,
      `Used on maintenance request #${requestId}`,
      performedBy,
      "maintenance_request",
      requestId,
    );
    results.push(updated);
  }
  return results;
}

// ─── Equipment linking ────────────────────────────────────────────────────────

export async function linkPartToEquipmentService(partId: number, equipmentId: number) {
  return PartModel.findOneAndUpdate(
    { id: partId },
    { $addToSet: { linkedEquipmentIds: equipmentId } },
    { new: true },
  );
}

export async function unlinkPartFromEquipmentService(partId: number, equipmentId: number) {
  return PartModel.findOneAndUpdate(
    { id: partId },
    { $pull: { linkedEquipmentIds: equipmentId } },
    { new: true },
  );
}

export function findPart(part: IPartDocument | null) {
  return part;
}