import { NextFunction, Request, Response } from "express";
import ErrorHandler from "../utils/ErrorHandler.js";
import {
  getMaintenanceRequests,
  getMaintenanceRequestById,
  updateMaintenanceRequestRecord,
  deleteMaintenanceRequestRecord,
  getRequestMessages,
  postRequestComment,
  assignTechniciansService,
  createManagerMaintenanceRequest,
  setMaintenanceScheduleDate,
} from "../services/maintenance.service.js";
import { MaintenanceStatus, VALID_STATUSES } from "../models/Maintenancerequest.model.js";


// ─── Get all maintenance requests ─────────────────────────────────────────────
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

    const data = await getMaintenanceRequestById(id);
    if (!data) {
      return res.status(404).json({ success: false, message: "Request not found" });
    }

    res.status(200).json({ success: true, data });
  } catch (error: any) {
    next(new ErrorHandler(error.message ?? "Something went wrong", 400));
  }
};

// ─── Update maintenance request status ────────────────────────────────────────
// PATCH /maintenance/:id/status
// Body: { state: MaintenanceStatus }
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

    const { state } = req.body as { state: MaintenanceStatus };

    if (!state || !VALID_STATUSES.includes(state)) {
      return res.status(400).json({
        success: false,
        message: `state must be one of: ${VALID_STATUSES.join(", ")}`,
      });
    }

    await updateMaintenanceRequestRecord(id, { status: state });
    const updated = await getMaintenanceRequestById(id);

    res.status(200).json({ success: true, data: updated });
  } catch (error: any) {
    next(new ErrorHandler(error.message ?? "Something went wrong", 400));
  }
};
export const updateMaintenanceRequestSchedule = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const { scheduleDate } = req.body as { scheduleDate: string };
    const parsed = new Date(scheduleDate);

    if (!scheduleDate || isNaN(parsed.getTime())) {
      return res.status(400).json({ success: false, message: "Valid scheduleDate is required" });
    }

    const updated = await setMaintenanceScheduleDate(id, parsed);
    if (!updated) {
      return res.status(404).json({ success: false, message: "Request not found" });
    }

    res.status(200).json({ success: true, data: updated });
  } catch (error: any) {
    next(new ErrorHandler(error.message ?? "Something went wrong", 400));
  }
};
// ─── Assign technicians ────────────────────────────────────────────────────────

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

    const { technicians } = req.body as {
      technicians: { id: string; name: string; email: string }[];
    };

    if (!Array.isArray(technicians) || technicians.length === 0) {
      return res.status(400).json({
        success: false,
        message: "technicians must be a non-empty array of { id, name, email }",
      });
    }

    const missingEmail = technicians.find((t) => !t.email?.trim());
    if (missingEmail) {
      return res.status(400).json({
        success: false,
        message: `Technician "${missingEmail.name}" has no email on file`,
      });
    }

    const updated = await assignTechniciansService(id, technicians);
    if (!updated) {
      return res.status(404).json({ success: false, message: "Request not found" });
    }

    res.status(200).json({
      success: true,
      message: `Assigned and emailed ${technicians.length} technician(s)`,
      data: updated,
    });
  } catch (error: any) {
    next(new ErrorHandler(error.message ?? "Something went wrong", 400));
  }
};

// ─── Delete maintenance request ────────────────────────────────────────────────
// DELETE /maintenance/:id — managers/admins only
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

    await deleteMaintenanceRequestRecord(id);

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
    const id = parseInt(req.params.id as string);
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


// Manager creates a work order directly

export const createMaintenanceRequestManual = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { equipmentId, priority, description, reportedBy, reportedByEmail } = req.body;

    if (!equipmentId || !priority || !description) {
      return res.status(400).json({
        success: false,
        message: "equipmentId, priority and description are required",
      });
    }

    // technicians arrives as a JSON string when sent via multipart/form-data
    let technicians: { id: string; name: string; email: string }[] = [];
    if (req.body.technicians) {
      technicians =
        typeof req.body.technicians === "string"
          ? JSON.parse(req.body.technicians)
          : req.body.technicians;
    }

    const manager = req.user as any;
    const files = req.files as Express.Multer.File[] | undefined;
    const jsonMedia = req.body.media as { url: string; type: "image" | "video" }[] | undefined;

    const data = await createManagerMaintenanceRequest({
      equipmentId: Number(equipmentId),
      priority,
      description,
      reportedBy: reportedBy?.trim() || manager?.name || "Manager",
      reportedByEmail: reportedByEmail?.trim() || manager?.email || "",
      technicians,
      files,
      jsonMedia,
    });

    if (!data) {
      return res.status(404).json({ success: false, message: "Equipment not found" });
    }

    res.status(201).json({
      success: true,
      message: "Work order created successfully",
      data,
    });
  } catch (error: any) {
    next(new ErrorHandler(error.message ?? "Something went wrong", 400));
  }
};
