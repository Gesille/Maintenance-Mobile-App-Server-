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

// ─── Meter reading ────────────────────────────────────────────────────────
// Kept as its own collection (same reasoning as Part's stock-movement log):
// readings accumulate fast and are queried as a time series / graph, so they
// shouldn't live as a growing embedded array on the Meter document itself.

export type ReadingSource = "manual" | "api" | "sensor";

export interface IMeterReading {
  id: number;
  meterId: number;
  value: number;
  previousValue: number | null;   // snapshot of the meter's lastReadingValue at the time
  source: ReadingSource;
  recordedById: string | null;    // null for automated/API readings with no user
  recordedByName: string;
  note: string | null;

  // Trigger evaluation outcome for this specific reading
  triggeredWorkOrder: boolean;
  triggeredRequestId: number | null;   // MaintenanceRequest.id, if a work order was created
  matchedTriggerIds: string[];         // IMeterTrigger.id values that fired

  createdAt: Date;
}

export interface IMeterReadingDocument extends Document, IMeterReading {}

const meterReadingSchema = new Schema<IMeterReadingDocument>(
  {
    id: { type: Number, unique: true, index: true },
    meterId: { type: Number, required: true, index: true },
    value: { type: Number, required: true },
    previousValue: { type: Number, default: null },
    source: { type: String, enum: ["manual", "api", "sensor"], default: "manual" },
    recordedById: { type: String, default: null },
    recordedByName: { type: String, required: true },
    note: { type: String, default: null },

    triggeredWorkOrder: { type: Boolean, default: false },
    triggeredRequestId: { type: Number, default: null },
    matchedTriggerIds: { type: [String], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

meterReadingSchema.pre("save", async function () {
  if (this.isNew && !this.id) {
    this.id = await getNextSequence("meterReading");
  }
});

const MeterReadingModel: Model<IMeterReadingDocument> =
  mongoose.models.MeterReading ||
  mongoose.model<IMeterReadingDocument>("MeterReading", meterReadingSchema);

export default MeterReadingModel;