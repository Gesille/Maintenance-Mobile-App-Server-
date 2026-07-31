import CategoryModel from "../models/Category.model.js";
import EquipmentModel from "../models/equipment.model.js";


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


const SYNC_COLOR_PALETTE = [
  "#6366F1", "#F97316", "#22C55E", "#EC4899", "#14B8A6",
  "#F59E0B", "#3B82F6", "#8B5CF6", "#EF4444", "#10B981",
];

function escapeRegex(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function syncCategoriesFromEquipment() {
  const distinct: (string | null)[] = await EquipmentModel.distinct("category");
  const names = distinct.filter((c): c is string => !!c && c.trim().length > 0);
  if (!names.length) return;
  const existing = await CategoryModel.find({
    name: { $in: names.map((n) => new RegExp(`^${escapeRegex(n.trim())}$`, "i")) },
  })
    .select("name")
    .lean();

  const existingLower = new Set(existing.map((c) => c.name.toLowerCase()));
  const missing = names.filter((n) => !existingLower.has(n.trim().toLowerCase()));
  if (!missing.length) return;

  for (let i = 0; i < missing.length; i++) {
    try {
      await CategoryModel.create({
        name: missing[i].trim(),
        icon: "Tag",
        color: SYNC_COLOR_PALETTE[i % SYNC_COLOR_PALETTE.length],
        description: null,
        createdByName: "System (synced from equipment)",
      });
    } catch (err: any) {

      if (err.code !== 11000) throw err;
    }
  }
}

// ─── Queries ────────────────────────────────────────────────────────────────

export async function fetchAllCategories(search?: string) {
  await syncCategoriesFromEquipment(); 

  const query: Record<string, any> = { active: true };
  if (search) {
    query.name = { $regex: search, $options: "i" };
  }
  return CategoryModel.find(query).sort({ name: 1 }).lean();
}

export async function fetchCategoryById(id: number) {
  return CategoryModel.findOne({ id }).lean();
}

// ── rest of the file (createCategoryService, updateCategoryService, deleteCategoryService) unchanged ──

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