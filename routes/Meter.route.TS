import { Router } from "express";

import { authorizeRoles, isAuthenticated } from "../middleware/auth.js";
import {
  getAllMeters,
  getMeterById,
  createMeter,
  updateMeter,
  deleteMeter,
  addMeterTrigger,
  updateMeterTrigger,
  removeMeterTrigger,
  recordMeterReading,
  getMeterReadingHistory,
  getMeterChartData,
} from "../controllers/Meter.controller.js";

const meterRouter = Router();

// Reads — anyone authenticated (Full Users need to see meter status/history same as MaintainX)
meterRouter.get("/get-all-meters", isAuthenticated, getAllMeters);
meterRouter.get("/get-meter/:id", isAuthenticated, getMeterById);
meterRouter.get("/get-reading-history/:id", isAuthenticated, getMeterReadingHistory);
meterRouter.get("/get-chart-data/:id", isAuthenticated, getMeterChartData);

// Meter + trigger management — Administrators (manager) and Full Users (Enduser),
// same split every other module in this app uses.
meterRouter.post("/create-meter", isAuthenticated, authorizeRoles("manager", "Enduser"), createMeter);
meterRouter.put("/update-meter/:id", isAuthenticated, authorizeRoles("manager", "Enduser"), updateMeter);
meterRouter.delete("/delete-meter/:id", isAuthenticated, authorizeRoles("manager", "Enduser"), deleteMeter);

meterRouter.post(
  "/add-trigger/:id",
  isAuthenticated,
  authorizeRoles("manager", "Enduser"),
  addMeterTrigger,
);
meterRouter.put(
  "/update-trigger/:id/:triggerId",
  isAuthenticated,
  authorizeRoles("manager", "Enduser"),
  updateMeterTrigger,
);
meterRouter.delete(
  "/remove-trigger/:id/:triggerId",
  isAuthenticated,
  authorizeRoles("manager", "Enduser"),
  removeMeterTrigger,
);


meterRouter.post(
  "/record-reading/:id",
  isAuthenticated,
  authorizeRoles("manager", "Enduser", "technician"),
  recordMeterReading,
);

export default meterRouter;