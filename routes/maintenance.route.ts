import { Router } from "express";
import { authorizeRoles, isAuthenticated } from "../middleware/auth.js";
import { assignTechnicians, completeRequestByTechnician, createMaintenanceRequestManual, deleteMaintenanceRequest, getAllMaintenanceRequests, getMaintenanceRequestDetail, getMaintenanceRequestMessages, getMyAssignedRequests, getMyReportedRequests, postMaintenanceRequestComment, submitUserReview, updateMaintenanceRequestSchedule, updateMaintenanceRequestStatus } from "../controllers/maintenance.controller.js";
import { uploadMaintenanceMedia } from "../middleware/upload.js";


const maintenanceRouter = Router();

maintenanceRouter.get("/get-requests", isAuthenticated, getAllMaintenanceRequests);
maintenanceRouter.get( "/get-request-detail/:id", isAuthenticated,authorizeRoles("manager","Enduser") ,getMaintenanceRequestDetail);
maintenanceRouter.patch("/update-request-status/:id", isAuthenticated,authorizeRoles("manager","Enduser") ,updateMaintenanceRequestStatus);  
maintenanceRouter.patch("/assign-technicians/:id", isAuthenticated,authorizeRoles("manager","Enduser") ,assignTechnicians);               
maintenanceRouter.delete("/delete-request/:id", isAuthenticated,authorizeRoles("manager","Enduser") ,deleteMaintenanceRequest);    
maintenanceRouter.get("/get-request-messages/:id", isAuthenticated, getMaintenanceRequestMessages);
maintenanceRouter.post("/post-request-message/:id", isAuthenticated, postMaintenanceRequestComment);
maintenanceRouter.post(
  "/create-request-manager",
  isAuthenticated,
  authorizeRoles("manager","Enduser"),
  uploadMaintenanceMedia.array("files", 10),
  createMaintenanceRequestManual,
);
maintenanceRouter.patch("/maintenance-schedule/:id", isAuthenticated, updateMaintenanceRequestSchedule);
maintenanceRouter.get("/get-my-requests", isAuthenticated, authorizeRoles("technician"), getMyAssignedRequests);
maintenanceRouter.patch("/complete-request/:id", isAuthenticated, authorizeRoles("technician"), completeRequestByTechnician);

maintenanceRouter.get("/get-my-reported-requests", isAuthenticated, authorizeRoles("Enduser"), getMyReportedRequests);
maintenanceRouter.patch("/submit-review/:id", isAuthenticated, authorizeRoles("Enduser"), submitUserReview);
export default maintenanceRouter;