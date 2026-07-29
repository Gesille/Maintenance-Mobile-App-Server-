import { Request, Response, NextFunction } from "express";
import { CatchAsyncError } from "../middleware/catchAsyncError.js";
import ErrorHandler from "../utils/ErrorHandler.js";
import sendMail from "../utils/sendMail.js";
import supportTicketModel, { ISupportTicket, TicketCategory, TicketStatus } from "../models/supportTicket.model.js";


// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Map a Mongo ticket doc to a clean object for API responses */
function formatTicket(record: ISupportTicket) {
  return {
    id:         record._id,
    userId:     record.userId,
    userName:   record.userName,
    userEmail:  record.userEmail,
    category:   record.category,
    subject:    record.subject,
    message:    record.message,
    status:     record.status,
    adminReply: record.adminReply || null,
    repliedAt:  record.repliedAt  || null,
    createdAt:  record.createdAt,
    updatedAt:  record.updatedAt,
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

      const ticket = await supportTicketModel.create({
        userId:    user._id,
        userName:  user.name,
        userEmail: user.email,
        category:  category as TicketCategory,
        subject:   subject.trim(),
        message:   message.trim(),
        status:    "open" as TicketStatus,
      });

      res.status(201).json({
        success: true,
        message: "Ticket submitted successfully",
        data: formatTicket(ticket),
      });

      sendMail({
        email: process.env.MAINTENANCE_EMAIL as string,
        subject: `New Support Ticket [TKT-${ticket._id}] — ${subject}`,
        template: "support-ticket.ejs",
        data: {
          id:        ticket._id,
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

      const records = await supportTicketModel.find({ userId })
        .sort({ createdAt: -1 })
        .lean<ISupportTicket[]>();

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
      const { id } = req.params;

      const ticket = await supportTicketModel.findById(id).lean<ISupportTicket>();

      if (!ticket) {
        return next(new ErrorHandler("Ticket not found", 404));
      }

      // Users can only see their own tickets
      if (String(ticket.userId) !== String(req.user?._id)) {
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

      const { status, category } = req.query;

      const filter: Record<string, any> = {};
      if (status) filter.status = status;
      if (category) filter.category = category;

      const records = await supportTicketModel.find(filter)
        .sort({ createdAt: -1 })
        .lean<ISupportTicket[]>();

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

      const { id } = req.params;

      const { status, adminReply } = req.body as {
        status?: TicketStatus;
        adminReply?: string;
      };

      const existing = await supportTicketModel.findById(id);
      if (!existing) {
        return next(new ErrorHandler("Ticket not found", 404));
      }

      // Was there no reply before this update? If adminReply is being set now,
      // this is the first reply — that's when we notify the requester.
      const isFirstReply = !existing.adminReply && !!adminReply;

      if (status) existing.status = status;
      if (adminReply) {
        existing.adminReply = adminReply;
        existing.repliedAt = new Date();
      }

      await existing.save();

      res.status(200).json({
        success: true,
        message: "Ticket updated",
        data: formatTicket(existing),
      });

      if (isFirstReply) {
        sendMail({
          email: existing.userEmail,
          subject: `Re: [TKT-${existing._id}] ${existing.subject}`,
          template: "support-ticket-reply.ejs",
          data: {
            id:        existing._id,
            userName:  existing.userName,
            subject:   existing.subject,
            message:   existing.message,
            adminReply,
            status:    existing.status,
          },
        }).catch(console.error);
      }
    } catch (error: any) {
      return next(new ErrorHandler(error.message || "Something went wrong", 400));
    }
  },
);