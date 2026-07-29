import mongoose, { Schema } from "mongoose";
const supportTicketSchema = new Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    userName: { type: String, required: true },
    userEmail: { type: String, required: true },
    category: {
        type: String,
        enum: ["technical_issue", "request_not_updating", "account_login", "equipment", "other"],
        required: true,
    },
    subject: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    status: {
        type: String,
        enum: ["open", "in_progress", "resolved", "closed"],
        default: "open",
    },
    adminReply: { type: String, default: null },
    repliedAt: { type: Date, default: null },
}, { timestamps: true });
const supportTicketModel = mongoose.model("SupportTicket", supportTicketSchema);
export default supportTicketModel;
