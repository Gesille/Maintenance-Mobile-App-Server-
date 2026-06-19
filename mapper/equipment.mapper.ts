import { IOdooEquipmentRaw, IEquipment } from "../models/equipment.model.js";


export const mapEquipment = (item: IOdooEquipmentRaw): IEquipment => ({
  id: item.id,
  name: item.name,
  category: item.category_id ? item.category_id[1] : null,
  maintenanceTeam: item.maintenance_team_id ? item.maintenance_team_id[1] : null,
  technician: item.technician_user_id ? item.technician_user_id[1] : null,
  owner: item.owner_user_id ? item.owner_user_id[1] : null,
  assignedDate: item.assign_date || null,
  scrapDate: item.scrap_date || null,
  usedInLocation: item.x_location ? item.x_location[1] : null,  
  restaurant: item.x_restaurant || null,
  assetCode: item.x_asset_code || null,                         
  reference: item.partner_ref || null,
  vendor: item.partner_id ? item.partner_id[1] : null,
  vendorReference: item.vendor_ref || null,
  model: item.model || null,
  serialNumber: item.serial_no || null,
  effectiveDate: item.effective_date || null,
  cost: item.cost ?? 0,
  warrantyExpirationDate: item.warranty_date || null,
  description: item.note || null,
});

export const mapEquipmentList = (items: IOdooEquipmentRaw[]): IEquipment[] =>
  items.map(mapEquipment);