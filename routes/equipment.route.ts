import { Router } from "express";
import {
    createMaintenanceRequest,
  getAllEquipment,
 
  getEquipmentById,

 
  printAllQRPdf,
  printSingleQRPdf,
  scanEquipmentQR,
} from "../controllers/equipment.controller.js";
import { isAuthenticated } from "../middleware/auth.js";
import { refreshTokenMiddleware } from "../controllers/user.controller.js";
import { getAllMaintenanceRequests } from "../controllers/maintenance.controller.js";
import { uploadMaintenanceMedia } from "../middleware/upload.js";
const equipmentRouter = Router();

equipmentRouter.get("/get-all-equipment",refreshTokenMiddleware, isAuthenticated, getAllEquipment);
equipmentRouter.get("/get-equipment/:id", refreshTokenMiddleware, isAuthenticated, getEquipmentById);
equipmentRouter.get("/get-all-qr", refreshTokenMiddleware, isAuthenticated, printAllQRPdf);
equipmentRouter.get("/get-qr/:id", refreshTokenMiddleware, isAuthenticated, printSingleQRPdf);
equipmentRouter.get("/scan/:id",refreshTokenMiddleware, isAuthenticated, scanEquipmentQR);
equipmentRouter.post(
  "/create-request",
  refreshTokenMiddleware,
  isAuthenticated,
   uploadMaintenanceMedia.array('files', 10),
  createMaintenanceRequest,
);
equipmentRouter.get(
  "/get-all-requests",
  refreshTokenMiddleware,
  isAuthenticated,
  getAllMaintenanceRequests
)



export default equipmentRouter;
