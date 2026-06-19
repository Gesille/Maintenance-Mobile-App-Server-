import multer from "multer";
import path from "path";
import fs from "fs";

const tempDir = path.join(process.cwd(), "temp");

if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_, __, cb) => {
    cb(null, tempDir);
  },

  filename: (_, file, cb) => {
    const unique =
      Date.now() + "-" + Math.round(Math.random() * 1e9);

    cb(
      null,
      `${unique}${path.extname(file.originalname)}`
    );
  },
});

export const uploadMaintenanceMedia = multer({
  storage,
  limits: {
    fileSize: 200 * 1024 * 1024,
  },
});