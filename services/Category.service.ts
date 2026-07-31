import CategoryModel from "../models/Category.model.js";


export interface CreateCategoryInput {
  name: string;
  icon?: string;
  color?: string;
  description?: string | null;
  createdByName: string;
}

export interface UpdateCategoryInput {
  name?: string;
  icon?: string;
  color?: string;
  description?: string | null;
}

// ─── Queries ────────────────────────────────────────────────────────────────

export async function fetchAllCategories(search?: string) {
  const query: Record<string, any> = { active: true };
  if (search) {
    query.name = { $regex: search, $options: "i" };
  }
  return CategoryModel.find(query).sort({ name: 1 }).lean();
}

export async function fetchCategoryById(id: number) {
  return CategoryModel.findOne({ id }).lean();
}

// ─── Create / update / delete ────────────────────────────────────────────────

export async function createCategoryService(input: CreateCategoryInput) {
  const category = await CategoryModel.create({
    name: input.name,
    icon: input.icon ?? "Tag",
    color: input.color ?? "#6366F1",
    description: input.description ?? null,
    createdByName: input.createdByName,
  });
  return category.toObject();
}

export async function updateCategoryService(id: number, data: UpdateCategoryInput) {
  const updated = await CategoryModel.findOneAndUpdate(
    { id },
    { $set: data },
    { new: true, runValidators: true },
  );
  return updated; // null if not found
}

export async function deleteCategoryService(id: number) {
  // Soft delete — keeps history on anything that referenced this category by name.
  const deleted = await CategoryModel.findOneAndUpdate(
    { id },
    { $set: { active: false } },
    { new: true },
  );
  return deleted;
}