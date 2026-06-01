import cloudinary from "cloudinary"

import dotenv from "dotenv";

dotenv.config();

cloudinary.v2.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

export default cloudinary;
export const uploadImage = async (file: string) => {
  const result = await cloudinary.v2.uploader.upload(file, {
    folder: "products",
  });

  return {
    url: result.secure_url,
    public_id: result.public_id,
  };
};