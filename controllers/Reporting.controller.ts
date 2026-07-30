import { NextFunction, Request, Response } from "express";
import ErrorHandler from "../utils/ErrorHandler.js";
import { ReportingFilters, getReportingSummary, getCreatedVsCompleted, getReactiveVsRepeatable, getStatusBreakdown, getPriorityBreakdown } from "../services/Reporting.service.js";


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