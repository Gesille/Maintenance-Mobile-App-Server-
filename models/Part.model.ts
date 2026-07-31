import mongoose, { Document, Model, Schema } from "mongoose";

// ─── Auto-increment counter (shared pattern with Equipment / MaintenanceRequest) ───

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

// ─── Part ───────────────────────────────────────────────────────────────────

export interface IPart {
  id: number;
  name: string;
  partNumber: string | null;
  description: string | null;
  category: string | null;
  unitOfMeasure: string;
  quantityOnHand: number;
  minQuantity: number;
  reorderQuantity: number | null;
  unitCost: number;
  vendor: string | null;
  vendorPartNumber: string | null;
  location: string | null;
  barcode: string | null;
  linkedEquipmentIds: number[];
  active: boolean;
}

export interface IPartDocument extends Omit<Document, "model">, IPart {}

const partSchema = new Schema<IPartDocument>(
  {
    id: { type: Number, unique: true, index: true },
    name: { type: String, required: true },
    partNumber: { type: String, default: null, index: true },
    description: { type: String, default: null },
    category: { type: String, default: null, index: true },
    unitOfMeasure: { type: String, default: "pcs" },
    quantityOnHand: { type: Number, default: 0, min: 0 },
    minQuantity: { type: Number, default: 0, min: 0 },
    reorderQuantity: { type: Number, default: null },
    unitCost: { type: Number, default: 0 },
    vendor: { type: String, default: null },
    vendorPartNumber: { type: String, default: null },
    location: { type: String, default: null },
    barcode: { type: String, default: null },
    linkedEquipmentIds: { type: [Number], default: [], index: true },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

partSchema.pre("save", async function () {
  if (this.isNew && !this.id) {
    this.id = await getNextSequence("part");
  }
});

// Computed, not stored — lets the API/UI flag low stock without a stale field.
partSchema.virtual("isLowStock").get(function (this: IPartDocument) {
  return this.quantityOnHand <= this.minQuantity;
});
partSchema.set("toObject", { virtuals: true });
partSchema.set("toJSON", { virtuals: true });

const PartModel: Model<IPartDocument> =
  mongoose.models.Part || mongoose.model<IPartDocument>("Part", partSchema);

export default PartModel;

// ─── Stock movement (audit trail) ────────────────────────────────────────────
// Every change to quantityOnHand — restock, consumption on a work order, or a
// manual correction — writes one of these. This is what lets you show "stock
// history" for a part and reconcile counts later; nothing mutates
// quantityOnHand without leaving a record here.

export type StockMovementType = "restock" | "consume" | "adjustment" | "initial";
export const VALID_MOVEMENT_TYPES: StockMovementType[] = [
  "restock",
  "consume",
  "adjustment",
  "initial",
];

export interface IPartStockMovement extends Document {
  partId: number;
  type: StockMovementType;
  quantityDelta: number; // signed: +N for restock/initial, -N for consume
  previousQuantity: number;
  newQuantity: number;
  reason: string | null;
  referenceType: "maintenance_request" | "manual" | null;
  referenceId: number | null;
  performedById: string | null;
  performedByName: string | null;
  createdAt: Date;
}

const partStockMovementSchema = new Schema<IPartStockMovement>(
  {
    partId: { type: Number, required: true, index: true },
    type: { type: String, enum: VALID_MOVEMENT_TYPES, required: true },
    quantityDelta: { type: Number, required: true },
    previousQuantity: { type: Number, required: true },
    newQuantity: { type: Number, required: true },
    reason: { type: String, default: null },
    referenceType: {
      type: String,
      enum: ["maintenance_request", "manual", null],
      default: null,
    },
    referenceId: { type: Number, default: null },
    performedById: { type: String, default: null },
    performedByName: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const PartStockMovementModel: Model<IPartStockMovement> =
  mongoose.models.PartStockMovement ||
  mongoose.model<IPartStockMovement>("PartStockMovement", partStockMovementSchema);