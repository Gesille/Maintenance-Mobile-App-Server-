
import { v2 as cloudinary } from "cloudinary";
import http from "http";
import { app } from "./app.js";
import connectDB from "./utils/db.js";
import dotenv from "dotenv";
dotenv.config();

const server = http.createServer(app);

cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.CLOUD_API_KEY,
    api_secret: process.env.CLOUD_SECRET_KEY,
});



console.log("",process.env.DB_URL);
server.listen(process.env.PORT, () => {
    console.log(`Server is connected with port ${process.env.PORT}`);
    connectDB();
});
