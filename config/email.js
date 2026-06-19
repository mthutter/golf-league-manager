import nodemailer from "nodemailer";
import "./env.js";

const transporter = nodemailer.createTransport({
  host: "smtp.titan.email",
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Verify connection on startup
transporter
  .verify()
  .then(() => console.log("📧 Titan SMTP server is ready"))
  .catch((err) => console.error("❌ SMTP Verification failed:", err));

export default transporter;
