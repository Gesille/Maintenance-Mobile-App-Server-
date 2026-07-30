import { Router } from "express";
import { authorizeRoles, isAuthenticated } from "../middleware/auth.js";
import { assignTechnicians, createMaintenanceRequestManual, deleteMaintenanceRequest, getAllMaintenanceRequests, getMaintenanceRequestDetail, getMaintenanceRequestMessages, postMaintenanceRequestComment, updateMaintenanceRequestStatus } from "../controllers/maintenance.controller.js";
import { uploadMaintenanceMedia } from "../middleware/upload.js";


const maintenanceRouter = Router();

maintenanceRouter.get("/get-requests", isAuthenticated, getAllMaintenanceRequests);
maintenanceRouter.get( "/get-request-detail/:id", isAuthenticated,authorizeRoles("manager") ,getMaintenanceRequestDetail);
maintenanceRouter.patch("/update-request-status/:id", isAuthenticated,authorizeRoles("manager") ,updateMaintenanceRequestStatus);  
maintenanceRouter.patch("/assign-technicians/:id", isAuthenticated,authorizeRoles("manager") ,assignTechnicians);               
maintenanceRouter.delete("/delete-request/:id", isAuthenticated,authorizeRoles("manager") ,deleteMaintenanceRequest);    
maintenanceRouter.get("/get-request-messages/:id", isAuthenticated, getMaintenanceRequestMessages);
maintenanceRouter.post("/post-request-message/:id", isAuthenticated, postMaintenanceRequestComment);
maintenanceRouter.post(
  "/create-request",
  isAuthenticated,
  authorizeRoles("manager"),
  uploadMaintenanceMedia.array("files", 10),
  createMaintenanceRequestManual,
);
export default maintenanceRouter;