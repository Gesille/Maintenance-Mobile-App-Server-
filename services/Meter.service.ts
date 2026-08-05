import MeterModel, { IMeterTrigger, ITechnicianRef, MeterReadingType, MeterType } from "../models/Meter.model.js";

import EquipmentModel from "../models/equipment.model.js";
import MaintenanceRequestModel from "../models/Maintenancerequest.model.js";
import sendMail from "../utils/sendMail.js";
import MeterReadingModel, { ReadingSource } from "../models/Meterreading.model.js";

// ─── Types ────────────────────────────────────────────────────────────────

export interface CreateMeterInput {
  name: string;
  equipmentId: number;
  unit: string;
  meterType?: MeterType;
  readingType?: MeterReadingType;
  description?: string | null;
  createdByName: string;
}

export interface UpdateMeterInput {
  name?: string;
  unit?: string;
  meterType?: MeterType;
  readingType?: MeterReadingType;
  description?: string | null;
}

export interface TriggerInput {
  label: string;
  operator: IMeterTrigger["operator"];
  value: number;
  valueMax?: number | null;
  active?: boolean;
  createWorkOrder?: boolean;
  workOrderPriority?: string;
  workOrderDescription?: string;
  assignTechnicians?: ITechnicianRef[];
  notifyEmails?: string[];
}

export interface MeterFilters {
  equipmentId?: number;
  status?: string;
  meterType?: string;
  search?: string;
}

// ─── Queries ────────────────────────────────────────────────────────────────

export async function fetchAllMeters(filters: MeterFilters = {}) {
  const { equipmentId, status, meterType, search } = filters;

  const query: Record<string, any> = { active: true };
  if (equipmentId) query.equipmentId = equipmentId;
  if (status) query.status = status;
  if (meterType) query.meterType = meterType;
  if (search) query.name = { $regex: search, $options: "i" };

  return MeterModel.find(query).sort({ name: 1 }).lean();
}

export async function fetchMeterById(id: number) {
  return MeterModel.findOne({ id }).lean();
}

// ─── Create / update / delete ────────────────────────────────────────────────

export async function createMeterService(input: CreateMeterInput) {
  const equipment = await EquipmentModel.findOne({ id: input.equipmentId, active: true }).lean();
  if (!equipment) throw new Error("Equipment not found");

  const meter = await MeterModel.create({
    name: input.name,
    equipmentId: input.equipmentId,
    equipmentName: equipment.name,
    unit: input.unit,
    meterType: input.meterType ?? "manual",
    readingType: input.readingType ?? "gauge",
    description: input.description ?? null,
    createdByName: input.createdByName,
    status: "pending",
    triggers: [],
  });

  return meter.toObject();
}

export async function updateMeterService(id: number, data: UpdateMeterInput) {
  const updated = await MeterModel.findOneAndUpdate(
    { id },
    { $set: data },
    { new: true, runValidators: true },
  );
  return updated; // null if not found
}

export async function deleteMeterService(id: number) {
  // Soft delete — same convention as Category/Equipment/PurchaseOrder; keeps
  // reading history intact for anything that references this meter.
  const deleted = await MeterModel.findOneAndUpdate(
    { id },
    { $set: { active: false } },
    { new: true },
  );
  return deleted;
}

// ─── Trigger management ──────────────────────────────────────────────────────
// Triggers live embedded on the Meter (small, bounded list) — unlike readings,
// which are unbounded and live in their own collection.

function makeTriggerId() {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export async function addTriggerService(meterId: number, input: TriggerInput) {
  if (input.operator === "between" && (input.valueMax === undefined || input.valueMax === null)) {
    throw new Error("valueMax is required when operator is 'between'");
  }

  const meter = await MeterModel.findOne({ id: meterId });
  if (!meter) return null;

  meter.triggers.push({
    id: makeTriggerId(),
    label: input.label,
    operator: input.operator,
    value: input.value,
    valueMax: input.valueMax ?? null,
    active: input.active ?? true,
    createWorkOrder: input.createWorkOrder ?? true,
    workOrderPriority: input.workOrderPriority ?? "medium",
    workOrderDescription: input.workOrderDescription ?? "",
    assignTechnicians: input.assignTechnicians ?? [],
    notifyEmails: input.notifyEmails ?? [],
  });

  await meter.save();
  return meter.toObject();
}

export async function updateTriggerService(
  meterId: number,
  triggerId: string,
  data: Partial<TriggerInput>,
) {
  const meter = await MeterModel.findOne({ id: meterId });
  if (!meter) return null;

  const trigger = meter.triggers.find((t) => t.id === triggerId);
  if (!trigger) throw new Error("Trigger not found on this meter");

  if (data.label !== undefined) trigger.label = data.label;
  if (data.operator !== undefined) trigger.operator = data.operator;
  if (data.value !== undefined) trigger.value = data.value;
  if (data.valueMax !== undefined) trigger.valueMax = data.valueMax;
  if (data.active !== undefined) trigger.active = data.active;
  if (data.createWorkOrder !== undefined) trigger.createWorkOrder = data.createWorkOrder;
  if (data.workOrderPriority !== undefined) trigger.workOrderPriority = data.workOrderPriority;
  if (data.workOrderDescription !== undefined) trigger.workOrderDescription = data.workOrderDescription;
  if (data.assignTechnicians !== undefined) trigger.assignTechnicians = data.assignTechnicians;
  if (data.notifyEmails !== undefined) trigger.notifyEmails = data.notifyEmails;

  await meter.save();
  return meter.toObject();
}

export async function removeTriggerService(meterId: number, triggerId: string) {
  const meter = await MeterModel.findOne({ id: meterId });
  if (!meter) return null;

  meter.triggers = meter.triggers.filter((t) => t.id !== triggerId) as any;
  await meter.save();
  return meter.toObject();
}

// ─── Trigger evaluation ───────────────────────────────────────────────────────

function triggerFires(trigger: IMeterTrigger, value: number, previousValue: number | null): boolean {
  if (!trigger.active) return false;

  switch (trigger.operator) {
    case "gte":
      return value >= trigger.value;
    case "lte":
      return value <= trigger.value;
    case "eq":
      return value === trigger.value;
    case "between":
      return trigger.valueMax !== null && value >= trigger.value && value <= trigger.valueMax;
    case "increased_by":
      return previousValue !== null && value - previousValue >= trigger.value;
    default:
      return false;
  }
}

async function createWorkOrderFromTrigger(
  meter: { id: number; name: string; equipmentId: number; equipmentName: string | null; unit: string },
  trigger: IMeterTrigger,
  readingValue: number,
) {
  const description =
    (trigger.workOrderDescription?.trim() ||
      `Auto-generated from meter trigger "${trigger.label}"`) +
    ` — ${meter.name} reading ${readingValue} ${meter.unit} on ${meter.equipmentName ?? "equipment"}.`;

  const requestName = `[Meter] ${trigger.label} — ${meter.equipmentName ?? meter.name}`;

  const request = await MaintenanceRequestModel.create({
    name: requestName,
    equipmentId: meter.equipmentId,
    priority: trigger.workOrderPriority,
    description,
    reportedBy: "Meter Automation",
    reportedByEmail: process.env.MAINTENANCE_EMAIL as string,
    status: "new",
    source: "reactive",
    technicians: trigger.assignTechnicians,
  });

  const recipientEmails = [
    ...trigger.assignTechnicians.map((t) => t.email),
    ...trigger.notifyEmails,
  ].filter(Boolean);

  if (recipientEmails.length) {
    for (const email of recipientEmails) {
      sendMail({
        email,
        subject: `Meter trigger fired: ${trigger.label}`,
        template: "meter-trigger.ejs",
        data: {
          meterName: meter.name,
          equipmentName: meter.equipmentName,
          triggerLabel: trigger.label,
          readingValue,
          unit: meter.unit,
          requestId: request.id,
          requestName,
        },
      }).catch((err: any) => console.error("[SMTP] Failed to send meter trigger email:", err.message));
    }
  }

  return request.id as number;
}

// ─── Record a reading ────────────────────────────────────────────────────────
// Mirrors MaintainX's "Record a Meter Reading" flow: validates the value,
// stores it, evaluates every active trigger, and rolls the meter's status
// forward to pending -> stable -> triggered.

export async function recordReadingService(
  meterId: number,
  value: number,
  actor: { id?: string; name?: string },
  options: { source?: ReadingSource; note?: string } = {},
) {
  const meter = await MeterModel.findOne({ id: meterId, active: true });
  if (!meter) return null;

  const previousValue = meter.lastReadingValue;

  if (meter.readingType === "cumulative" && previousValue !== null && value < previousValue) {
    throw new Error(
      `This is a cumulative meter — new reading (${value}) cannot be lower than the last reading (${previousValue})`,
    );
  }

  const matched = meter.triggers.filter((t) => triggerFires(t, value, previousValue));
  const firingTriggers = matched.filter((t) => t.createWorkOrder);

  let triggeredRequestId: number | null = null;
  for (const trigger of firingTriggers) {
    // One work order per reading is typical; first matching trigger wins.
    // (Remove this `if` guard if every matched trigger should open its own work order.)
    if (triggeredRequestId === null) {
      triggeredRequestId = await createWorkOrderFromTrigger(
        {
          id: meter.id,
          name: meter.name,
          equipmentId: meter.equipmentId,
          equipmentName: meter.equipmentName,
          unit: meter.unit,
        },
        trigger,
        value,
      );
    }
  }

  const reading = await MeterReadingModel.create({
    meterId: meter.id,
    value,
    previousValue,
    source: options.source ?? "manual",
    recordedById: actor.id ?? null,
    recordedByName: actor.name ?? "System",
    note: options.note ?? null,
    triggeredWorkOrder: matched.length > 0,
    triggeredRequestId,
    matchedTriggerIds: matched.map((t) => t.id),
  });

  meter.lastReadingValue = value;
  meter.lastReadingAt = new Date();
  meter.status = matched.length > 0 ? "triggered" : "stable";
  await meter.save();

  return {
    meter: meter.toObject(),
    reading: reading.toObject(),
  };
}

// ─── Reading history / chart data ────────────────────────────────────────────

export async function fetchReadingHistory(meterId: number, limit = 50) {
  return MeterReadingModel.find({ meterId }).sort({ createdAt: -1 }).limit(limit).lean();
}

export async function fetchReadingsForChart(meterId: number, startDate?: Date, endDate?: Date) {
  const query: Record<string, any> = { meterId };
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = startDate;
    if (endDate) query.createdAt.$lte = endDate;
  }

  return MeterReadingModel.find(query).sort({ createdAt: 1 }).select("value createdAt triggeredWorkOrder").lean();
}