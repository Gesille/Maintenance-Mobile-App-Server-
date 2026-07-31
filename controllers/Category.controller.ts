import { NextFunction, Request, Response } from "express";
import ErrorHandler from "../utils/ErrorHandler.js";
import { fetchAllCategories, fetchCategoryById, createCategoryService, updateCategoryService, deleteCategoryService } from "../services/Category.service.js";

// ─── Get all categories 

export const getAllCategories = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search } = req.query as { search?: string };
    const categories = await fetchAllCategories(search);

    res.status(200).json({ success: true, total: categories.length, data: categories });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── Get category by ID 

export const getCategoryById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid ID" });

    const category = await fetchCategoryById(id);
    if (!category) return res.status(404).json({ success: false, message: "Category not found" });

    res.status(200).json({ success: true, data: category });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── Create category ──────────────────────────────────────────────────────────

export const createCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, icon, color, description } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ success: false, message: "name is required" });
    }

    const actor = req.user as any;
    const category = await createCategoryService({
      name: name.trim(),
      icon,
      color,
      description,
      createdByName: actor?.name ?? "Unknown",
    });

    res.status(201).json({ success: true, message: "Category created successfully", data: category });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: "A category with this name already exists" });
    }
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── Update category ──────────────────────────────────────────────────────────

export const updateCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid ID" });

    const { name, icon, color, description } = req.body;

    const updated = await updateCategoryService(id, { name, icon, color, description });
    if (!updated) return res.status(404).json({ success: false, message: "Category not found" });

    res.status(200).json({ success: true, message: "Category updated successfully", data: updated });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: "A category with this name already exists" });
    }
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};

// ─── Delete category (soft) ───────────────────────────────────────────────────

export const deleteCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid ID" });

    const deleted = await deleteCategoryService(id);
    if (!deleted) return res.status(404).json({ success: false, message: "Category not found" });

    res.status(200).json({ success: true, message: "Category deleted successfully" });
  } catch (error: any) {
    return next(new ErrorHandler(error.message || "Something went wrong", 400));
  }
};