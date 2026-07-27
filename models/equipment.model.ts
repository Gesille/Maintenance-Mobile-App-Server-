import mongoose, { Document, Model, Schema } from "mongoose";

// ─── Auto-increment counter (shared pattern with MaintenanceRequestModel) ───

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

export interface IEquipment {
  id: number;
  name: string;
  category: string | null;
  maintenanceTeam: string | null;
  technician: string | null;
  owner: string | null;
  assignedDate: string | null;
  scrapDate: string | null;
  usedInLocation: string | null;
  restaurant: string | null;
  assetCode: string | null;
  reference: string | null;
  vendor: string | null;
  vendorReference: string | null;
  model: string | null;
  serialNumber: string | null;
  effectiveDate: string | null;
  cost: number;
  warrantyExpirationDate: string | null;
  description: string | null;
  active?: boolean;
}

export interface IEquipmentDocument extends Omit<Document, "model">, IEquipment {}

const equipmentSchema = new Schema<IEquipmentDocument>(
  {
    id: { type: Number, unique: true, index: true },
    name: { type: String, required: true },
    category: { type: String, default: null },
    maintenanceTeam: { type: String, default: null },
    technician: { type: String, default: null },
    owner: { type: String, default: null },
    assignedDate: { type: String, default: null },
    scrapDate: { type: String, default: null },
    usedInLocation: { type: String, default: null },
    restaurant: { type: String, default: null },
    assetCode: { type: String, default: null },
    reference: { type: String, default: null },
    vendor: { type: String, default: null },
    vendorReference: { type: String, default: null },
    model: { type: String, default: null },
    serialNumber: { type: String, default: null },
    effectiveDate: { type: String, default: null },
    cost: { type: Number, default: 0 },
    warrantyExpirationDate: { type: String, default: null },
    description: { type: String, default: null },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

equipmentSchema.pre("save", async function (next) {
  try {
    if (this.isNew && !this.id) {
      this.id = await getNextSequence("equipment");
    }
  
  } catch (err) {
  
  }
});

const EquipmentModel: Model<IEquipmentDocument> =
  mongoose.models.Equipment || mongoose.model<IEquipmentDocument>("Equipment", equipmentSchema);

export default EquipmentModel;