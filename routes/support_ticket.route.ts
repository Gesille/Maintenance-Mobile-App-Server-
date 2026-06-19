import express from "express";
import {
  createTicket,
  getMyTickets,
  getTicketById,
  getAllTickets,
  updateTicket,
  listModels,
} from "../controllers/support_ticket.controller.js";
import { isAuthenticated } from "../middleware/auth.js";
import { refreshTokenMiddleware } from "../controllers/user.controller.js";

const supportTicketRouter = express.Router();

// ─── User routes ──────────────────────────────────────────────────────────────
supportTicketRouter.post(
  "/create-ticket",
  
  isAuthenticated,
  createTicket,
);
supportTicketRouter.get(
  "/my-tickets",
  
  isAuthenticated,
  getMyTickets,
);
supportTicketRouter.get(
  "/my-tickets/:id",

  isAuthenticated,
  getTicketById,
);

// ─── Admin / manager routes ───────────────────────────────────────────────────
supportTicketRouter.get(
  "/all-tickets",
 
  isAuthenticated,
  getAllTickets,
);
supportTicketRouter.put(
  "/update-ticket/:id",
 
  isAuthenticated,
  updateTicket,
);
supportTicketRouter.get(
  "/list-models",
  listModels,
);

export default supportTicketRouter;