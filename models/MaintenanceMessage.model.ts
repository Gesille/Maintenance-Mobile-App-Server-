import mongoose, { Document, Model, Schema } from "mongoose";

export interface IMaintenanceMessage extends Document {
  requestId: number;
  body: string;
  authorName: string;
  isInternal: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const maintenanceMessageSchema = new Schema<IMaintenanceMessage>(
  {
    requestId: { type: Number, required: true, index: true },
    body: { type: String, required: true },
    authorName: { type: String, required: true },
    isInternal: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const MaintenanceMessageModel: Model<IMaintenanceMessage> =
  mongoose.models.MaintenanceMessage ||
  mongoose.model<IMaintenanceMessage>("MaintenanceMessage", maintenanceMessageSchema);

export default MaintenanceMessageModel;