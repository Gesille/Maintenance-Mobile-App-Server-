// app.ts
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { ErrorMiddleware } from "./middleware/error.js";
import dotenv from "dotenv";
import userRouter from "./routes/user.route.js";
import equipmentRouter from "./routes/equipment.route.js";
import maintenanceRouter from "./routes/maintenance.route.js";
import supportTicketRouter from "./routes/support_ticket.route.js";
import reportingRouter from "./routes/Reporting.route.js";
import partRouter from "./routes/Part.route.js";

dotenv.config();

export const app = express();

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true })); 
// Cookie parser
app.use(cookieParser());

// CORS
app.use(
  cors({
    origin:[
       "http://localhost:8000",
      "https://maintenance-dashboard-lime.vercel.app"
      ],
    credentials: true,
  })
);

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
app.use("/api/v1", reportingRouter);
app.use("/api/v1", partRouter);
// Test route
app.get("/test", (req: Request, res: Response, next: NextFunction) => {
    res.status(200).json({
        success: true,
        message: "API is working!",
    });
});

// Unknown route
app.use((req: Request, res: Response, next: NextFunction) => {
    const err = new Error(`Route ${req.originalUrl} not found`) as any;
    err.statusCode = 404;
    next(err);
});

// Error middleware — always last
app.use(ErrorMiddleware);

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error("━━━ 🔴 Express Error ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.error("Route   :", req.method, req.originalUrl);
  console.error("Message :", err.message);
  console.error("Stack   :", err.stack);   // ← shows exact file + line
  
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});