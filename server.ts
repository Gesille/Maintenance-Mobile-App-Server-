import { v2 as cloudinary } from "cloudinary";
import { app } from "./app.js";
import connectDB from "./utils/db.js";
import dotenv from "dotenv";
dotenv.config();

cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.CLOUD_API_KEY,
    api_secret: process.env.CLOUD_SECRET_KEY,
});

const PORT = Number(process.env.PORT) || 8000;  

app.listen(PORT, '0.0.0.0', async () => {
    console.log(`Server running on port ${PORT}`);
    await connectDB();
});

process.on("uncaughtException", (err: Error) => {
  console.error("━━━ 💥 uncaughtException ━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.error("Message :", err.message);
  console.error("Stack   :", err.stack);   
  process.exit(1);
});

process.on("unhandledRejection", (reason: any) => {
  console.error("━━━ 💥 unhandledRejection ━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.error("Reason  :", reason?.message ?? reason);
  console.error("Stack   :", reason?.stack);   // ← shows exact file + line
  process.exit(1);
});