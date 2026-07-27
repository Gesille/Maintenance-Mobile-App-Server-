
import EquipmentModel, { IEquipmentDocument } from "../models/equipment.model.js";
import MaintenanceMessageModel from "../models/MaintenanceMessage.model.js";
import MaintenanceRequestModel, { MaintenanceStatus, IMaintenanceRequest, ITechnicianRef, VALID_STATUSES } from "../models/Maintenancerequest.model.js";

// ─── Stages (static now — status lives directly on the request) ───────────────

export interface StageInfo {
  id: MaintenanceStatus;
  name: string;
  sequence: number;
}

export const STAGES: StageInfo[] = [
  { id: "new", name: "New", sequence: 1 },
  { id: "under_repair", name: "Under Repair", sequence: 2 },
  { id: "done", name: "Done", sequence: 3 },
  { id: "cancel", name: "Cancelled", sequence: 4 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uniqueIds(values: (number | undefined | null)[]): number[] {
  return [...new Set(values.filter((v): v is number => v !== undefined && v !== null))];
}

async function fetchEquipmentMap(ids: number[]): Promise<Map<number, IEquipmentDocument>> {
  if (ids.length === 0) return new Map();
  const raw = await EquipmentModel.find({ id: { $in: ids } }).lean();
  return new Map(raw.map((eq: any) => [eq.id, eq]));
}

function serializeRequest(
  doc: IMaintenanceRequest,
  equipmentMap: Map<number, IEquipmentDocument>,
) {
  const equipment = equipmentMap.get(doc.equipmentId) ?? null;
  return {
    id: doc.id,
    name: doc.name,
    equipmentId: doc.equipmentId,
    equipmentName: equipment?.name ?? null,
    priority: doc.priority,
    description: doc.description,
    reportedBy: doc.reportedBy,
    reportedByEmail: doc.reportedByEmail,
    status: doc.status,
    technicians: doc.technicians,
    scheduleDate: doc.scheduleDate,
    closeDate: doc.closeDate,
    media: doc.media,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export interface MaintenanceListResult {
  requests: ReturnType<typeof serializeRequest>[];
  stages: StageInfo[];
  total: number;
}

export async function getMaintenanceRequests(): Promise<MaintenanceListResult> {
  const rawRequests = await MaintenanceRequestModel.find({})
    .sort({ createdAt: -1 })
    .lean<IMaintenanceRequest[]>();

  const equipmentIds = uniqueIds(rawRequests.map((r) => r.equipmentId));
  const equipmentMap = await fetchEquipmentMap(equipmentIds);

  const requests = rawRequests.map((r) => serializeRequest(r, equipmentMap));

  return { requests, stages: STAGES, total: requests.length };
}

export async function getMaintenanceRequestById(id: number) {
  const doc = await MaintenanceRequestModel.findOne({ id }).lean<IMaintenanceRequest>();
  if (!doc) return null;

  const equipmentMap = await fetchEquipmentMap([doc.equipmentId]);
  return serializeRequest(doc, equipmentMap);
}

// ─── Update ──────────────────────────────────────────────────────────────────

export interface UpdateRequestInput {
  status?: MaintenanceStatus;
  technicians?: ITechnicianRef[];
  scheduleDate?: string;
  priority?: string;
  closeDate?: string;
}

export async function updateMaintenanceRequestRecord(
  id: number,
  input: UpdateRequestInput,
): Promise<void> {
  const values: Record<string, any> = {};

  if (input.status !== undefined) {
    if (!VALID_STATUSES.includes(input.status)) {
      throw new Error(`status must be one of: ${VALID_STATUSES.join(", ")}`);
    }
    values.status = input.status;
    if (input.status === "done") values.closeDate = new Date();
  }
  if (input.scheduleDate) values.scheduleDate = new Date(input.scheduleDate);
  if (input.priority) values.priority = input.priority;
  if (input.closeDate) values.closeDate = new Date(input.closeDate);
  if (input.technicians) values.technicians = input.technicians;

  if (Object.keys(values).length === 0) return;

  await MaintenanceRequestModel.updateOne({ id }, { $set: values });
}

// ─── Delete ──────────────────────────────────────────────────────────────────

export async function deleteMaintenanceRequestRecord(id: number): Promise<void> {
  await MaintenanceRequestModel.deleteOne({ id });
  await MaintenanceMessageModel.deleteMany({ requestId: id });
}

// ─── Messages / chatter ────────────────────────────────────────────────────────

export interface PostCommentInput {
  body: string;
  authorName: string;
  isInternal?: boolean;
}

export interface PostCommentResult {
  id: string;
  requestId: number;
  body: string;
  authorName: string;
  isInternal: boolean;
  date: string;
}

export async function getRequestMessages(requestId: number): Promise<PostCommentResult[]> {
  const raw = await MaintenanceMessageModel.find({ requestId })
    .sort({ createdAt: 1 })
    .lean();

  return raw.map((m: any) => ({
    id: String(m._id),
    requestId: m.requestId,
    body: m.body,
    authorName: m.authorName,
    isInternal: m.isInternal,
    date: m.createdAt.toISOString(),
  }));
}

export async function postRequestComment(
  requestId: number,
  input: PostCommentInput,
): Promise<PostCommentResult> {
  const { body, authorName, isInternal = false } = input;

  const doc = await MaintenanceMessageModel.create({
    requestId,
    body,
    authorName,
    isInternal,
  });

  return {
    id: String(doc._id),
    requestId,
    body: doc.body,
    authorName: doc.authorName,
    isInternal: doc.isInternal,
    date: doc.createdAt.toISOString(),
  };
}