import nodemailer from "nodemailer";
import ejs from "ejs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Single shared transporter ────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   Number(process.env.SMTP_PORT),
  secure: false, // true for port 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ─── Types ────────────────────────────────────────────────────────────────────
interface EmailOptions {
  email: string | string[];   
  subject: string;
  template: string;          
  data: { [key: string]: any };
  replyTo?: string;
}

// ─── Main sendMail function ───────────────────────────────────────────────────
const sendMail = async (options: EmailOptions): Promise<void> => {
  const { email, subject, template, data, replyTo } = options;

  const templatePath = path.join(__dirname, "../mails", template);
  const html = await ejs.renderFile(templatePath, data);

  await transporter.sendMail({
    from:    `"Next International" <${process.env.SMTP_USER}>`,
    to:      Array.isArray(email) ? email.join(",") : email,
    subject,
    html,
    ...(replyTo ? { replyTo } : {}),
  });

  console.log("✅ Email sent to:", email);
};

export default sendMail;