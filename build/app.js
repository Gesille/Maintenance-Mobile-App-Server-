// app.ts
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { ErrorMiddleware } from "./middleware/error.js";
import dotenv from "dotenv";
import userRouter from "./routes/user.route.js";
import equipmentRouter from "./routes/equipment.route.js";
import maintenanceRouter from "./routes/maintenance.route.js";
import supportTicketRouter from "./routes/support_ticket.route.js";
dotenv.config();
export const app = express();
// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Cookie parser
app.use(cookieParser());
// CORS
app.use(cors({
    origin: "http://localhost:8000",
    credentials: true,
}));
// Rate limiter — BEFORE routes
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
});
app.use(limiter);
// Routes
app.use("/api/v1", userRouter);
app.use("/api/v1", equipmentRouter);
app.use("/api/v1", maintenanceRouter);
app.use("/api/v1", supportTicketRouter);
// Test route
app.get("/test", (req, res, next) => {
    res.status(200).json({
        success: true,
        message: "API is working!",
    });
});
// Unknown route
app.use((req, res, next) => {
    const err = new Error(`Route ${req.originalUrl} not found`);
    err.statusCode = 404;
    next(err);
});
// Error middleware — always last
app.use(ErrorMiddleware);
app.use((err, req, res, next) => {
    console.error("━━━ 🔴 Express Error ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error("Route   :", req.method, req.originalUrl);
    console.error("Message :", err.message);
    console.error("Stack   :", err.stack); // ← shows exact file + line
    res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || "Internal Server Error",
    });
});
