import { Router } from "express";
import { authorizeRoles, isAuthenticated } from "../middleware/auth.js";
import { getReportingSummaryController, getCreatedVsCompletedController, getReactiveVsRepeatableController, getStatusBreakdownController, getPriorityBreakdownController } from "../controllers/Reporting.controller.js";


const reportingRouter = Router();

reportingRouter.get(
  "reporting/summary",
  isAuthenticated,
  authorizeRoles("manager"),
  getReportingSummaryController,
);
reportingRouter.get(
  "reporting/created-vs-completed",
  isAuthenticated,
  authorizeRoles("manager"),
  getCreatedVsCompletedController,
);
reportingRouter.get(
  "reporting/reactive-vs-repeatable",
  isAuthenticated,
  authorizeRoles("manager"),
  getReactiveVsRepeatableController,
);
reportingRouter.get(
  "reporting/status-breakdown",
  isAuthenticated,
  authorizeRoles("manager"),
  getStatusBreakdownController,
);
reportingRouter.get(
  "reporting/priority-breakdown",
  isAuthenticated,
  authorizeRoles("manager"),
  getPriorityBreakdownController,
);

export default reportingRouter;