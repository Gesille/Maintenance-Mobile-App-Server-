import mongoose, { Schema } from "mongoose";
const maintenanceMessageSchema = new Schema({
    requestId: { type: Number, required: true, index: true },
    body: { type: String, required: true },
    authorName: { type: String, required: true },
    isInternal: { type: Boolean, default: false },
}, { timestamps: true });
const MaintenanceMessageModel = mongoose.models.MaintenanceMessage ||
    mongoose.model("MaintenanceMessage", maintenanceMessageSchema);
export default MaintenanceMessageModel;
