import { Router } from "express";
import { authorizeRoles, isAuthenticated } from "../middleware/auth.js";
import { getReportingSummaryController, getCreatedVsCompletedController, getReactiveVsRepeatableController, getStatusBreakdownController, getPriorityBreakdownController } from "../controllers/Reporting.controller.js";


const reportingRouter = Router();

reportingRouter.get(
  "/summary",
  isAuthenticated,
  authorizeRoles("manager"),
  getReportingSummaryController,
);
reportingRouter.get(
  "/created-vs-completed",
  isAuthenticated,
  authorizeRoles("manager"),
  getCreatedVsCompletedController,
);
reportingRouter.get(
  "/reactive-vs-repeatable",
  isAuthenticated,
  authorizeRoles("manager"),
  getReactiveVsRepeatableController,
);
reportingRouter.get(
  "/status-breakdown",
  isAuthenticated,
  authorizeRoles("manager"),
  getStatusBreakdownController,
);
reportingRouter.get(
  "/priority-breakdown",
  isAuthenticated,
  authorizeRoles("manager"),
  getPriorityBreakdownController,
);

export default reportingRouter;