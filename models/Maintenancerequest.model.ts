import mongoose, { Document, Model, Schema } from "mongoose";

export type MaintenanceStatus = "new" | "under_repair" | "done" | "cancel" |"pending_review";
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
export interface IReviewCriteria {
  professionalism: number; // 1-5
  communication: number;   // 1-5
  quality: number;         // 1-5
}

export interface IPerformanceReview {
  criteria: IReviewCriteria | null;
  overallRating: number | null; // 1-5
  comment: string | null;
  signatureUrl: string | null;
  signaturePublicId: string | null;
  ratedAt: Date | null;
  ratedBy: string | null;
}


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
   technicianCompletedAt: Date | null;
  technicianCompletedBy: string | null;
  completionNotes: string | null;
  review: IPerformanceReview;           
  createdAt: Date;
  updatedAt: Date;
   partsUsed: IUsedPart[];
}

// ─── Auto-increment counter ────────────────────────────────────────────────
interface ICounter extends Omit<Document, "_id"> {
  _id: string;
  seq: number;
}
export interface IUsedPart {
  partId: number;
  partName: string | null;
  quantity: number;
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


const reviewCriteriaSchema = new Schema<IReviewCriteria>(
  {
    professionalism: { type: Number, min: 1, max: 5, required: true },
    communication: { type: Number, min: 1, max: 5, required: true },
    quality: { type: Number, min: 1, max: 5, required: true },
  },
  { _id: false },
);
const reviewSchema = new Schema<IPerformanceReview>(
  {
    criteria: { type: reviewCriteriaSchema, default: null },
    overallRating: { type: Number, min: 1, max: 5, default: null },
    comment: { type: String, default: null },
    signatureUrl: { type: String, default: null },
    signaturePublicId: { type: String, default: null },
    ratedAt: { type: Date, default: null },
    ratedBy: { type: String, default: null },
  },
  { _id: false },
);

const usedPartSchema = new Schema<IUsedPart>(
  {
    partId: {
      type: Number,
      required: true,
    },
    partName: {
      type: String,
      default: null,
    },
    quantity: {
      type: Number,
      required: true,
    },
  },
  { _id: false }
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
      enum: ["new", "under_repair","pending_review", "done", "cancel"],
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
      technicianCompletedAt: { type: Date, default: null },
    technicianCompletedBy: { type: String, default: null },
    completionNotes: { type: String, default: null },
    review: { type: reviewSchema, default: () => ({}) },
     partsUsed: {
   type: [usedPartSchema],
   default: [],
 },
    
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