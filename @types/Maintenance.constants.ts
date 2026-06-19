export const MAINTENANCE_REQUEST_FIELDS = [
  "id",
  "name",
  "description",
  "priority",
  "stage_id",
  "maintenance_type",
  "equipment_id",
  "category_id",
  "maintenance_team_id",
  "user_ids",
  "owner_user_id",
  "create_date",
  "schedule_date",
  "schedule_end",
  "close_date",
  "duration",
  "color",
  "recurring_maintenance",
] as const;

export const EQUIPMENT_FIELDS = [
  "id",
  "name",
  "category_id",
  "maintenance_team_id",
  "technician_user_id",
  "owner_user_id",
  "assign_date",
  "scrap_date",
  "x_location",
  "x_restaurant",
  // "x_asset_code",
  "partner_ref",
  "partner_id",
  "model",
  "serial_no",
  "effective_date",
  "cost",
  "warranty_date",
  "note",
  "active",
] as const;

export const STAGE_FIELDS = ["id", "name", "sequence", "fold"] as const;

export const MESSAGE_FIELDS = [
  "id",
  "body",
  "author_id",
  "date",
  "message_type",
  "subtype_id",
  "parent_id",
] as const;

export const PRIORITY_LABEL: Record<string, string> = {
  "0": "Normal",
  "1": "High",
  "3": "Very Urgent",
};