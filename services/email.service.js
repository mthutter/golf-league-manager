import { all } from "../config/db.js";
import nodemailer from "nodemailer";
import "../config/env.js";

const transporter = nodemailer.createTransport({
  host: "smtp.titan.email",
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Wraps form input inside an HTML email layout and dispatches it to members
 * @param {string} subject - The subject line from your form
 * @param {string} rawBodyContent - The main text message body from your form
 * @param {Array} [recipients]
 */
export const fetchAndSendEmails = async (
  subject,
  rawBodyContent,
  recipients = [],
) => {
  try {
    let emailList = [];

    if (recipients && recipients.length > 0) {
      emailList = recipients;
      console.log(
        `Targeted Mode Activated. Sending only to: ${emailList.join(", ")}`,
      );
    } else {
      console.log("Global Broadcast Mode Activated. Fetching entire league...");
      const members = await all(
        "SELECT e_mail FROM members WHERE e_mail IS NOT NULL AND e_mail != '' AND e_mail != 'tbd@tbd.com'",
      );

      if (!members || members.length === 0) {
        return { success: true, count: 0, messageId: null };
      }
      emailList = members.map((m) => m.e_mail);
    }

    // 💡 REMINDER: Update this to your real production domain
    const domain = "https://yourleaguedomain.com";

    const formattedHtmlTemplate = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { margin: 0; padding: 0; background-color: #f4f6f8; font-family: "Segoe UI", Arial, sans-serif; }
        table { border-spacing: 0; border-collapse: collapse; width: 100%; }
        .wrapper { width: 100%; background-color: #f4f6f8; padding: 30px 0; }
        .main-table { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #dce5dc; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08); }
        .header { background: linear-gradient(135deg, #2f8a2f, #1b4332); padding: 30px 15px; text-align: center; }
        .header-logo img { width: 120px; height: auto; margin-bottom: 10px; }
        .header h1 { color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: 1px; }
        .header p { color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px; }
        .body-content { padding: 40px 30px; color: #333; font-size: 16px; line-height: 1.7; }
        .body-content h2, .body-content h3 { color: #1b4332; }
        .divider { height: 4px; background-color: #2f8a2f; }
        .footer { background-color: #f7faf7; border-top: 1px solid #e5ece5; padding: 20px; text-align: center; font-size: 12px; color: #777; }
        .footer a { color: #2f8a2f; text-decoration: none; }
        @media screen and (max-width: 600px) {
          .body-content { padding: 25px 20px !important; }
          .header h1 { font-size: 24px; }
        }
      </style>
    </head>
    <body>
      <center class="wrapper">
        <table class="main-table">
          <tr>
            <td class="header">
              <!-- 💡 CHANGED: Path updated to hit the new /assets directory -->
              <div class="header-logo"><img src="https://bottoms-up.b-cdn.net/bottoms-up-logo.png" alt="Bottoms Up Golf League" height="40px" width="40px"></div>
              <h1>Bottoms Up Golf League</h1>
              <p>Colorado Springs • 2026 Season</p>
            </td>
          </tr>
          <tr>
            <td class="divider"></td>
          </tr>
          <tr>
            <td class="body-content">
              ${rawBodyContent}
            </td>
          </tr>
          <tr>
            <td class="footer">
              <p style="margin:0 0 8px 0;">
                <strong>Bottoms Up Golf League © 2026</strong>
              </p>
              <p style="margin:0;">
                You are receiving this email because you are a league member.
              </p>
            </td>
          </tr>
        </table>
      </center>
    </body>
    </html>
    `;

    const info = await transporter.sendMail({
      from: `"Bottoms Up Golf League" <${process.env.SMTP_USER}>`,
      to: process.env.SMTP_USER,
      bcc: emailList,
      subject: subject,
      html: formattedHtmlTemplate,
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
