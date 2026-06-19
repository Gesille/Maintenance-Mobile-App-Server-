import { MAINTENANCE_REQUEST_FIELDS, STAGE_FIELDS, EQUIPMENT_FIELDS, MESSAGE_FIELDS } from "../@types/Maintenance.constants.js";
import { mapStage, mapRequest, mapMessage } from "../mapper/maintenance.mappers.js";
import { odooRequest } from "../odoo/odoo.client.js";
// ─── Helpers ─────────────────────────────────────────────────────────────────
function uniqueIds(values) {
    return [...new Set(values.filter((v) => v !== undefined))];
}
// ─── Data fetchers ───────────────────────────────────────────────────────────
async function fetchRequests() {
    return odooRequest("maintenance.request", "search_read", [[]], {
        fields: MAINTENANCE_REQUEST_FIELDS,
        order: "create_date desc",
    });
}
async function fetchStages() {
    const raw = await odooRequest("maintenance.stage", "search_read", [[]], {
        fields: STAGE_FIELDS,
        order: "sequence asc",
    });
    return new Map(raw.map((s) => [s.id, mapStage(s)]));
}
async function fetchEquipments(ids) {
    if (ids.length === 0)
        return new Map();
    const raw = await odooRequest("maintenance.equipment", "search_read", [[["id", "in", ids]]], { fields: EQUIPMENT_FIELDS });
    return new Map(raw.map((eq) => [eq.id, eq]));
}
async function fetchUsers(ids) {
    if (ids.length === 0)
        return new Map();
    const raw = await odooRequest("res.users", "read", [ids], {
        fields: ["id", "name"],
    });
    return new Map(raw.map((u) => [u.id, u.name]));
}
async function fetchMessages(requestId) {
    return odooRequest("mail.message", "search_read", [
        [
            ["res_id", "=", requestId],
            ["model", "=", "maintenance.request"],
            ["message_type", "in", ["comment", "email"]],
        ],
    ], { fields: MESSAGE_FIELDS, order: "date asc" });
}
// ─── Service ─────────────────────────────────────────────────────────────────
export async function getMaintenanceRequestById(id) {
    const raw = await odooRequest("maintenance.request", "search_read", [[["id", "=", id]]], { fields: MAINTENANCE_REQUEST_FIELDS });
    return raw?.length ? raw[0] : null;
}
export async function updateMaintenanceRequestRecord(id, input) {
    const values = {};
    if (input.stageId !== undefined)
        values.stage_id = input.stageId;
    if (input.scheduleDate)
        values.schedule_date = input.scheduleDate;
    if (input.priority)
        values.priority = input.priority;
    if (input.closeDate)
        values.close_date = input.closeDate;
    // Many2many replace: command 6 replaces the whole set
    if (input.technicianIds) {
        values.user_ids = [[6, 0, input.technicianIds]];
    }
    if (Object.keys(values).length === 0)
        return;
    await odooRequest("maintenance.request", "write", [[id], values]);
}
// ─── Delete a request ─────────────────────────────────────────────────────────
export async function deleteMaintenanceRequestRecord(id) {
    await odooRequest("maintenance.request", "unlink", [[id]]);
}
export async function getMaintenanceRequests() {
    const [rawRequests, stageMap] = await Promise.all([
        fetchRequests(),
        fetchStages(),
    ]);
    const equipmentIds = uniqueIds(rawRequests.map((r) => r.equipment_id?.[0]));
    const userIds = uniqueIds(rawRequests.flatMap((r) => r.user_ids ?? []));
    const [equipmentMap, usersMap] = await Promise.all([
        fetchEquipments(equipmentIds),
        fetchUsers(userIds),
    ]);
    const requests = rawRequests.map((r) => mapRequest(r, stageMap, equipmentMap, usersMap));
    return {
        requests,
        stages: [...stageMap.values()],
        total: requests.length,
    };
}
export async function getRequestMessages(requestId) {
    const raw = await fetchMessages(requestId);
    return raw
        .map(mapMessage)
        .filter((m) => m.body.length > 0);
}
export async function postRequestComment(requestId, input) {
    const { body, authorName, isInternal = false } = input;
    const messageId = await odooRequest("maintenance.request", "message_post", [[requestId]], {
        body: `<p>${body}</p>`,
        message_type: "comment",
        subtype_xmlid: isInternal ? "mail.mt_note" : "mail.mt_comment",
    });
    return {
        id: messageId,
        body,
        authorName,
        date: new Date().toISOString(),
        isInternal,
    };
}
