import { NextFunction, Request, Response } from "express";
import ErrorHandler from "../utils/ErrorHandler.js";
import {
  getMaintenanceRequests,
  getRequestMessages,
  postRequestComment,
} from "../services/maintenance.service.js";
import { odooRequest } from "../odoo/odoo.client.js";
import { MAINTENANCE_REQUEST_FIELDS } from "../@types/Maintenance.constants.js";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * RepairState — the raw Odoo stage value stored on maintenance.request.
 * The frontend adapter (WorkOrdersPage) maps these to WOStatus:
 *
 *   "new"          → "open"
 *   "under_repair" → "in_progress"
 *   "done"         → "done"
 *   "cancel"       → "on_hold"
 */
export type RepairState = "new" | "under_repair" | "done" | "cancel";

const VALID_STATES: RepairState[] = ["new", "under_repair", "done", "cancel"];

// ─── Get all maintenance requests ─────────────────────────────────────────────
// GET /maintenance
// Returns: { requests[], stages[], total }
// Used by: WorkOrdersPage → useGetAllMaintenanceRequestsQuery
export const getAllMaintenanceRequests = async (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await getMaintenanceRequests();
    res.status(200).json({ success: true, data });
  } catch (error: any) {
    next(new ErrorHandler(error.message ?? "Something went wrong", 400));
  }
};

// ─── Get single maintenance request ───────────────────────────────────────────
// GET /maintenance/:id
// Used by employees to track the status of a specific request
export const getMaintenanceRequestDetail = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const raw = await odooRequest(
      "maintenance.request",
      "search_read",
      [[["id", "=", id]]],
      { fields: MAINTENANCE_REQUEST_FIELDS },
    );

    if (!raw?.length) {
      return res.status(404).json({ success: false, message: "Request not found" });
    }

    res.status(200).json({ success: true, data: raw[0] });
  } catch (error: any) {
    next(new ErrorHandler(error.message ?? "Something went wrong", 400));
  }
};

// ─── Update maintenance request status ────────────────────────────────────────
// PATCH /maintenance/:id/status
// Body: { state: RepairState }
//
// This is what the employee/technician calls to move a work order through stages.
// The frontend WODetailPanel calls onStatusChange → this endpoint.
//
// Stage flow:  new → under_repair → done
//                              ↓
//                           cancel  (from any state)
export const updateMaintenanceRequestStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const { state } = req.body as { state: RepairState };

    if (!state || !VALID_STATES.includes(state)) {
      return res.status(400).json({
        success: false,
        message: `state must be one of: ${VALID_STATES.join(", ")}`,
      });
    }

    // Build the Odoo write payload
    const values: Record<string, any> = { stage_id: await resolveStageId(state) };

    // When marking done, stamp the close date
    if (state === "done") {
      values.close_date = new Date().toISOString();
    }

    await odooRequest("maintenance.request", "write", [[id], values]);

    // Return the updated record so the frontend can re-render immediately
    const updated = await odooRequest(
      "maintenance.request",
      "search_read",
      [[["id", "=", id]]],
      { fields: MAINTENANCE_REQUEST_FIELDS },
    );

    res.status(200).json({ success: true, data: updated[0] ?? null });
  } catch (error: any) {
    next(new ErrorHandler(error.message ?? "Something went wrong", 400));
  }
};

// ─── Assign technicians ────────────────────────────────────────────────────────
// PATCH /maintenance/:id/assign
// Body: { technicianIds: number[] }
export const assignTechnicians = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const { technicianIds } = req.body as { technicianIds: number[] };

    if (!Array.isArray(technicianIds) || technicianIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "technicianIds must be a non-empty array of user IDs",
      });
    }

    // Odoo many2many replace command: [[6, 0, [ids]]]
    await odooRequest("maintenance.request", "write", [
      [id],
      { user_ids: [[6, 0, technicianIds]] },
    ]);

    res.status(200).json({ success: true, message: "Technicians assigned" });
  } catch (error: any) {
    next(new ErrorHandler(error.message ?? "Something went wrong", 400));
  }
};

// ─── Delete maintenance request ────────────────────────────────────────────────
// DELETE /maintenance/:id
// Only managers/admins can delete
export const deleteMaintenanceRequest = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userRole = (req.user as any)?.role;
    if (userRole !== "admin" && userRole !== "manager") {
      return next(new ErrorHandler("Not authorized", 403));
    }

    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    await odooRequest("maintenance.request", "unlink", [[id]]);

    res.status(200).json({ success: true, message: "Maintenance request deleted" });
  } catch (error: any) {
    next(new ErrorHandler(error.message ?? "Something went wrong", 400));
  }
};

// ─── Get messages for a request ───────────────────────────────────────────────
// GET /maintenance/:id/messages
export const getMaintenanceRequestMessages = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id as string );
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const data = await getRequestMessages(id);
    res.status(200).json({ success: true, data });
  } catch (error: any) {
    next(new ErrorHandler(error.message ?? "Something went wrong", 400));
  }
};

// ─── Post comment on a request ─────────────────────────────────────────────────
// POST /maintenance/:id/messages
// Body: { body, authorName, isInternal? }
export const postMaintenanceRequestComment = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const { body, authorName, isInternal } = req.body;

    if (!body?.trim() || !authorName?.trim()) {
      return res.status(400).json({
        success: false,
        message: "body and authorName are required",
      });
    }

    const data = await postRequestComment(id, { body, authorName, isInternal });
    res.status(201).json({ success: true, data });
  } catch (error: any) {
    next(new ErrorHandler(error.message ?? "Something went wrong", 400));
  }
};

// ─── Internal helper: resolve Odoo stage ID from RepairState ──────────────────
// Odoo maintenance uses stages (maintenance.stage) rather than a raw state field.
// We cache the stage map per process lifetime to avoid repeated Odoo calls.
let _stageCache: Map<string, number> | null = null;

async function resolveStageId(state: RepairState): Promise<number> {
  if (!_stageCache) {
    const stages = await odooRequest("maintenance.stage", "search_read", [[]], {
      fields: ["id", "name", "sequence"],
      order: "sequence asc",
    });
    _stageCache = buildStageMap(stages);
  }

  const stageId = _stageCache.get(state);
  if (stageId !== undefined) return stageId;

  // Fallback: return first stage so we never send undefined
  const first = _stageCache.values().next().value as number | undefined;
  if (first === undefined) {
    throw new Error("[maintenance] Stage cache is empty — no stages found in Odoo");
  }
  console.warn(`[maintenance] No stage mapped for state="${state}", falling back to id=${first}`);
  return first;
}

/**
 * Maps RepairState keys to Odoo stage IDs by inspecting stage names.
 * Adjust the keyword matching below if your Odoo stage names differ.
 */
function buildStageMap(stages: any[]): Map<string, number> {
  const map = new Map<string, number>();

  for (const s of stages) {
    const name: string = (s.name ?? "").toLowerCase();

    if (name.includes("new") || name.includes("open"))          map.set("new",          s.id);
    if (name.includes("repair") || name.includes("progress"))   map.set("under_repair", s.id);
    if (name.includes("done") || name.includes("complete"))     map.set("done",         s.id);
    if (name.includes("cancel"))                                 map.set("cancel",       s.id);
  }

  return map;
}