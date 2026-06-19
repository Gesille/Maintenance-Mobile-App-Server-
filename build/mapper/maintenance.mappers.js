// ─── Domain types ────────────────────────────────────────────────────────────
import { PRIORITY_LABEL } from "../@types/Maintenance.constants.js";
// ─── Helpers ─────────────────────────────────────────────────────────────────
export function deriveState(stageName, isFold) {
    if (isFold)
        return "done";
    const lower = stageName.toLowerCase();
    if (lower.includes("progress") ||
        lower.includes("repair") ||
        lower.includes("wip") ||
        lower.includes("ongoing")) {
        return "under_repair";
    }
    if (lower.includes("cancel") || lower.includes("reject")) {
        return "cancel";
    }
    return "new";
}
export function stripHtml(html) {
    if (!html)
        return "";
    return html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}
// ─── Mappers ──────────────────────────────────────────────────────────────────
export function mapStage(raw) {
    return {
        id: raw.id,
        name: raw.name,
        sequence: raw.sequence ?? 0,
        isfold: raw.fold ?? false,
    };
}
export function mapEquipment(raw) {
    return {
        id: raw.id,
        name: raw.name,
        location: raw.x_location || null,
        assetCode: raw.x_asset_code ?? null,
        serialNo: raw.serial_no ?? null,
        model: raw.model ?? null,
    };
}
export function mapRequest(raw, stageMap, equipmentMap, usersMap) {
    const stageId = Array.isArray(raw.stage_id)
        ? raw.stage_id[0]
        : raw.stage_id;
    const stageFallbackName = Array.isArray(raw.stage_id)
        ? raw.stage_id[1]
        : "";
    const stageInfo = stageMap.get(stageId);
    const resolvedStageName = stageInfo?.name ?? stageFallbackName;
    const isFold = stageInfo?.isfold ?? false;
    const equipmentRaw = equipmentMap.get(raw.equipment_id?.[0]);
    return {
        id: raw.id,
        name: raw.name,
        description: raw.description || null,
        priority: PRIORITY_LABEL[raw.priority] ?? "Normal",
        state: deriveState(resolvedStageName, isFold),
        maintenanceType: raw.maintenance_type,
        stage: {
            id: stageId,
            name: resolvedStageName,
            isfold: isFold,
            sequence: stageInfo?.sequence ?? 0,
        },
        equipment: equipmentRaw ? mapEquipment(equipmentRaw) : null,
        category: raw.category_id
            ? { id: raw.category_id[0], name: raw.category_id[1] }
            : null,
        maintenanceTeam: raw.maintenance_team_id
            ? { id: raw.maintenance_team_id[0], name: raw.maintenance_team_id[1] }
            : null,
        technicians: (raw.user_ids ?? []).map((id) => ({
            id,
            name: usersMap.get(id) ?? `User ${id}`,
        })),
        createdBy: raw.owner_user_id
            ? { id: raw.owner_user_id[0], name: raw.owner_user_id[1] }
            : null,
        createDate: raw.create_date || null,
        scheduleDate: raw.schedule_date || null,
        scheduleEnd: raw.schedule_end || null,
        closeDate: raw.close_date || null,
        duration: raw.duration ?? 0,
        isRecurring: raw.recurring_maintenance ?? false,
        color: raw.color ?? 0,
    };
}
export function mapMessage(raw) {
    return {
        id: raw.id,
        type: "comment",
        author: raw.author_id
            ? { id: raw.author_id[0], name: raw.author_id[1] }
            : null,
        body: stripHtml(raw.body),
        date: raw.date,
        isInternal: raw.subtype_id?.[1]?.toLowerCase().includes("note") ?? false,
        parentId: raw.parent_id ? raw.parent_id[0] : null,
    };
}
