import { Router } from "express";
import { authorizeRoles, isAuthenticated } from "../middleware/auth.js";
import {
  getReportingSummaryController,
  getCreatedVsCompletedController,
  getReactiveVsRepeatableController,
  getStatusBreakdownController,
  getPriorityBreakdownController,
  getAverageResolutionTimeController,
  getTechnicianWorkloadController,
  getEquipmentReliabilityController,
  getOverdueRequestsController,
  getLocationBreakdownController,
  getCategoryBreakdownController,
  getCostRollupController,
} from "../controllers/Reporting.controller.js";


const reportingRouter = Router();

reportingRouter.get(
  "/reporting/summary",
  isAuthenticated,
  authorizeRoles("manager"),
  getReportingSummaryController,
);
reportingRouter.get(
  "/reporting/created-vs-completed",
  isAuthenticated,
  authorizeRoles("manager"),
  getCreatedVsCompletedController,
);
reportingRouter.get(
  "/reporting/reactive-vs-repeatable",
  isAuthenticated,
  authorizeRoles("manager"),
  getReactiveVsRepeatableController,
);
reportingRouter.get(
  "/reporting/status-breakdown",
  isAuthenticated,
  authorizeRoles("manager"),
  getStatusBreakdownController,
);
reportingRouter.get(
  "/reporting/priority-breakdown",
  isAuthenticated,
  authorizeRoles("manager"),
  getPriorityBreakdownController,
);
reportingRouter.get(
  "/reporting/resolution-time",
  isAuthenticated,
  authorizeRoles("manager"),
  getAverageResolutionTimeController,
);
reportingRouter.get(
  "/reporting/technician-workload",
  isAuthenticated,
  authorizeRoles("manager"),
  getTechnicianWorkloadController,
);
reportingRouter.get(
  "/reporting/equipment-reliability",
  isAuthenticated,
  authorizeRoles("manager"),
  getEquipmentReliabilityController,
);
reportingRouter.get(
  "/reporting/overdue",
  isAuthenticated,
  authorizeRoles("manager"),
  getOverdueRequestsController,
);
reportingRouter.get(
  "/reporting/location-breakdown",
  isAuthenticated,
  authorizeRoles("manager"),
  getLocationBreakdownController,
);
reportingRouter.get(
  "/reporting/category-breakdown",
  isAuthenticated,
  authorizeRoles("manager"),
  getCategoryBreakdownController,
);
reportingRouter.get(
  "/reporting/cost-rollup",
  isAuthenticated,
  authorizeRoles("manager"),
  getCostRollupController,
);

export default reportingRouter;