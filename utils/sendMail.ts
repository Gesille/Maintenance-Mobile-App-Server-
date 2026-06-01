import { Resend } from "resend";
import ejs from "ejs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resend = new Resend(process.env.RESEND_API_KEY);

interface EmailOptions {
  email: string;
  subject: string;
  template: string;
  data: { [key: string]: any };
}

const sendMail = async (options: EmailOptions): Promise<void> => {
  const { email, subject, template, data } = options;

  const templatePath = path.join(__dirname, "../mails", template);
  const html = await ejs.renderFile(templatePath, data);

  const { error } = await resend.emails.send({
    from: "Next International <onboarding@resend.dev>",
    to: email,
    subject,
    html,
  });

  if (error) throw new Error(error.message);

  console.log("✅ Email sent to:", email);
};

export default sendMail;