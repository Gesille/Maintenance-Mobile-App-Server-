import mongoose, { Schema } from "mongoose";
export const VALID_STATUSES = ["new", "under_repair", "done", "cancel"];
const counterSchema = new Schema({
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
});
const CounterModel = mongoose.models.Counter || mongoose.model("Counter", counterSchema);
async function getNextSequence(name) {
    const counter = await CounterModel.findByIdAndUpdate(name, { $inc: { seq: 1 } }, { new: true, upsert: true });
    return counter.seq;
}
const mediaSchema = new Schema({
    url: { type: String, required: true },
    public_id: { type: String, default: null },
    type: { type: String, enum: ["image", "video"], required: true },
}, { _id: false });
const technicianSchema = new Schema({
    id: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
}, { _id: false });
const maintenanceRequestSchema = new Schema({
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
    technicians: { type: [technicianSchema], default: [] },
    scheduleDate: { type: Date, default: null },
    closeDate: { type: Date, default: null },
    media: { type: [mediaSchema], default: [] },
}, { timestamps: true });
maintenanceRequestSchema.pre("save", async function () {
    if (this.isNew && !this.id) {
        this.id = await getNextSequence("maintenanceRequest");
    }
});
const MaintenanceRequestModel = mongoose.models.MaintenanceRequest ||
    mongoose.model("MaintenanceRequest", maintenanceRequestSchema);
export default MaintenanceRequestModel;
