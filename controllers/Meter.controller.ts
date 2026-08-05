import { NextFunction, Request, Response } from "express";
import ErrorHandler from "../utils/ErrorHandler.js";
import {
  fetchAllMeters,
  fetchMeterById,
  createMeterService,
  updateMeterService,
  deleteMeterService,
  addTriggerService,
  updateTriggerService,
  removeTriggerService,
  recordReadingService,
  fetchReadingHistory,
  fetchReadingsForChart,
} from "../services/Meter.service.js";

// ─── Get all meters ─────────────────────────────────────────────────────────
// ?equipmentId=12&status=triggered&meterType=manual&search=temp

export const getAllMeters = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { equipmentId, status, meterType, search } = req.query as {
      equipmentId?: string;
      status?: string;
      meterType?: string;
      search?: string;
    };

    const meters = await fetchAllMeters({
      equipmentId: equipmentId ? Number(equipmentId) : undefined,
      status,
      meterType,
      search,
    });

    res.status(200).json({ success: true, total: meters.length, data: meters });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── Get meter by ID ─────────────────────────────────────────────────────────

export const getMeterById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid ID" });

    const meter = await fetchMeterById(id);
    if (!meter) return res.status(404).json({ success: false, message: "Meter not found" });

    res.status(200).json({ success: true, data: meter });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── Create meter ────────────────────────────────────────────────────────────

export const createMeter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, equipmentId, unit, meterType, readingType, description } = req.body;

    if (!name?.trim() || !equipmentId || !unit?.trim()) {
      return res.status(400).json({
        success: false,
        message: "name, equipmentId and unit are required",
      });
    }

    const actor = req.user as any;
    const meter = await createMeterService({
      name: name.trim(),
      equipmentId: Number(equipmentId),
      unit,
      meterType,
      readingType,
      description,
      createdByName: actor?.name ?? "Unknown",
    });

    res.status(201).json({ success: true, message: "Meter created successfully", data: meter });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── Update meter ────────────────────────────────────────────────────────────

export const updateMeter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid ID" });

    const { name, unit, meterType, readingType, description } = req.body;

    const updated = await updateMeterService(id, { name, unit, meterType, readingType, description });
    if (!updated) return res.status(404).json({ success: false, message: "Meter not found" });

    res.status(200).json({ success: true, message: "Meter updated successfully", data: updated });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── Delete meter (soft) ─────────────────────────────────────────────────────

export const deleteMeter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid ID" });

    const deleted = await deleteMeterService(id);
    if (!deleted) return res.status(404).json({ success: false, message: "Meter not found" });

    res.status(200).json({ success: true, message: "Meter deleted successfully" });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── Triggers ─────────────────────────────────────────────────────────────────
// Body: { label, operator, value, valueMax?, createWorkOrder?, workOrderPriority?,
//         workOrderDescription?, assignTechnicians?, notifyEmails? }

export const addMeterTrigger = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid ID" });

    const { label, operator, value } = req.body;
    if (!label?.trim() || !operator || value === undefined) {
      return res.status(400).json({
        success: false,
        message: "label, operator and value are required",
      });
    }

    const updated = await addTriggerService(id, req.body);
    if (!updated) return res.status(404).json({ success: false, message: "Meter not found" });

    res.status(201).json({ success: true, message: "Trigger added", data: updated });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

export const updateMeterTrigger = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    const { triggerId } = req.params;
    if (isNaN(id) || !triggerId) {
      return res.status(400).json({ success: false, message: "Invalid id or triggerId" });
    }

    const updated = await updateTriggerService(id, triggerId as string, req.body);
    if (!updated) return res.status(404).json({ success: false, message: "Meter not found" });

    res.status(200).json({ success: true, message: "Trigger updated", data: updated });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

export const removeMeterTrigger = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    const { triggerId } = req.params;
    if (isNaN(id) || !triggerId) {
      return res.status(400).json({ success: false, message: "Invalid id or triggerId" });
    }

    const updated = await removeTriggerService(id, triggerId as string  );
    if (!updated) return res.status(404).json({ success: false, message: "Meter not found" });

    res.status(200).json({ success: true, message: "Trigger removed", data: updated });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── Record a reading ────────────────────────────────────────────────────────
// Body: { value, note? } — source defaults to "manual"; automated/API callers
// should hit this same endpoint with an API-scoped auth strategy and pass
// source via a separate integration-only route if you add one later.

export const recordMeterReading = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid ID" });

    const { value, note } = req.body as { value: number; note?: string };
    if (value === undefined || value === null || isNaN(Number(value))) {
      return res.status(400).json({ success: false, message: "A numeric value is required" });
    }

    const actor = req.user as any;
    const result = await recordReadingService(
      id,
      Number(value),
      { id: actor?._id?.toString(), name: actor?.name },
      { source: "manual", note },
    );

    if (!result) return res.status(404).json({ success: false, message: "Meter not found" });

    res.status(201).json({
      success: true,
      message: result.reading.triggeredWorkOrder
        ? "Reading recorded — a trigger fired and a work order was created"
        : "Reading recorded",
      data: result,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── Reading history ──────────────────────────────────────────────────────────
// ?limit=50

export const getMeterReadingHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid ID" });

    const { limit } = req.query as { limit?: string };
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;

    const data = await fetchReadingHistory(id, parsedLimit && !isNaN(parsedLimit) ? parsedLimit : undefined);
    res.status(200).json({ success: true, total: data.length, data });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── Reading chart data ───────────────────────────────────────────────────────
// ?startDate=2026-06-01&endDate=2026-07-30 — powers the "Readings" graph on
// the meter details page.

export const getMeterChartData = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid ID" });

    const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    const data = await fetchReadingsForChart(
      id,
      start && !isNaN(start.getTime()) ? start : undefined,
      end && !isNaN(end.getTime()) ? end : undefined,
    );

    res.status(200).json({ success: true, data });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};