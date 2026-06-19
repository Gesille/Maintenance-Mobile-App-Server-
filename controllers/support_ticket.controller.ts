import { Request, Response, NextFunction } from "express";
import { CatchAsyncError } from "../middleware/catchAsyncError.js";
import ErrorHandler from "../utils/ErrorHandler.js";
import { odooRequest } from "../odoo/odoo.client.js";
import sendMail from "../utils/sendMail.js";


// Odoo model name for support tickets
const TICKET_MODEL = "x_support.ticket";

export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
export type TicketCategory =
  | "technical_issue"
  | "request_not_updating"
  | "account_login"
  | "equipment"
  | "other";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Map an Odoo record to a clean ticket object for API responses */
function formatTicket(record: any) {
  return {
    id:         record.id,
    userId:     record.x_user_id,
    userName:   record.x_user_name,
    userEmail:  record.x_user_email,
    category:   record.x_category,
    subject:    record.x_name,
    message:    record.x_message,
    status:     record.x_status,
    adminReply: record.x_admin_reply   || null,
    repliedAt:  record.x_replied_at    || null,
    createdAt:  record.create_date,
    updatedAt:  record.write_date,
  };
}

// ─── Create ticket ────────────────────────────────────────────────────────────
export const createTicket = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { category, subject, message } = req.body;

      if (!category || !subject || !message) {
        return next(new ErrorHandler("category, subject and message are required", 400));
      }

      const user = req.user;
      if (!user) return next(new ErrorHandler("Not authenticated", 401));

     const newId = await odooRequest(TICKET_MODEL, "create", [
  {
    x_user_id:    String(user._id),
    x_user_name:  user.name,
    x_user_email: user.email,
    x_category:   category as TicketCategory,
    x_name:       subject.trim(),
    x_message:    message.trim(),
    x_status:     "open" as TicketStatus,
  },
]);

      // Fetch the created record to return it
      const records = await odooRequest(TICKET_MODEL, "read", [[newId]], {
        fields: [
          "id", "x_name",
          "x_user_id", "x_user_name", "x_user_email",
          "x_category", "x_message", "x_status",
          "x_admin_reply", "x_replied_at",
          "create_date", "write_date",
        ],
      });

      res.status(201).json({
        success: true,
        message: "Ticket submitted successfully",
        data: formatTicket(records[0]),
      });
  
sendMail({
  email: process.env.MAINTENANCE_EMAIL as string, 
  subject: `New Support Ticket [TKT-${newId}] — ${subject}`,
  template: "support-ticket.ejs",
  data: {
    id:        newId,
    userName:  user.name,
    userEmail: user.email,
    category,
    subject,
    message,
    status:    "open",
  },
}).catch(console.error); 
    } catch (error: any) {
      return next(new ErrorHandler(error.message || "Something went wrong", 400));
    }
  },
);

// ─── Get my tickets ───────────────────────────────────────────────────────────
export const getMyTickets = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?._id;
      if (!userId) return next(new ErrorHandler("Not authenticated", 401));

      const records = await odooRequest(
        TICKET_MODEL,
        "search_read",
        [[["x_user_id", "=", String(userId)]]],
        {
          fields: [
            "id", "x_name",
            "x_user_id", "x_user_name", "x_user_email",
            "x_category", "x_message", "x_status",
            "x_admin_reply", "x_replied_at",
            "create_date", "write_date",
          ],
          order: "create_date desc",
        },
      );

      res.status(200).json({
        success: true,
        total: records.length,
        data: records.map(formatTicket),
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message || "Something went wrong", 400));
    }
  },
);

// ─── Get ticket by ID ─────────────────────────────────────────────────────────
export const getTicketById = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return next(new ErrorHandler("Invalid ticket ID", 400));

      const records = await odooRequest(TICKET_MODEL, "read", [[id]], {
        fields: [
          "id", "x_name",
          "x_user_id", "x_user_name", "x_user_email",
          "x_category", "x_message", "x_status",
          "x_admin_reply", "x_replied_at",
          "create_date", "write_date",
        ],
      });

      if (!records || records.length === 0) {
        return next(new ErrorHandler("Ticket not found", 404));
      }

      const ticket = records[0];

      // Users can only see their own tickets
      if (ticket.x_user_id !== String(req.user?._id)) {
        return next(new ErrorHandler("Unauthorized", 403));
      }

      res.status(200).json({ success: true, data: formatTicket(ticket) });
    } catch (error: any) {
      return next(new ErrorHandler(error.message || "Something went wrong", 400));
    }
  },
);

// ─── Admin: get all tickets ───────────────────────────────────────────────────
export const getAllTickets = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.user?.role !== "admin" && req.user?.role !== "manager") {
        return next(new ErrorHandler("Not authorized", 403));
      }

      const { status } = req.query;

      // Build Odoo domain filter
      const domain: any[] = status ? [["x_status", "=", status]] : [];

      const records = await odooRequest(
        TICKET_MODEL,
        "search_read",
        [domain],
        {
          fields: [
            "id", "x_name",
            "x_user_id", "x_user_name", "x_user_email",
            "x_category", "x_message", "x_status",
            "x_admin_reply", "x_replied_at",
            "create_date", "write_date",
          ],
          order: "create_date desc",
        },
      );

      res.status(200).json({
        success: true,
        total: records.length,
        data: records.map(formatTicket),
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message || "Something went wrong", 400));
    }
  },
);

// ─── Admin: update ticket status + reply ─────────────────────────────────────
export const updateTicket = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.user?.role !== "admin" && req.user?.role !== "manager") {
        return next(new ErrorHandler("Not authorized", 403));
      }

      const id = Number(req.params.id);
      if (isNaN(id)) return next(new ErrorHandler("Invalid ticket ID", 400));

      const { status, adminReply } = req.body as {
        status?: TicketStatus;
        adminReply?: string;
      };

      // Check ticket exists
      const existing = await odooRequest(TICKET_MODEL, "read", [[id]], {
        fields: ["id"],
      });
      if (!existing || existing.length === 0) {
        return next(new ErrorHandler("Ticket not found", 404));
      }

      // Build update payload
      const values: Record<string, any> = {};
      if (status)     values.x_status = status;
      if (adminReply) {
        values.x_admin_reply = adminReply;
        values.x_replied_at  = new Date().toISOString();
      }

     
await odooRequest(TICKET_MODEL, "write", [[id], values]);

      // Return updated record
      const records = await odooRequest(TICKET_MODEL, "read", [[id]], {
        fields: [
          "id", "x_name",
          "x_user_id", "x_user_name", "x_user_email",
          "x_category", "x_message", "x_status",
          "x_admin_reply", "x_replied_at",
          "create_date", "write_date",
        ],
      });

      res.status(200).json({
        success: true,
        message: "Ticket updated",
        data: formatTicket(records[0]),
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message || "Something went wrong", 400));
    }
  },
);


export const listModels = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  const models = await odooRequest("ir.model", "search_read", [[]], {
    fields: ["model", "name"],
  });
  // Return ALL models so we can see the exact name
  res.json({ models });
});