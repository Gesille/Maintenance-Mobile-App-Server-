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
  total: number;
  percentRepeatable: number;
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
  const reactive = byLabel.reactive ?? 0;
  const repeatable = byLabel.repeatable ?? 0;
  const total = reactive + repeatable;

  return {
    reactive,
    repeatable,
    total,
    percentRepeatable: total > 0 ? Math.round((repeatable / total) * 1000) / 10 : 0,
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

// ─── Average resolution time (MTTR) ──────────────────────────────────────────
// Mean Time To Resolution — average hours between createdAt and closeDate for
// requests that reached "done" in range. Reported overall and broken down by
// priority, since a manager usually cares whether "urgent" jobs actually get
// closed faster than "low" ones.

export interface ResolutionTimeByPriority {
  priority: string;
  avgHours: number;
  count: number;
}

export interface AverageResolutionTimeReport {
  avgHours: number;
  resolvedCount: number;
  byPriority: ResolutionTimeByPriority[];
}

export async function getAverageResolutionTime(
  filters: ReportingFilters = {},
): Promise<AverageResolutionTimeReport> {
  const match = buildDateMatch(filters);

  const resolvedMatch = { ...match, status: "done", closeDate: { $ne: null } };

  const [overall, byPriority] = await Promise.all([
    MaintenanceRequestModel.aggregate([
      { $match: resolvedMatch },
      {
        $project: {
          hours: { $divide: [{ $subtract: ["$closeDate", "$createdAt"] }, 1000 * 60 * 60] },
        },
      },
      { $group: { _id: null, avgHours: { $avg: "$hours" }, count: { $sum: 1 } } },
    ]),
    MaintenanceRequestModel.aggregate([
      { $match: resolvedMatch },
      {
        $project: {
          priority: 1,
          hours: { $divide: [{ $subtract: ["$closeDate", "$createdAt"] }, 1000 * 60 * 60] },
        },
      },
      {
        $group: {
          _id: "$priority",
          avgHours: { $avg: "$hours" },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]),
  ]);

  return {
    avgHours: overall[0]?.avgHours ? Math.round(overall[0].avgHours * 10) / 10 : 0,
    resolvedCount: overall[0]?.count ?? 0,
    byPriority: byPriority.map((r) => ({
      priority: r._id ?? "none",
      avgHours: Math.round((r.avgHours ?? 0) * 10) / 10,
      count: r.count,
    })),
  };
}

// ─── Technician workload ──────────────────────────────────────────────────────
// Unwinds the technicians array so each assigned technician gets their own
// row with open vs. completed counts — lets a manager spot who's overloaded
// or who's sitting idle.

export interface TechnicianWorkloadRow {
  technicianId: string;
  technicianName: string;
  open: number;
  completed: number;
  total: number;
}

export async function getTechnicianWorkload(
  filters: ReportingFilters = {},
): Promise<TechnicianWorkloadRow[]> {
  const match = buildDateMatch(filters);

  const rows = await MaintenanceRequestModel.aggregate([
    { $match: match },
    { $unwind: "$technicians" },
    {
      $group: {
        _id: { id: "$technicians.id", name: "$technicians.name" },
        open: { $sum: { $cond: [{ $eq: ["$status", "done"] }, 0, 1] } },
        completed: { $sum: { $cond: [{ $eq: ["$status", "done"] }, 1, 0] } },
        total: { $sum: 1 },
      },
    },
    { $sort: { total: -1 } },
  ]);

  return rows.map((r) => ({
    technicianId: r._id.id,
    technicianName: r._id.name,
    open: r.open,
    completed: r.completed,
    total: r.total,
  }));
}

// ─── Equipment reliability / repeat offenders ────────────────────────────────
// Groups requests by equipment and ranks by request count, so a manager can
// see which assets keep breaking down — usually the most actionable report
// in the whole dashboard (repair-vs-replace decisions).

export interface EquipmentReliabilityRow {
  equipmentId: number;
  name: string;
  assetCode: string | null;
  restaurant: string | null;
  requestCount: number;
  openCount: number;
}

export async function getEquipmentReliability(
  filters: ReportingFilters = {},
  limit = 10,
): Promise<EquipmentReliabilityRow[]> {
  const match = buildDateMatch(filters);

  const rows = await MaintenanceRequestModel.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$equipmentId",
        requestCount: { $sum: 1 },
        openCount: { $sum: { $cond: [{ $eq: ["$status", "done"] }, 0, 1] } },
      },
    },
    { $sort: { requestCount: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: "equipments",
        localField: "_id",
        foreignField: "id",
        as: "equipment",
      },
    },
    { $unwind: { path: "$equipment", preserveNullAndEmptyArrays: true } },
  ]);

  return rows.map((r) => ({
    equipmentId: r._id,
    name: r.equipment?.name ?? "Unknown equipment",
    assetCode: r.equipment?.assetCode ?? null,
    restaurant: r.equipment?.restaurant ?? null,
    requestCount: r.requestCount,
    openCount: r.openCount,
  }));
}

// ─── Overdue / at-risk requests ───────────────────────────────────────────────
// Anything with a scheduleDate in the past that hasn't reached done/cancel.
// Intentionally ignores the date-range filter — "overdue" is always relative
// to right now, not to the report's window.

export interface OverdueRequestRow {
  id: number;
  name: string;
  priority: string;
  status: MaintenanceStatus;
  scheduleDate: string;
  daysOverdue: number;
}

export async function getOverdueRequests(): Promise<{
  count: number;
  requests: OverdueRequestRow[];
}> {
  const now = new Date();

  const rows = await MaintenanceRequestModel.find({
    scheduleDate: { $ne: null, $lt: now },
    status: { $nin: ["done", "cancel"] },
  })
    .sort({ scheduleDate: 1 })
    .lean();

  const requests = rows.map((r) => ({
    id: r.id,
    name: r.name,
    priority: r.priority,
    status: r.status,
    scheduleDate: new Date(r.scheduleDate as Date).toISOString(),
    daysOverdue: Math.max(
      0,
      Math.floor((now.getTime() - new Date(r.scheduleDate as Date).getTime()) / (1000 * 60 * 60 * 24)),
    ),
  }));

  return { count: requests.length, requests };
}

// ─── Breakdown by restaurant / location ──────────────────────────────────────
// Joins to Equipment to group requests by the site they were filed against —
// useful for spotting which location generates the most maintenance load.

export interface LocationBreakdownRow {
  restaurant: string;
  count: number;
}

export async function getLocationBreakdown(
  filters: ReportingFilters = {},
): Promise<LocationBreakdownRow[]> {
  const match = buildDateMatch(filters);

  const rows = await MaintenanceRequestModel.aggregate([
    { $match: match },
    {
      $lookup: {
        from: "equipments",
        localField: "equipmentId",
        foreignField: "id",
        as: "equipment",
      },
    },
    { $unwind: { path: "$equipment", preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: { $ifNull: ["$equipment.restaurant", "Unassigned"] },
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
  ]);

  return rows.map((r) => ({ restaurant: r._id, count: r.count }));
}

// ─── Breakdown by equipment category ─────────────────────────────────────────

export interface CategoryBreakdownRow {
  category: string;
  count: number;
}

export async function getCategoryBreakdown(
  filters: ReportingFilters = {},
): Promise<CategoryBreakdownRow[]> {
  const match = buildDateMatch(filters);

  const rows = await MaintenanceRequestModel.aggregate([
    { $match: match },
    {
      $lookup: {
        from: "equipments",
        localField: "equipmentId",
        foreignField: "id",
        as: "equipment",
      },
    },
    { $unwind: { path: "$equipment", preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: { $ifNull: ["$equipment.category", "Uncategorized"] },
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
  ]);

  return rows.map((r) => ({ category: r._id, count: r.count }));
}

// ─── Cost rollup ──────────────────────────────────────────────────────────────
// Not a per-request cost (MaintenanceRequestModel doesn't track one yet) —
// this reports the total asset value (Equipment.cost) currently tied up in
// active maintenance vs. the value of equipment with no open requests at all.
// Gives a manager a rough sense of how much capital is "in the shop" right now.

export interface CostRollupReport {
  activeAssetValue: number;
  activeEquipmentCount: number;
  totalAssetValue: number;
  totalEquipmentCount: number;
}

export async function getCostRollup(): Promise<CostRollupReport> {
  const [activeAgg, totalAgg] = await Promise.all([
    MaintenanceRequestModel.aggregate([
      { $match: { status: { $nin: ["done", "cancel"] } } },
      { $group: { _id: "$equipmentId" } },
      {
        $lookup: {
          from: "equipments",
          localField: "_id",
          foreignField: "id",
          as: "equipment",
        },
      },
      { $unwind: "$equipment" },
      {
        $group: {
          _id: null,
          activeAssetValue: { $sum: "$equipment.cost" },
          activeEquipmentCount: { $sum: 1 },
        },
      },
    ]),
    // total asset value lives on Equipment, not MaintenanceRequest — pull it
    // via the same "equipments" collection name so this stays index-friendly
    MaintenanceRequestModel.db
      .collection("equipments")
      .aggregate([
        { $match: { active: true } },
        {
          $group: {
            _id: null,
            totalAssetValue: { $sum: "$cost" },
            totalEquipmentCount: { $sum: 1 },
          },
        },
      ])
      .toArray(),
  ]);

  return {
    activeAssetValue: activeAgg[0]?.activeAssetValue ?? 0,
    activeEquipmentCount: activeAgg[0]?.activeEquipmentCount ?? 0,
    totalAssetValue: totalAgg[0]?.totalAssetValue ?? 0,
    totalEquipmentCount: totalAgg[0]?.totalEquipmentCount ?? 0,
  };
}

// ─── Combined summary (one round trip for the whole dashboard) ──────────────

export interface ReportingSummary {
  createdVsCompleted: CreatedVsCompletedReport;
  reactiveVsRepeatable: ReactiveVsRepeatableReport;
  statusBreakdown: StatusBreakdownReport;
  priorityBreakdown: PriorityBreakdownRow[];
  averageResolutionTime: AverageResolutionTimeReport;
  technicianWorkload: TechnicianWorkloadRow[];
  equipmentReliability: EquipmentReliabilityRow[];
  overdueRequests: { count: number; requests: OverdueRequestRow[] };
  locationBreakdown: LocationBreakdownRow[];
  categoryBreakdown: CategoryBreakdownRow[];
  costRollup: CostRollupReport;
}

export async function getReportingSummary(
  filters: ReportingFilters = {},
): Promise<ReportingSummary> {
  const [
    createdVsCompleted,
    reactiveVsRepeatable,
    statusBreakdown,
    priorityBreakdown,
    averageResolutionTime,
    technicianWorkload,
    equipmentReliability,
    overdueRequests,
    locationBreakdown,
    categoryBreakdown,
    costRollup,
  ] = await Promise.all([
    getCreatedVsCompleted(filters),
    getReactiveVsRepeatable(filters),
    getStatusBreakdown(filters),
    getPriorityBreakdown(filters),
    getAverageResolutionTime(filters),
    getTechnicianWorkload(filters),
    getEquipmentReliability(filters),
    getOverdueRequests(),
    getLocationBreakdown(filters),
    getCategoryBreakdown(filters),
    getCostRollup(),
  ]);

  return {
    createdVsCompleted,
    reactiveVsRepeatable,
    statusBreakdown,
    priorityBreakdown,
    averageResolutionTime,
    technicianWorkload,
    equipmentReliability,
    overdueRequests,
    locationBreakdown,
    categoryBreakdown,
    costRollup,
  };
}