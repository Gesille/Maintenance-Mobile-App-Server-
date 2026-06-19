import cloudinary from "cloudinary"
import fs from "fs";


import dotenv from "dotenv";

dotenv.config();

cloudinary.v2.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

export const uploadMedia = async (
  filePath: string,
  resourceType: "image" | "video" = "image",
) => {
  const result = await cloudinary.v2.uploader.upload(filePath, {
    folder: "maintenance-app",
    resource_type: resourceType,
  });

  // remove temp file after upload
  fs.unlinkSync(filePath);

  return {
    url: result.secure_url,
    public_id: result.public_id,
    resource_type: result.resource_type,
  };
};