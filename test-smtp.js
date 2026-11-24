import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  requireTLS: true,
  logger: true,
  debug: true,
});

try {
  await transporter.verify();
  console.log("SMTP TLS CONNECTION SUCCESSFUL");
} catch (error) {
  console.error("SMTP TEST FAILED:");
  console.error(error);
}