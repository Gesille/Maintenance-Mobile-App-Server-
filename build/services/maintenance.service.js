import EquipmentModel from "../models/equipment.model.js";
import MaintenanceRequestModel from "../models/Maintenancerequest.model.js";
import MaintenanceMessageModel from "../models/MaintenanceMessage.model.js";
import sendMail from "../utils/sendMail.js";
// ─── Stage derivation ─────────────────────────────────────────────────────────
// There's no separate "stage" collection in Mongo — status IS the stage.
// This gives the frontend a stable, ordered list to render as kanban columns.
const STAGE_MAP = {
    new: { id: 1, name: "New", sequence: 1, isfold: false },
    under_repair: { id: 2, name: "Under Repair", sequence: 2, isfold: false },
    done: { id: 3, name: "Done", sequence: 3, isfold: true },
    cancel: { id: 4, name: "Cancelled", sequence: 4, isfold: true },
};
export const ALL_STAGES = Object.values(STAGE_MAP);
// ─── Transform: Mongoose doc → frontend DTO ──────────────────────────────────
function computeDuration(scheduleDate, closeDate) {
    if (!scheduleDate || !closeDate)
        return 0;
    const hours = (closeDate.getTime() - scheduleDate.getTime()) / (1000 * 60 * 60);
    return hours > 0 ? Math.round(hours * 10) / 10 : 0;
}
function transformRequest(r, equipmentMap) {
    const eq = equipmentMap.get(r.equipmentId) ?? null;
    return {
        id: r.id,
        name: r.name,
        description: r.description ?? null,
        priority: r.priority,
        state: r.status,
        maintenanceType: "Corrective", // no field backing this yet — every request is corrective for now
        stage: STAGE_MAP[r.status],
        equipment: eq
            ? {
                id: eq.id,
                name: eq.name,
                location: eq.usedInLocation ?? null,
                assetCode: eq.assetCode ?? null,
                serialNo: eq.serialNumber ?? null, // note: Equipment schema field is serialNumber, not serialNo
                model: eq.model ?? null,
                restaurant: eq.restaurant ?? null,
            }
            : null,
        category: eq?.category ? { id: 0, name: eq.category } : null,
        maintenanceTeam: eq?.maintenanceTeam ? { id: 0, name: eq.maintenanceTeam } : null,
        technicians: r.technicians ?? [],
        createdBy: r.reportedBy ? { id: 0, name: r.reportedBy } : null,
        createDate: r.createdAt ? new Date(r.createdAt).toISOString() : null,
        scheduleDate: r.scheduleDate ? new Date(r.scheduleDate).toISOString() : null,
        scheduleEnd: r.closeDate ? new Date(r.closeDate).toISOString() : null, // reuse closeDate as an estimate
        closeDate: r.closeDate ? new Date(r.closeDate).toISOString() : null,
        duration: computeDuration(r.scheduleDate, r.closeDate),
        isRecurring: false, // no recurrence support yet
        color: 0,
    };
}
async function buildEquipmentMap(equipmentIds) {
    const uniqueIds = [...new Set(equipmentIds)];
    const items = await EquipmentModel.find({ id: { $in: uniqueIds } }).lean();
    return new Map(items.map((eq) => [eq.id, eq]));
}
// ─── List / detail ────────────────────────────────────────────────────────────
export async function getMaintenanceRequests() {
    const requests = await MaintenanceRequestModel.find().sort({ createdAt: -1 }).lean();
    const equipmentMap = await buildEquipmentMap(requests.map((r) => r.equipmentId));
    return {
        requests: requests.map((r) => transformRequest(r, equipmentMap)),
        stages: ALL_STAGES,
        total: requests.length,
    };
}
export async function getMaintenanceRequestById(id) {
    const r = await MaintenanceRequestModel.findOne({ id }).lean();
    if (!r)
        return null;
    const equipmentMap = await buildEquipmentMap([r.equipmentId]);
    return transformRequest(r, equipmentMap);
}
// ─── Update / delete ────────────────────────────────────────────────────────
export async function updateMaintenanceRequestRecord(id, data) {
    const update = { ...data };
    if (data.status === "done") {
        update.closeDate = new Date();
    }
    else if (data.status) {
        update.closeDate = null;
    }
    return MaintenanceRequestModel.findOneAndUpdate({ id }, { $set: update }, { new: true });
}
export async function deleteMaintenanceRequestRecord(id) {
    return MaintenanceRequestModel.findOneAndDelete({ id });
}
// ─── Messages / comments ───────────────────────────────────────────────────────
export async function getRequestMessages(requestId) {
    const messages = await MaintenanceMessageModel.find({ requestId }).sort({ createdAt: 1 }).lean();
    return messages.map((m) => ({
        id: m._id.toString().length ? Number(m.id ?? 0) : 0,
        type: "comment",
        author: { id: 0, name: m.authorName },
        body: m.body,
        date: new Date(m.createdAt).toISOString(),
        isInternal: m.isInternal,
        parentId: null,
    }));
}
export async function postRequestComment(requestId, input) {
    const message = await MaintenanceMessageModel.create({
        requestId,
        body: input.body,
        authorName: input.authorName,
        isInternal: input.isInternal ?? false,
    });
    return {
        id: message._id.toString(),
        body: message.body,
        authorName: message.authorName,
        date: new Date(message.createdAt).toISOString(),
        isInternal: message.isInternal,
    };
}
export async function assignTechniciansService(requestId, technicians) {
    const request = await MaintenanceRequestModel.findOneAndUpdate({ id: requestId }, {
        $set: {
            technicians,
            status: "under_repair",
            closeDate: null,
        },
    }, { new: true });
    if (!request)
        return null;
    const equipment = await EquipmentModel.findOne({ id: request.equipmentId }).lean();
    // Send emails and WAIT for them — no more fire-and-forget
    for (const tech of technicians) {
        try {
            await sendMail({
                email: tech.email,
                subject: `🔧 New Repair Assigned: ${equipment?.name ?? "Equipment"} (#${request.id})`,
                template: "technician-assignment.ejs",
                data: {
                    technicianName: tech.name,
                    requestId: request.id,
                    requestName: request.name,
                    priority: request.priority,
                    description: request.description,
                    reportedBy: request.reportedBy,
                    reportedByEmail: request.reportedByEmail,
                    equipment: {
                        name: equipment?.name ?? "—",
                        assetCode: equipment?.assetCode ?? "—",
                        location: equipment?.usedInLocation ?? "—",
                        restaurant: equipment?.restaurant ?? "—",
                        model: equipment?.model ?? "—",
                        serialNumber: equipment?.serialNumber ?? "—",
                        category: equipment?.category ?? "—",
                        vendor: equipment?.vendor ?? "—",
                    },
                },
            });
            console.log(`✅ Email successfully sent to technician: ${tech.email}`);
        }
        catch (err) {
            console.error(`❌ Failed to send email to technician ${tech.email}:`, err.message);
            // Stop everything and throw — this will bubble up to the controller's catch block
            throw new Error(`Failed to send email to technician "${tech.name}" (${tech.email}): ${err.message}`);
        }
    }
    const equipmentMap = await buildEquipmentMap([request.equipmentId]);
    return transformRequest(request, equipmentMap);
}
