export interface IEquipment {
  id: number;
  name: string;
  category: string | null;
  maintenanceTeam: string | null;
  technician: string | null;
  owner: string | null;
  assignedDate: string | null;
  scrapDate: string | null;
  usedInLocation: string | null;
  restaurant: string | null;
  assetCode: string | null;
  reference: string | null;
  vendor: string | null;
  vendorReference: string | null;
  model: string | null;
  serialNumber: string | null;
  effectiveDate: string | null;
  cost: number;
  warrantyExpirationDate: string | null;
  description: string | null;
}

export interface IOdooEquipmentRaw {
  id: number;
  name: string;
  category_id: [number, string] | false;
  maintenance_team_id: [number, string] | false;
  technician_user_id: [number, string] | false;
  owner_user_id: [number, string] | false;
  assign_date: string | false;
  scrap_date: string | false;
  "x_location": [number, string] | false;  
  x_restaurant: string | false;
  x_asset_code: string | false;           
  partner_ref: string | false;
  partner_id: [number, string] | false;
  vendor_ref: string | false;
  model: string | false;
  serial_no: string | false;
  effective_date: string | false;
  cost: number;
  warranty_date: string | false;
  note: string | false;
  active: boolean;
}