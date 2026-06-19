import { MAINTENANCE_REQUEST_FIELDS, STAGE_FIELDS, EQUIPMENT_FIELDS, MESSAGE_FIELDS } from "../@types/Maintenance.constants.js";
import { StageInfo, mapStage, MaintenanceRequest, mapRequest, MaintenanceMessage, mapMessage } from "../mapper/maintenance.mappers.js";
import { odooRequest } from "../odoo/odoo.client.js";


// ─── Helpers ─────────────────────────────────────────────────────────────────

function uniqueIds(values: (number | undefined)[]): number[] {
  return [...new Set(values.filter((v): v is number => v !== undefined))];
}

// ─── Data fetchers ───────────────────────────────────────────────────────────

async function fetchRequests() {
  return odooRequest("maintenance.request", "search_read", [[]], {
    fields: MAINTENANCE_REQUEST_FIELDS,
    order: "create_date desc",
  });
}

async function fetchStages(): Promise<Map<number, StageInfo>> {
  const raw = await odooRequest("maintenance.stage", "search_read", [[]], {
    fields: STAGE_FIELDS,
    order: "sequence asc",
  });

  return new Map(raw.map((s: any) => [s.id, mapStage(s)]));
}

async function fetchEquipments(ids: number[]): Promise<Map<number, any>> {
  if (ids.length === 0) return new Map();

  const raw = await odooRequest(
    "maintenance.equipment",
    "search_read",
    [[["id", "in", ids]]],
    { fields: EQUIPMENT_FIELDS },
  );

  return new Map(raw.map((eq: any) => [eq.id, eq]));
}

async function fetchUsers(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();

  const raw = await odooRequest("res.users", "read", [ids], {
    fields: ["id", "name"],
  });

  return new Map(raw.map((u: any) => [u.id, u.name as string]));
}

async function fetchMessages(requestId: number) {
  return odooRequest(
    "mail.message",
    "search_read",
    [
      [
        ["res_id", "=", requestId],
        ["model", "=", "maintenance.request"],
        ["message_type", "in", ["comment", "email"]],
      ],
    ],
    { fields: MESSAGE_FIELDS, order: "date asc" },
  );
}

// ─── Service ─────────────────────────────────────────────────────────────────
export async function getMaintenanceRequestById(id: number) {
  const raw = await odooRequest(
    "maintenance.request",
    "search_read",
    [[["id", "=", id]]],
    { fields: MAINTENANCE_REQUEST_FIELDS },
  );
  return raw?.length ? raw[0] : null;
}
export interface MaintenanceListResult {
  requests: MaintenanceRequest[];
  stages: StageInfo[];
  total: number;
}
export interface UpdateRequestInput {
  stageId?: number;       // resolved Odoo stage ID
  technicianIds?: number[]; // replaces the many2many user_ids field
  scheduleDate?: string;
  priority?: string;
  closeDate?: string;
}
 
export async function updateMaintenanceRequestRecord(
  id: number,
  input: UpdateRequestInput,
): Promise<void> {
  const values: Record<string, any> = {};
 
  if (input.stageId !== undefined)  values.stage_id     = input.stageId;
  if (input.scheduleDate)           values.schedule_date = input.scheduleDate;
  if (input.priority)               values.priority      = input.priority;
  if (input.closeDate)              values.close_date    = input.closeDate;
 
  // Many2many replace: command 6 replaces the whole set
  if (input.technicianIds) {
    values.user_ids = [[6, 0, input.technicianIds]];
  }
 
  if (Object.keys(values).length === 0) return;
 
  await odooRequest("maintenance.request", "write", [[id], values]);
}
 
// ─── Delete a request ─────────────────────────────────────────────────────────
export async function deleteMaintenanceRequestRecord(id: number): Promise<void> {
  await odooRequest("maintenance.request", "unlink", [[id]]);
}
export async function getMaintenanceRequests(): Promise<MaintenanceListResult> {
  const [rawRequests, stageMap] = await Promise.all([
    fetchRequests(),
    fetchStages(),
  ]);

  const equipmentIds = uniqueIds(
    rawRequests.map((r: any) => r.equipment_id?.[0]),
  );
  const userIds = uniqueIds(
    rawRequests.flatMap((r: any) => (r.user_ids as number[]) ?? []),
  );

  const [equipmentMap, usersMap] = await Promise.all([
    fetchEquipments(equipmentIds),
    fetchUsers(userIds),
  ]);

  const requests = rawRequests.map((r: any) =>
    mapRequest(r, stageMap, equipmentMap, usersMap),
  );

  return {
    requests,
    stages: [...stageMap.values()],
    total: requests.length,
  };
}

export async function getRequestMessages(
  requestId: number,
): Promise<MaintenanceMessage[]> {
  const raw = await fetchMessages(requestId);

  return raw
    .map(mapMessage)
    .filter((m: MaintenanceMessage) => m.body.length > 0);
}

export interface PostCommentInput {
  body: string;
  authorName: string;
  isInternal?: boolean;
}

export interface PostCommentResult {
  id: number;
  body: string;
  authorName: string;
  date: string;
  isInternal: boolean;
}

export async function postRequestComment(
  requestId: number,
  input: PostCommentInput,
): Promise<PostCommentResult> {
  const { body, authorName, isInternal = false } = input;

  const messageId = await odooRequest(
    "maintenance.request",
    "message_post",
    [[requestId]],
    {
      body: `<p>${body}</p>`,
      message_type: "comment",
      subtype_xmlid: isInternal ? "mail.mt_note" : "mail.mt_comment",
    },
  );

  return {
    id: messageId,
    body,
    authorName,
    date: new Date().toISOString(),
    isInternal,
  };
}

