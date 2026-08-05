import { Router } from "express";

import { authorizeRoles, isAuthenticated } from "../middleware/auth.js";
import { getAllCategories, getCategoryById, createCategory, updateCategory, deleteCategory } from "../controllers/Category.controller.js";

const categoryRouter = Router();

categoryRouter.get("/get-all-categories", isAuthenticated, authorizeRoles("manager","Enduser"),getAllCategories);
categoryRouter.get("/get-category/:id", isAuthenticated, authorizeRoles("manager","Enduser"),getCategoryById);
categoryRouter.post("/create-category", isAuthenticated, authorizeRoles("manager","Enduser"),createCategory);
categoryRouter.put("/update-category/:id", isAuthenticated, authorizeRoles("manager","Enduser"),updateCategory);
categoryRouter.delete("/delete-category/:id", isAuthenticated, authorizeRoles("manager","Enduser"),deleteCategory);

export default categoryRouter;