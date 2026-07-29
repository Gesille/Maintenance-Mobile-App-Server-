import mongoose, { Schema } from "mongoose";
const counterSchema = new Schema({
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
});
const CounterModel = mongoose.models.Counter || mongoose.model("Counter", counterSchema);
async function getNextSequence(name) {
    const counter = await CounterModel.findByIdAndUpdate(name, { $inc: { seq: 1 } }, { new: true, upsert: true });
    return counter.seq;
}
const equipmentSchema = new Schema({
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
    qrCodeUrl: { type: String, default: null },
    qrPublicId: { type: String, default: null },
    qrGenerated: { type: Boolean, default: false, index: true },
}, { timestamps: true });
equipmentSchema.pre("save", async function () {
    try {
        if (this.isNew && !this.id) {
            this.id = await getNextSequence("equipment");
        }
    }
    catch (err) {
        throw err;
    }
});
const EquipmentModel = mongoose.models.Equipment || mongoose.model("Equipment", equipmentSchema);
export default EquipmentModel;
