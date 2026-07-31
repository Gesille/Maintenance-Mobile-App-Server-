import { NextFunction, Request, Response } from "express";
import ErrorHandler from "../utils/ErrorHandler.js";
import {
  ReportingFilters,
  getReportingSummary,
  getCreatedVsCompleted,
  getReactiveVsRepeatable,
  getStatusBreakdown,
  getPriorityBreakdown,
  getAverageResolutionTime,
  getTechnicianWorkload,
  getEquipmentReliability,
  getOverdueRequests,
  getLocationBreakdown,
  getCategoryBreakdown,
  getCostRollup,
} from "../services/Reporting.service.js";


// ─── Shared query parsing ────────────────────────────────────────────────────
// ?startDate=2026-06-01&endDate=2026-07-30 (both optional, ISO date strings)

function parseFilters(req: Request): ReportingFilters {
  const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };

  const parsed: ReportingFilters = {};
  if (startDate) {
    const d = new Date(startDate);
    if (!isNaN(d.getTime())) parsed.startDate = d;
  }
  if (endDate) {
    const d = new Date(endDate);
    if (!isNaN(d.getTime())) parsed.endDate = d;
  }
  return parsed;
}

// ─── GET /reporting/summary ───────────────────────────────────────────────────
// One call that returns everything the dashboard needs.

export const getReportingSummaryController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const filters = parseFilters(req);
    const data = await getReportingSummary(filters);

    res.status(200).json({ success: true, data });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── GET /reporting/created-vs-completed ─────────────────────────────────────

export const getCreatedVsCompletedController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const filters = parseFilters(req);
    const data = await getCreatedVsCompleted(filters);

    res.status(200).json({ success: true, data });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── GET /reporting/reactive-vs-repeatable ───────────────────────────────────

export const getReactiveVsRepeatableController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const filters = parseFilters(req);
    const data = await getReactiveVsRepeatable(filters);

    res.status(200).json({ success: true, data });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── GET /reporting/status-breakdown ─────────────────────────────────────────

export const getStatusBreakdownController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const filters = parseFilters(req);
    const data = await getStatusBreakdown(filters);

    res.status(200).json({ success: true, data });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── GET /reporting/priority-breakdown ───────────────────────────────────────

export const getPriorityBreakdownController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const filters = parseFilters(req);
    const data = await getPriorityBreakdown(filters);

    res.status(200).json({ success: true, data });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── GET /reporting/resolution-time ──────────────────────────────────────────
// Average time-to-close (MTTR), overall and by priority.

export const getAverageResolutionTimeController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const filters = parseFilters(req);
    const data = await getAverageResolutionTime(filters);

    res.status(200).json({ success: true, data });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── GET /reporting/technician-workload ──────────────────────────────────────
// Open vs. completed job counts per assigned technician.

export const getTechnicianWorkloadController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const filters = parseFilters(req);
    const data = await getTechnicianWorkload(filters);

    res.status(200).json({ success: true, data });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── GET /reporting/equipment-reliability ────────────────────────────────────
// Top equipment by request count — repeat offenders / repair-vs-replace list.
// ?limit=10 (optional, defaults to 10)

export const getEquipmentReliabilityController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const filters = parseFilters(req);
    const { limit } = req.query as { limit?: string };
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;

    const data = await getEquipmentReliability(
      filters,
      parsedLimit && !isNaN(parsedLimit) ? parsedLimit : undefined,
    );

    res.status(200).json({ success: true, data });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── GET /reporting/overdue ───────────────────────────────────────────────────
// Requests past their scheduleDate that are still open. Not date-range
// filtered — "overdue" is always relative to right now.

export const getOverdueRequestsController = async (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await getOverdueRequests();

    res.status(200).json({ success: true, data });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── GET /reporting/location-breakdown ───────────────────────────────────────

export const getLocationBreakdownController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const filters = parseFilters(req);
    const data = await getLocationBreakdown(filters);

    res.status(200).json({ success: true, data });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── GET /reporting/category-breakdown ───────────────────────────────────────

export const getCategoryBreakdownController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const filters = parseFilters(req);
    const data = await getCategoryBreakdown(filters);

    res.status(200).json({ success: true, data });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── GET /reporting/cost-rollup ───────────────────────────────────────────────
// Asset value currently tied up in active maintenance vs. total fleet value.
// Not date-range filtered — this reflects current state, not a historical window.

export const getCostRollupController = async (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await getCostRollup();

    res.status(200).json({ success: true, data });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};