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

// ─── Category 

export interface ICategory {
  id: number;
  name: string;
  icon: string;       // lucide icon name, e.g. "AlertTriangle", "Zap", "Wrench"
  color: string;       // hex, e.g. "#F97316"
  description: string | null;
  createdByName: string;
  active: boolean;
}

export interface ICategoryDocument extends Document, ICategory {}

const categorySchema = new Schema<ICategoryDocument>(
  {
    id: { type: Number, unique: true, index: true },
    name: { type: String, required: true, unique: true, trim: true },
    icon: { type: String, default: "Tag" },
    color: { type: String, default: "#6366F1" },
    description: { type: String, default: null },
    createdByName: { type: String, required: true },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

categorySchema.pre("save", async function () {
  if (this.isNew && !this.id) {
    this.id = await getNextSequence("category");
  }
});

const CategoryModel: Model<ICategoryDocument> =
  mongoose.models.Category || mongoose.model<ICategoryDocument>("Category", categorySchema);

export default CategoryModel;