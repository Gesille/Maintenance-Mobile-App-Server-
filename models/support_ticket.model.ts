import mongoose, { Document, Model, Schema } from "mongoose";

export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
export type TicketCategory =
  | "technical_issue"
  | "request_not_updating"
  | "account_login"
  | "equipment"
  | "other";

export interface ISupportTicket extends Document {
  userId: mongoose.Types.ObjectId;
  userName: string;
  userEmail: string;
  category: TicketCategory;
  subject: string;
  message: string;
  status: TicketStatus;
  adminReply?: string;
  repliedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const supportTicketSchema = new Schema<ISupportTicket>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    userName:   { type: String, required: true },
    userEmail:  { type: String, required: true },
    category: {
      type: String,
      enum: ["technical_issue", "request_not_updating", "account_login", "equipment", "other"],
      required: true,
    },
    subject:    { type: String, required: true, trim: true },
    message:    { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["open", "in_progress", "resolved", "closed"],
      default: "open",
    },
    adminReply: { type: String, default: null },
    repliedAt:  { type: Date,   default: null },
  },
  { timestamps: true },
);

const supportTicketModel: Model<ISupportTicket> = mongoose.model(
  "SupportTicket",
  supportTicketSchema,
);

export default supportTicketModel;