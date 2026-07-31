import mongoose, { Document, Model, Schema } from "mongoose";

export type MaintenanceStatus = "new" | "under_repair" | "done" | "cancel";
export const VALID_STATUSES: MaintenanceStatus[] = ["new", "under_repair", "done", "cancel"];

export interface IMaintenanceMedia {
  url: string;
  public_id: string | null;
  type: "image" | "video";
}

export interface ITechnicianRef {
  id: string;
  name: string;
  email: string;
}

// ─── Checklist types ──────────────────────────────────────────────────────
export interface IChecklistItem {
  id: string;
  label: string;
  checked: boolean;
}

export interface IChecklist {
  items: IChecklistItem[];
  result: "pass" | "flag" | "fail" | null;
  signatureUrl: string | null;
  signaturePublicId: string | null;
  completedAt: Date | null;
  completedBy: string | null;
}

export const DEFAULT_CHECKLIST_ITEMS: IChecklistItem[] = [
  { id: "c1", label: "Inspect surroundings for leaks, sounds, damage", checked: false },
  { id: "c2", label: "Isolate and lockout/tagout compressor", checked: false },
];

export interface IMaintenanceRequest extends Document {
  id: number;
  name: string;
  equipmentId: number;
  priority: string;
  description: string;
  reportedBy: string;
  reportedByEmail: string;
  status: MaintenanceStatus;
  source: "reactive" | "repeatable";
  technicians: ITechnicianRef[];
  scheduleDate: Date | null;
  closeDate: Date | null;
  media: IMaintenanceMedia[];
  checklist: IChecklist;               // ← this was missing
  createdAt: Date;
  updatedAt: Date;
}

// ─── Auto-increment counter ────────────────────────────────────────────────
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

const mediaSchema = new Schema<IMaintenanceMedia>(
  {
    url: { type: String, required: true },
    public_id: { type: String, default: null },
    type: { type: String, enum: ["image", "video"], required: true },
  },
  { _id: false },
);

const technicianSchema = new Schema<ITechnicianRef>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
  },
  { _id: false },
);

// ─── Checklist sub-schemas ─────────────────────────────────────────────────
const checklistItemSchema = new Schema<IChecklistItem>(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    checked: { type: Boolean, default: false },
  },
  { _id: false },
);

const checklistSchema = new Schema<IChecklist>(
  {
    items: { type: [checklistItemSchema], default: () => DEFAULT_CHECKLIST_ITEMS },
    result: { type: String, enum: ["pass", "flag", "fail", null], default: null },
    signatureUrl: { type: String, default: null },
    signaturePublicId: { type: String, default: null },
    completedAt: { type: Date, default: null },
    completedBy: { type: String, default: null },
  },
  { _id: false },
);

const maintenanceRequestSchema = new Schema<IMaintenanceRequest>(
  {
    id: { type: Number, unique: true, index: true },
    name: { type: String, required: true },
    equipmentId: { type: Number, required: true, index: true },
    priority: { type: String, required: true },
    description: { type: String, required: true },
    reportedBy: { type: String, required: true },
    reportedByEmail: { type: String, required: true },
    status: {
      type: String,
      enum: ["new", "under_repair", "done", "cancel"],
      default: "new",
      index: true,
    },
    source: {
      type: String,
      enum: ["reactive", "repeatable"],
      default: "reactive",
      index: true,
    },
    technicians: { type: [technicianSchema], default: [] },
    scheduleDate: { type: Date, default: null },
    closeDate: { type: Date, default: null },
    media: { type: [mediaSchema], default: [] },
    checklist: { type: checklistSchema, default: () => ({ items: DEFAULT_CHECKLIST_ITEMS }) }, // ← this was missing
  },
  { timestamps: true },
);

maintenanceRequestSchema.pre("save", async function () {
  if (this.isNew && !this.id) {
    this.id = await getNextSequence("maintenanceRequest");
  }
});

const MaintenanceRequestModel: Model<IMaintenanceRequest> =
  mongoose.models.MaintenanceRequest ||
  mongoose.model<IMaintenanceRequest>("MaintenanceRequest", maintenanceRequestSchema);

export default MaintenanceRequestModel;