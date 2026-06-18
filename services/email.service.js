import "../config/db.js";
import nodemailer from "nodemailer";
import "../config/env.js"; // Adjust relative path based on folder depth

const transporter = nodemailer.createTransport({
  host: "smtp.titan.email",
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export const fetchAndSendEmails = async (subject, htmlBody) => {
  try {
    // 1. Fetch your members from the database
    // Replace with your real DB call (e.g., await db.query() or Member.find())
    const [members] = await all(
      "SELECT e_mail FROM members WHERE e_mail IS NOT NULL AND e_mail != '' AND e_mail != 'tbd@tbd.com'",
    );

    if (members.length === 0) {
      return { success: true, count: 0, messageId: null };
    }

    const emailList = members.map((m) => m.email);

    // 2. Dispatch email via Titan Mail
    const info = await transporter.sendMail({
      from: `"Bottoms Up Golf League Admin" <${process.env.SMTP_USER}>`,
      to: process.env.SMTP_USER, // Sends to yourself
      bcc: emailList, // Kept blind to preserve privacy
      subject: subject,
      html: htmlBody,
    });

    return {
      success: true,
      count: emailList.length,
      messageId: info.messageId,
    };
  } catch (error) {
    console.error("Email service execution failed:", error);
    throw error;
  }
};
