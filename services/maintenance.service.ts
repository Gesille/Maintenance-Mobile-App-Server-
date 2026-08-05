import EquipmentModel from "../models/equipment.model.js";
import MaintenanceRequestModel, {
  
  IMaintenanceRequest,
  MaintenanceStatus,
} from "../models/Maintenancerequest.model.js";
import MaintenanceMessageModel from "../models/MaintenanceMessage.model.js";
import sendMail from "../utils/sendMail.js";
import { handleMediaUploads } from "./equipment.service.js";
import { consumePartsForRequest } from "./Part.service.js";
import { PRIORITY_MAP } from "../@types/equipment.constants.js";
import { uploadMedia } from "../utils/uploadImages.js";
import fs from "fs/promises";
import os from "os";
import path from "path";
// ─── Frontend-facing shapes (mirrors Maintenanceapi.ts on the frontend) ──────

export interface StageInfo {
  id: number;
  name: string;
  sequence: number;
  isfold: boolean;
}

export interface MaintenanceRequestDTO {
  id: number;
  name: string;
  description: string | null;
  priority: string;
  state: MaintenanceStatus;
  maintenanceType: string;
  stage: StageInfo;
  equipment: {
    id: number;
    name: string;
    location: { id: number; name: string } | string | null;
    assetCode: string | null;
    serialNo: string | null;
    model: string | null;
    restaurant: string | null;
  } | null;
  
  category: { id: number; name: string } | null;
  maintenanceTeam: { id: number; name: string } | null;
  technicians: { id: string; name: string }[];
  createdBy: { id: number; name: string } | null;
  createDate: string | null;
  scheduleDate: string | null;
  scheduleEnd: string | null;
  closeDate: string | null;
  duration: number;
  isRecurring: boolean;
  color: number;
  media: { url: string; type: "image" | "video" }[];
  technicianCompletedAt: string | null;
  technicianCompletedBy: string | null;
  completionNotes: string | null;
  review: {
    criteria: { professionalism: number; communication: number; quality: number } | null;
    overallRating: number | null;
    comment: string | null;
    signatureUrl: string | null;
    ratedAt: string | null;
    ratedBy: string | null;
  };
  partsUsed: {
    partId: number;
    partName: string | null;
    quantity: number;
  }[];
}

export interface MaintenanceMessageDTO {
  id: number;
  type: "comment";
  author: { id: number; name: string } | null;
  body: string;
  date: string;
  isInternal: boolean;
  parentId: number | null;
}

// ─── Stage derivation ─────────────────────────────────────────────────────────
const STAGE_MAP: Record<MaintenanceStatus, StageInfo> = {
  new: { id: 1, name: "New", sequence: 1, isfold: false },
  under_repair: { id: 2, name: "Under Repair", sequence: 2, isfold: false },
  pending_review: { id: 3, name: "Pending Review", sequence: 3, isfold: false },
  done: { id: 4, name: "Done", sequence: 4, isfold: true },
  cancel: { id: 5, name: "Cancelled", sequence: 5, isfold: true },
};

export const ALL_STAGES: StageInfo[] = Object.values(STAGE_MAP);

// ─── Transform: Mongoose doc → frontend DTO ──────────────────────────────────

function computeDuration(scheduleDate: Date | null, closeDate: Date | null): number {
  if (!scheduleDate || !closeDate) return 0;
  const hours = (closeDate.getTime() - scheduleDate.getTime()) / (1000 * 60 * 60);
  return hours > 0 ? Math.round(hours * 10) / 10 : 0;
}

function transformRequest(
  r: IMaintenanceRequest,
  equipmentMap: Map<number, any>,
): MaintenanceRequestDTO {
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
    createDate: (r as any).createdAt ? new Date((r as any).createdAt).toISOString() : null,
    scheduleDate: r.scheduleDate ? new Date(r.scheduleDate).toISOString() : null,
    scheduleEnd: r.closeDate ? new Date(r.closeDate).toISOString() : null, // reuse closeDate as an estimate
    closeDate: r.closeDate ? new Date(r.closeDate).toISOString() : null,
    duration: computeDuration(r.scheduleDate, r.closeDate),
    isRecurring: false, // no recurrence support yet
    color: 0,
    media: (r.media ?? []).map((m) => ({ url: m.url, type: m.type })),
    technicianCompletedAt: r.technicianCompletedAt ? new Date(r.technicianCompletedAt).toISOString() : null,
technicianCompletedBy: r.technicianCompletedBy ?? null,
completionNotes: r.completionNotes ?? null,
review: {
  criteria: r.review?.criteria ?? null,
  overallRating: r.review?.overallRating ?? null,
  comment: r.review?.comment ?? null,
  signatureUrl: r.review?.signatureUrl ?? null,
  ratedAt: r.review?.ratedAt ? new Date(r.review.ratedAt).toISOString() : null,
  ratedBy: r.review?.ratedBy ?? null,
},
    partsUsed: ((r as any).partsUsed ?? []).map((p: any) => ({
      partId: p.partId,
      partName: p.partName ?? null,
      quantity: p.quantity,
    })),
  };
}

async function buildEquipmentMap(equipmentIds: number[]) {
  const uniqueIds = [...new Set(equipmentIds)];
  const items = await EquipmentModel.find({ id: { $in: uniqueIds } }).lean();
  return new Map(items.map((eq) => [eq.id, eq]));
}

// ─── List / detail ────────────────────────────────────────────────────────────

export async function getMaintenanceRequests() {
  const requests = await MaintenanceRequestModel.find().sort({ createdAt: -1 }).lean();
  const equipmentMap = await buildEquipmentMap(requests.map((r) => r.equipmentId));

  return {
    requests: requests.map((r) => transformRequest(r as any, equipmentMap)),
    stages: ALL_STAGES,
    total: requests.length,
  };
}

export async function getMaintenanceRequestById(id: number) {
  const r = await MaintenanceRequestModel.findOne({ id }).lean();
  if (!r) return null;

  const equipmentMap = await buildEquipmentMap([r.equipmentId]);
  return transformRequest(r as any, equipmentMap);
}

// ─── Update / delete ────────────────────────────────────────────────────────
export async function updateMaintenanceRequestRecord(
  id: number,
  data: {
    status?: MaintenanceStatus;
    technicians?: { id: string; name: string; email: string }[];
    scheduleDate?: Date | null; // NEW
  },
) {
  const update: Record<string, any> = { ...data };

  if (data.status === "done") {
    update.closeDate = new Date();
  } else if (data.status) {
    update.closeDate = null;
  }

  return MaintenanceRequestModel.findOneAndUpdate({ id }, { $set: update }, { new: true });
}

// NEW — dedicated schedule setter, reused by the calendar's click-to-schedule
export async function setMaintenanceScheduleDate(id: number, scheduleDate: Date) {
  const updated = await MaintenanceRequestModel.findOneAndUpdate(
    { id },
    { $set: { scheduleDate } },
    { new: true },
  );
  if (!updated) return null;

  const equipmentMap = await buildEquipmentMap([updated.equipmentId]);
  return transformRequest(updated as any, equipmentMap);
}

export async function deleteMaintenanceRequestRecord(id: number) {
  return MaintenanceRequestModel.findOneAndDelete({ id });
}

// ─── Messages / comments ───────────────────────────────────────────────────────

export async function getRequestMessages(requestId: number): Promise<MaintenanceMessageDTO[]> {
  const messages = await MaintenanceMessageModel.find({ requestId }).sort({ createdAt: 1 }).lean();

  return messages.map((m) => ({
    id: (m._id as any).toString().length ? Number((m as any).id ?? 0) : 0,
    type: "comment" as const,
    author: { id: 0, name: m.authorName },
    body: m.body,
    date: new Date((m as any).createdAt).toISOString(),
    isInternal: m.isInternal,
    parentId: null,
  }));
}

export async function postRequestComment(
  requestId: number,
  input: { body: string; authorName: string; isInternal?: boolean },
) {
  const message = await MaintenanceMessageModel.create({
    requestId,
    body: input.body,
    authorName: input.authorName,
    isInternal: input.isInternal ?? false,
  });

  return {
    id: 0,
    type: "comment" as const,
    author: { id: 0, name: message.authorName },
    body: message.body,
    date: new Date((message as any).createdAt).toISOString(),
    isInternal: message.isInternal,
  };
}



export async function assignTechniciansService(
  requestId: number,
  technicians: { id: string; name: string; email: string }[],
) {
  const request = await MaintenanceRequestModel.findOneAndUpdate(
    { id: requestId },
    {
      $set: {
        technicians,
        status: "under_repair",
        closeDate: null,
      },
    },
    { new: true },
  );

  if (!request) return null;

  const equipment = await EquipmentModel.findOne({ id: request.equipmentId }).lean();
 const images = (request.media ?? []).filter((m) => m.type === "image");
  const videos = (request.media ?? []).filter((m) => m.type === "video");
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
           images, 
            videos, 
        },
      });

      console.log(`✅ Email successfully sent to technician: ${tech.email}`);
    } catch (err: any) {
      console.error(`❌ Failed to send email to technician ${tech.email}:`, err.message);
      // Stop everything and throw — this will bubble up to the controller's catch block
      throw new Error(`Failed to send email to technician "${tech.name}" (${tech.email}): ${err.message}`);
    }
  }

  const equipmentMap = await buildEquipmentMap([request.equipmentId]);
  return transformRequest(request as any, equipmentMap);
}

export interface CreateManagerRequestInput {
  equipmentId: number;
  priority: string;
  description: string;
  reportedBy: string;
  reportedByEmail: string;
  technicians?: { id: string; name: string; email: string }[];
  files?: Express.Multer.File[];
  jsonMedia?: { url: string; type: "image" | "video" }[];
}

// ─── Manager creates a work order directly (with optional technician assignment) ─

export async function createManagerMaintenanceRequest(input: CreateManagerRequestInput) {
  const { equipmentId, priority, description, reportedBy, reportedByEmail, technicians, files, jsonMedia } =
    input;

  const eq = await EquipmentModel.findOne({ id: equipmentId, active: true }).lean();
  if (!eq) return null;

  const media = await handleMediaUploads(files, jsonMedia);
  const requestName = `[${reportedBy}] Issue with ${eq.name}`;
  const hasTechnicians = !!technicians?.length;

  const request = await MaintenanceRequestModel.create({
    name: requestName,
    equipmentId: eq.id,
    priority: PRIORITY_MAP[priority] ?? priority,
    description,
    reportedBy,
    reportedByEmail,
    media,
    technicians: technicians ?? [],
    status: hasTechnicians ? "under_repair" : "new",
    source: "repeatable", 
  });

  // Technicians assigned right at creation → notify them immediately,
  // same email + media payload as assignTechniciansService
  if (hasTechnicians) {
    const images = media.filter((m) => m.type === "image");
    const videos = media.filter((m) => m.type === "video");

    for (const tech of technicians!) {
      try {
        await sendMail({
          email: tech.email,
          subject: `🔧 New Repair Assigned: ${eq.name} (#${request.id})`,
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
              name: eq.name ?? "—",
              assetCode: eq.assetCode ?? "—",
              location: eq.usedInLocation ?? "—",
              restaurant: eq.restaurant ?? "—",
              model: eq.model ?? "—",
              serialNumber: eq.serialNumber ?? "—",
              category: eq.category ?? "—",
              vendor: eq.vendor ?? "—",
            },
            images,
            videos,
          },
        });
        console.log(`✅ Email successfully sent to technician: ${tech.email}`);
      } catch (err: any) {
        console.error(`❌ Failed to send email to technician ${tech.email}:`, err.message);
        throw new Error(`Failed to send email to technician "${tech.name}" (${tech.email}): ${err.message}`);
      }
    }
  }

  const equipmentMap = await buildEquipmentMap([request.equipmentId]);
  return transformRequest(request as any, equipmentMap);
}

// ─── Technician: get only requests assigned to me ────────────────────────
export async function getMyMaintenanceRequests(technicianId: string) {
  const requests = await MaintenanceRequestModel.find({
    "technicians.id": technicianId,
  })
    .sort({ createdAt: -1 })
    .lean();

  const equipmentMap = await buildEquipmentMap(requests.map((r) => r.equipmentId));
  return {
    requests: requests.map((r) => transformRequest(r as any, equipmentMap)),
    total: requests.length,
  };
}

async function uploadSignatureImage(base64: string) {
  const cleaned = base64.replace(/^data:image\/\w+;base64,/, "");
  const tempPath = path.join(os.tmpdir(), `sig-${Date.now()}.png`);
  await fs.writeFile(tempPath, cleaned, "base64");
  try {
    const result = await uploadMedia(tempPath, "image");
    return { url: result.url, public_id: result.public_id };
  } finally {
    await fs.unlink(tempPath).catch(() => {});
  }
}
// ─── Technician: mark request complete → moves to pending_review ────────
export async function submitTechnicianCompletionService(
  requestId: number,
  technicianId: string,
  technicianName: string,
  completionNotes?: string,
) {
  const request = await MaintenanceRequestModel.findOne({ id: requestId });
  if (!request) return null;

  const isAssigned = request.technicians.some((t) => t.id === technicianId);
  if (!isAssigned) throw new Error("You are not assigned to this request");

  request.status = "pending_review";
  request.technicianCompletedAt = new Date();
  request.technicianCompletedBy = technicianName;
  if (completionNotes?.trim()) request.completionNotes = completionNotes.trim();

  await request.save();
  const equipmentMap = await buildEquipmentMap([request.equipmentId]);
  return transformRequest(request as any, equipmentMap);
}

// ─── User: submit performance review + signature → closes the request ───
export async function submitUserReviewService(
  requestId: number,
  userEmail: string,
  userName: string,
  input: {
    criteria: { professionalism: number; communication: number; quality: number };
    overallRating: number;
    comment?: string;
    signatureBase64: string;
  },
) {
  const request = await MaintenanceRequestModel.findOne({ id: requestId });
  if (!request) return null;

  if (request.reportedByEmail?.toLowerCase() !== userEmail?.toLowerCase()) {
    throw new Error("You did not report this request");
  }
  if (request.status !== "pending_review") {
    throw new Error("This request is not awaiting a review yet");
  }

  const { url, public_id } = await uploadSignatureImage(input.signatureBase64);

  request.review = {
    criteria: input.criteria,
    overallRating: input.overallRating,
    comment: input.comment?.trim() || null,
    signatureUrl: url,
    signaturePublicId: public_id,
    ratedAt: new Date(),
    ratedBy: userName,
  };
  request.status = "done";
  request.closeDate = new Date();

  await request.save();
  const equipmentMap = await buildEquipmentMap([request.equipmentId]);
  return transformRequest(request as any, equipmentMap);
}

// ─── User: get requests they reported (any status) ───────────────────────
export async function getReportedRequestsService(userEmail: string) {
  const requests = await MaintenanceRequestModel.find({ reportedByEmail: userEmail })
    .sort({ createdAt: -1 })
    .lean();

  const equipmentMap = await buildEquipmentMap(requests.map((r) => r.equipmentId));
  return {
    requests: requests.map((r) => transformRequest(r as any, equipmentMap)),
    total: requests.length,
  };
}
