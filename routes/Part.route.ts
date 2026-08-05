import { Router } from "express";
import { authorizeRoles, isAuthenticated } from "../middleware/auth.js";
import { refreshTokenMiddleware } from "../controllers/user.controller.js";
import {
  getAllParts,
  getPartById,
  getLowStockParts,
  getPartsByEquipment,
  getPartStockHistory,
  createPart,
  updatePart,
  deletePart,
  restockPart,
  consumePart,
  adjustPartQuantity,
  linkPartToEquipment,
  unlinkPartFromEquipment,
} from "../controllers/Part.controller.js";

const partRouter = Router();

// ─── Reads — any authenticated user (manager, technician) ──────────────────
partRouter.get("/get-all-parts", refreshTokenMiddleware, isAuthenticated, getAllParts);
partRouter.get("/get-part/:id", refreshTokenMiddleware, isAuthenticated, getPartById);
partRouter.get("/low-stock", refreshTokenMiddleware, isAuthenticated, getLowStockParts);
partRouter.get(
  "/by-equipment/:equipmentId",
  refreshTokenMiddleware,
  isAuthenticated,
  getPartsByEquipment,
);
partRouter.get(
  "/stock-history/:id",
  refreshTokenMiddleware,
  isAuthenticated,
  getPartStockHistory,
);

// ─── Catalog management — managers only ─────────────────────────────────────
partRouter.post(
  "/create-part",
  refreshTokenMiddleware,
  isAuthenticated,
  authorizeRoles("manager"),
  createPart,
);
partRouter.put(
  "/update-part/:id",
  refreshTokenMiddleware,
  isAuthenticated,
  authorizeRoles("manager","Enduser"),
  updatePart,
);
partRouter.delete(
  "/delete-part/:id",
  refreshTokenMiddleware,
  isAuthenticated,
  authorizeRoles("manager","Enduser"),
  deletePart,
);

// ─── Stock movement ──────────────────────────────────────────────────────────
// Restock/adjust are manager-only (financial + count-correction actions).
// Consume is open to technicians too — they're the ones using parts on a job.
partRouter.patch(
  "/restock/:id",
  refreshTokenMiddleware,
  isAuthenticated,
  authorizeRoles("manager","Enduser"),
  restockPart,
);
partRouter.patch("/consume/:id", refreshTokenMiddleware, isAuthenticated, consumePart);
partRouter.patch(
  "/adjust/:id",
  refreshTokenMiddleware,
  isAuthenticated,
  authorizeRoles("manager","Enduser"),
  adjustPartQuantity,
);

// ─── Equipment linking — managers only ──────────────────────────────────────
partRouter.post(
  "/link-equipment/:id",
  refreshTokenMiddleware,
  isAuthenticated,
  authorizeRoles("manager","Enduser"),
  linkPartToEquipment,
);
partRouter.delete(
  "/unlink-equipment/:id/:equipmentId",
  refreshTokenMiddleware,
  isAuthenticated,
  authorizeRoles("manager","Enduser"),
  unlinkPartFromEquipment,
);

export default partRouter;