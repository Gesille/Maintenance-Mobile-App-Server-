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
  authorizeRoles("manager","Enduser"),
  getReportingSummaryController,
);
reportingRouter.get(
  "/reporting/created-vs-completed",
  isAuthenticated,
  authorizeRoles("manager","Enduser"),
  getCreatedVsCompletedController,
);
reportingRouter.get(
  "/reporting/reactive-vs-repeatable",
  isAuthenticated,
  authorizeRoles("manager","Enduser"),
  getReactiveVsRepeatableController,
);
reportingRouter.get(
  "/reporting/status-breakdown",
  isAuthenticated,
  authorizeRoles("manager","Enduser"),
  getStatusBreakdownController,
);
reportingRouter.get(
  "/reporting/priority-breakdown",
  isAuthenticated,
  authorizeRoles("manager","Enduser"),
  getPriorityBreakdownController,
);
reportingRouter.get(
  "/reporting/resolution-time",
  isAuthenticated,
  authorizeRoles("manager","Enduser"),
  getAverageResolutionTimeController,
);
reportingRouter.get(
  "/reporting/technician-workload",
  isAuthenticated,
  authorizeRoles("manager","Enduser"),
  getTechnicianWorkloadController,
);
reportingRouter.get(
  "/reporting/equipment-reliability",
  isAuthenticated,
  authorizeRoles("manager","Enduser"),
  getEquipmentReliabilityController,
);
reportingRouter.get(
  "/reporting/overdue",
  isAuthenticated,
  authorizeRoles("manager","Enduser"),
  getOverdueRequestsController,
);
reportingRouter.get(
  "/reporting/location-breakdown",
  isAuthenticated,
  authorizeRoles("manager","Enduser"),
  getLocationBreakdownController,
);
reportingRouter.get(
  "/reporting/category-breakdown",
  isAuthenticated,
  authorizeRoles("manager","Enduser"),
  getCategoryBreakdownController,
);
reportingRouter.get(
  "/reporting/cost-rollup",
  isAuthenticated,
  authorizeRoles("manager","Enduser"),
  getCostRollupController,
);

export default reportingRouter;