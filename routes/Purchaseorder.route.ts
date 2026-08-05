import { Router } from "express";

import { authorizeRoles, isAuthenticated } from "../middleware/auth.js";
import { approvePurchaseOrder, cancelPurchaseOrder, createPurchaseOrder, createPurchaseOrderFromPart, declinePurchaseOrder, deletePurchaseOrder, fulfillPurchaseOrderItems, getAllPurchaseOrders, getPurchaseOrderById, markPurchaseOrderAsOrdered, updatePurchaseOrder } from "../controllers/Purchaseorder.controller.js";


const purchaseOrderRouter = Router();

// Full Users (Enduser/technician) can view and request; Administrators
// (manager) can do everything else — same split MaintainX uses.

purchaseOrderRouter.get(
  "/get-all-purchase-orders",
  isAuthenticated,
  authorizeRoles("manager", "Enduser"),
  getAllPurchaseOrders,
);
purchaseOrderRouter.get(
  "/get-purchase-order/:id",
  isAuthenticated,
  authorizeRoles("manager", "Enduser"),
  getPurchaseOrderById,
);

// Anyone can request a PO — createPurchaseOrderService decides whether it
// lands as "approved" (Administrator) or "requested" (Full User).
purchaseOrderRouter.post(
  "/create-purchase-order",
  isAuthenticated,
  authorizeRoles("manager", "Enduser"),
  createPurchaseOrder,
);
purchaseOrderRouter.post(
  "/order-part/:partId",
  isAuthenticated,
  authorizeRoles("manager", "Enduser"),
  createPurchaseOrderFromPart,
);

purchaseOrderRouter.put(
  "/update-purchase-order/:id",
  isAuthenticated,
  authorizeRoles("manager","Enduser"),
  updatePurchaseOrder,
);
purchaseOrderRouter.delete(
  "/delete-purchase-order/:id",
  isAuthenticated,
  authorizeRoles("manager","Enduser"),
  deletePurchaseOrder,
);
purchaseOrderRouter.patch(
  "/approve/:id",
  isAuthenticated,
  authorizeRoles("manager","Enduser"),
  approvePurchaseOrder,
);
purchaseOrderRouter.patch(
  "/decline/:id",
  isAuthenticated,
  authorizeRoles("manager","Enduser"),
  declinePurchaseOrder,
);
purchaseOrderRouter.patch(
  "/mark-ordered/:id",
  isAuthenticated,
  authorizeRoles("manager","Enduser"    ),
  markPurchaseOrderAsOrdered,
);
purchaseOrderRouter.patch(
  "/cancel/:id",
  isAuthenticated,
  authorizeRoles("manager","Enduser"),
  cancelPurchaseOrder,
);
purchaseOrderRouter.patch(
  "/fulfill-items/:id",
  isAuthenticated,
  authorizeRoles("manager","Enduser"),
  fulfillPurchaseOrderItems,
);

export default purchaseOrderRouter;