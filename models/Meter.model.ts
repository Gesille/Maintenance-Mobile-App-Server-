import mongoose, { Document, Model, Schema } from "mongoose";

// ─── Auto-increment counter (same shared pattern as Equipment / Part / MaintenanceRequest) ───

interface ICounter extends Omit<Document, "_id"> {
  _id: string;
  seq: number;
}

const counterSchema = new Schema<ICounter>({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

const CounterModel: Model<ICounter> =
  mongoose.models.Counter || mongoose.model<ICounter>("Counter", counterSchema);

async function getNextSequence(name: string): Promise<number> {
  const counter = await CounterModel.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  );
  return counter.seq;
}

// ─── Meter ────────────────────────────────────────────────────────────────

// "manual" = a technician records the value by hand (MaintainX: Manual meter).
// "automated" = readings arrive via API/sensor integration (MaintainX: Automated meter,
// web-app only).
export type MeterType = "manual" | "automated";

// "cumulative" = value only ever goes up (odometer, run-hours, cycle count).
//   Readings lower than the last recorded value are rejected.
// "gauge" = value fluctuates freely (temperature, pressure, tank level).
export type MeterReadingType = "cumulative" | "gauge";

// Mirrors MaintainX's meter status badge:
// pending   -> no reading has ever been recorded
// stable    -> last reading was within all trigger thresholds
// triggered -> last reading tripped at least one trigger and created a work order
export type MeterStatus = "pending" | "stable" | "triggered";

export type TriggerOperator = "gte" | "lte" | "eq" | "between" | "increased_by";

export interface ITechnicianRef {
  id: string;
  name: string;
  email: string;
}

// One condition -> one action, same shape as a MaintainX "Work Order Trigger".
export interface IMeterTrigger {
  id: string;              // short unique id, e.g. "t1" — referenced in reading history
  label: string;           // human name, e.g. "Overheat warning"
  operator: TriggerOperator;
  value: number;           // threshold (or "increase since last reading" amount for increased_by)
  valueMax: number | null; // only used when operator === "between"
  active: boolean;

  // Action taken when the condition is met
  createWorkOrder: boolean;
  workOrderPriority: string;         // e.g. "high" — same priority values maintenance requests use
  workOrderDescription: string;      // template; meter name/value are appended automatically
  assignTechnicians: ITechnicianRef[];
  notifyEmails: string[];            // extra recipients beyond the assigned technicians
}

export interface IMeter {
  id: number;
  name: string;
  equipmentId: number;
  equipmentName: string | null;   // snapshot, avoids a join on every list render
  unit: string;                   // free text, e.g. "hours", "miles", "psi", "°F"
  meterType: MeterType;
  readingType: MeterReadingType;
  description: string | null;

  lastReadingValue: number | null;
  lastReadingAt: Date | null;
  status: MeterStatus;

  triggers: IMeterTrigger[];

  createdByName: string;
  active: boolean;
}

export interface IMeterDocument extends Document, IMeter {
  createdAt: Date;
  updatedAt: Date;
}

const technicianSchema = new Schema<ITechnicianRef>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
  },
  { _id: false },
);

const triggerSchema = new Schema<IMeterTrigger>(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    operator: {
      type: String,
      enum: ["gte", "lte", "eq", "between", "increased_by"],
      required: true,
    },
    value: { type: Number, required: true },
    valueMax: { type: Number, default: null },
    active: { type: Boolean, default: true },

    createWorkOrder: { type: Boolean, default: true },
    workOrderPriority: { type: String, default: "medium" },
    workOrderDescription: { type: String, default: "" },
    assignTechnicians: { type: [technicianSchema], default: [] },
    notifyEmails: { type: [String], default: [] },
  },
  { _id: false },
);

const meterSchema = new Schema<IMeterDocument>(
  {
    id: { type: Number, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    equipmentId: { type: Number, required: true, index: true },
    equipmentName: { type: String, default: null },
    unit: { type: String, required: true },
    meterType: { type: String, enum: ["manual", "automated"], default: "manual" },
    readingType: { type: String, enum: ["cumulative", "gauge"], default: "gauge" },
    description: { type: String, default: null },

    lastReadingValue: { type: Number, default: null },
    lastReadingAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["pending", "stable", "triggered"],
      default: "pending",
      index: true,
    },

    triggers: { type: [triggerSchema], default: [] },

    createdByName: { type: String, required: true },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

meterSchema.pre("save", async function () {
  if (this.isNew && !this.id) {
    this.id = await getNextSequence("meter");
  }
});

const MeterModel: Model<IMeterDocument> =
  mongoose.models.Meter || mongoose.model<IMeterDocument>("Meter", meterSchema);

export default MeterModel;