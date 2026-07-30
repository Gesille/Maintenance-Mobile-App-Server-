import MaintenanceRequestModel, {
  MaintenanceStatus,
} from "../models/Maintenancerequest.model.js";

// ─── Shared filter shape ──────────────────────────────────────────────────────
// Every report accepts the same optional filters so the frontend can reuse one
// filter bar (date range today, easy to extend with location/team later).

export interface ReportingFilters {
  startDate?: Date;
  endDate?: Date;
}

function buildDateMatch(filters: ReportingFilters): Record<string, any> {
  const match: Record<string, any> = {};
  if (filters.startDate || filters.endDate) {
    match.createdAt = {};
    if (filters.startDate) match.createdAt.$gte = filters.startDate;
    if (filters.endDate) match.createdAt.$lte = filters.endDate;
  }
  return match;
}

// ─── Created vs Completed ─────────────────────────────────────────────────────
// "Created" = requests whose createdAt falls in range.
// "Completed" = requests whose status is "done", bucketed by closeDate.
// Two separate date axes merged into one series so the frontend line chart
// gets a clean [{ date, created, completed }] array.

export interface CreatedVsCompletedPoint {
  date: string;
  created: number;
  completed: number;
}

export interface CreatedVsCompletedReport {
  series: CreatedVsCompletedPoint[];
  created: number;
  completed: number;
  percentCompleted: number;
}

export async function getCreatedVsCompleted(
  filters: ReportingFilters = {},
): Promise<CreatedVsCompletedReport> {
  const match = buildDateMatch(filters);

  const [createdSeries, completedSeries, totals] = await Promise.all([
    MaintenanceRequestModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    MaintenanceRequestModel.aggregate([
      { $match: { ...match, status: "done", closeDate: { $ne: null } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$closeDate" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    MaintenanceRequestModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          created: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ["$status", "done"] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const byDate = new Map<string, CreatedVsCompletedPoint>();
  for (const row of createdSeries) {
    byDate.set(row._id, { date: row._id, created: row.count, completed: 0 });
  }
  for (const row of completedSeries) {
    const existing = byDate.get(row._id) ?? { date: row._id, created: 0, completed: 0 };
    existing.completed = row.count;
    byDate.set(row._id, existing);
  }

  const series = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const created = totals[0]?.created ?? 0;
  const completed = totals[0]?.completed ?? 0;
  const percentCompleted = created > 0 ? Math.round((completed / created) * 1000) / 10 : 0;

  return { series, created, completed, percentCompleted };
}

// ─── Reactive vs Repeatable ───────────────────────────────────────────────────
// There's no recurrence engine yet, so this is derived from *how* the request
// entered the system rather than a real recurrence schedule:
//   - "reactive"   → filed through the public /create-request flow (someone
//                     reported a problem after the fact)
//   - "repeatable" → filed through the manager /create-request-manager flow
//                     (planned/preventive work orders)
// This relies on a new `source` field on MaintenanceRequestModel — see the
// model patch notes. Until real recurrence rules exist, treat this label as
// "who opened it", not "does it repeat on a schedule".

export interface ReactiveVsRepeatableReport {
  reactive: number;
  repeatable: number;
}

export async function getReactiveVsRepeatable(
  filters: ReportingFilters = {},
): Promise<ReactiveVsRepeatableReport> {
  const match = buildDateMatch(filters);

  const rows = await MaintenanceRequestModel.aggregate([
    { $match: match },
    { $group: { _id: "$source", count: { $sum: 1 } } },
  ]);

  const byLabel = Object.fromEntries(rows.map((r) => [r._id ?? "reactive", r.count]));

  return {
    reactive: byLabel.reactive ?? 0,
    repeatable: byLabel.repeatable ?? 0,
  };
}

// ─── Status breakdown ─────────────────────────────────────────────────────────
// Maps our 4 real statuses onto the labels used in the reference design.

export interface StatusBreakdownReport {
  open: number; // status: new
  inProgress: number; // status: under_repair
  onHold: number; // status: cancel (closest analogue we track today)
  done: number; // status: done
  total: number;
}

export async function getStatusBreakdown(
  filters: ReportingFilters = {},
): Promise<StatusBreakdownReport> {
  const match = buildDateMatch(filters);

  const rows = await MaintenanceRequestModel.aggregate([
    { $match: match },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  const counts: Record<MaintenanceStatus, number> = {
    new: 0,
    under_repair: 0,
    done: 0,
    cancel: 0,
  };
  for (const row of rows) {
    counts[row._id as MaintenanceStatus] = row.count;
  }

  return {
    open: counts.new,
    inProgress: counts.under_repair,
    onHold: counts.cancel,
    done: counts.done,
    total: counts.new + counts.under_repair + counts.done + counts.cancel,
  };
}

// ─── Priority breakdown ───────────────────────────────────────────────────────

export interface PriorityBreakdownRow {
  priority: string;
  count: number;
}

export async function getPriorityBreakdown(
  filters: ReportingFilters = {},
): Promise<PriorityBreakdownRow[]> {
  const match = buildDateMatch(filters);

  const rows = await MaintenanceRequestModel.aggregate([
    { $match: match },
    { $group: { _id: "$priority", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  return rows.map((r) => ({ priority: r._id ?? "none", count: r.count }));
}

// ─── Combined summary (one round trip for the whole dashboard) ──────────────

export interface ReportingSummary {
  createdVsCompleted: CreatedVsCompletedReport;
  reactiveVsRepeatable: ReactiveVsRepeatableReport;
  statusBreakdown: StatusBreakdownReport;
  priorityBreakdown: PriorityBreakdownRow[];
}

export async function getReportingSummary(
  filters: ReportingFilters = {},
): Promise<ReportingSummary> {
  const [createdVsCompleted, reactiveVsRepeatable, statusBreakdown, priorityBreakdown] =
    await Promise.all([
      getCreatedVsCompleted(filters),
      getReactiveVsRepeatable(filters),
      getStatusBreakdown(filters),
      getPriorityBreakdown(filters),
    ]);

  return { createdVsCompleted, reactiveVsRepeatable, statusBreakdown, priorityBreakdown };
}