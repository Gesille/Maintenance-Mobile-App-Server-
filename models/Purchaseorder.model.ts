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


export type PurchaseOrderStatus =
  | "requested"
  | "declined"
  | "approved"
  | "ordered"
  | "partially_fulfilled"
  | "fulfilled"
  | "cancelled";

export const VALID_PO_STATUSES: PurchaseOrderStatus[] = [
  "requested",
  "declined",
  "approved",
  "ordered",
  "partially_fulfilled",
  "fulfilled",
  "cancelled",
];

export interface IPurchaseOrderItem {
  partId: number | null;     // null for one-off items not in the Parts inventory
  partName: string;
  isOneOff: boolean;
  quantityOrdered: number;
  quantityFulfilled: number;
  unitCost: number;
}

export interface IAdditionalCost {
  description: string;
  amount: number;
}

export interface IPurchaseOrder {
  id: number;
  poNumber: string;
  vendor: string | null;          // optional, same as MaintainX
  vendorContact: string | null;
  status: PurchaseOrderStatus;
  items: IPurchaseOrderItem[];
  taxAmount: number;
  additionalCosts: IAdditionalCost[];
  orderDate: Date | null;
  expectedDeliveryDate: Date | null;
  fulfilledDate: Date | null;
  notes: string | null;
  createdByName: string;
  createdByRole: string;          // "manager" (Administrator) or "Enduser"/"technician" (Full User)
  approvedByName: string | null;
  declineReason: string | null;
  active: boolean;
}

export interface IPurchaseOrderDocument extends Document, IPurchaseOrder {
  createdAt: Date;
  updatedAt: Date;
}

const purchaseOrderItemSchema = new Schema<IPurchaseOrderItem>(
  {
    partId: { type: Number, default: null },
    partName: { type: String, required: true },
    isOneOff: { type: Boolean, default: false },
    quantityOrdered: { type: Number, required: true, min: 1 },
    quantityFulfilled: { type: Number, default: 0, min: 0 },
    unitCost: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const additionalCostSchema = new Schema<IAdditionalCost>(
  {
    description: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const purchaseOrderSchema = new Schema<IPurchaseOrderDocument>(
  {
    id: { type: Number, unique: true, index: true },
    poNumber: { type: String, unique: true, index: true },
    vendor: { type: String, default: null },
    vendorContact: { type: String, default: null },
    status: {
      type: String,
      enum: VALID_PO_STATUSES,
      default: "requested",
      index: true,
    },
    items: { type: [purchaseOrderItemSchema], default: [] },
    taxAmount: { type: Number, default: 0, min: 0 },
    additionalCosts: { type: [additionalCostSchema], default: [] },
    orderDate: { type: Date, default: null },
    expectedDeliveryDate: { type: Date, default: null },
    fulfilledDate: { type: Date, default: null },
    notes: { type: String, default: null },
    createdByName: { type: String, required: true },
    createdByRole: { type: String, required: true },
    approvedByName: { type: String, default: null },
    declineReason: { type: String, default: null },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

// Computed, not stored — subtotal is just the line items; total layers on
// taxes and additional costs (shipping, etc.), same breakdown MaintainX shows.
purchaseOrderSchema.virtual("subtotal").get(function (this: IPurchaseOrderDocument) {
  return this.items.reduce((sum, item) => sum + item.quantityOrdered * item.unitCost, 0);
});

purchaseOrderSchema.virtual("totalCost").get(function (this: IPurchaseOrderDocument) {
  const subtotal = this.items.reduce((sum, item) => sum + item.quantityOrdered * item.unitCost, 0);
  const additional = this.additionalCosts.reduce((sum, c) => sum + c.amount, 0);
  return subtotal + this.taxAmount + additional;
});

purchaseOrderSchema.set("toObject", { virtuals: true });
purchaseOrderSchema.set("toJSON", { virtuals: true });

purchaseOrderSchema.pre("save", async function () {
  if (this.isNew && !this.id) {
    this.id = await getNextSequence("purchaseOrder");
  }
  if (this.isNew && !this.poNumber) {
    this.poNumber = `PO-${String(this.id).padStart(5, "0")}`;
  }
});

const PurchaseOrderModel: Model<IPurchaseOrderDocument> =
  mongoose.models.PurchaseOrder ||
  mongoose.model<IPurchaseOrderDocument>("PurchaseOrder", purchaseOrderSchema);

export default PurchaseOrderModel;