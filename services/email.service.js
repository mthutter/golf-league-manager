import {
    all
} from "../config/db.js";
import "../config/env.js";
import logger from "../utilities/logger.js";
import {
    EMAIL,
    transporter
} from "../config/email.js";

/**
 * Builds the standard Bottoms Up branded email layout.
 */
const buildLeagueEmail = (bodyHtml) => `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<style>
body {
  margin:0;
  padding:0;
  background:#f4f6f8;
  font-family:"Segoe UI",Arial,sans-serif;
}

table {
  border-spacing:0;
  border-collapse:collapse;
  width:100%;
}

.wrapper {
  width:100%;
  padding:30px 0;
  background:#f4f6f8;
}

.main-table {
  max-width:600px;
  margin:0 auto;
  background:#fff;
  border-radius:12px;
  overflow:hidden;
  border:1px solid #dce5dc;
  box-shadow:0 6px 18px rgba(0,0,0,.08);
}

.header {
  background:linear-gradient(135deg,#2f8a2f,#1b4332);
  text-align:center;
  padding:30px 20px;
}

.header img {
  width:90px;
  height:auto;
  margin-bottom:12px;
}

.header h1 {
  margin:0;
  color:#fff;
  font-size:28px;
}

.header p {
  margin:8px 0 0;
  color:rgba(255,255,255,.9);
}

.divider {
  height:4px;
  background:#2f8a2f;
}

.body-content {
  padding:40px 30px;
  color:#333;
  font-size:16px;
  line-height:1.7;
}

.body-content h2,
.body-content h3 {
  color:#1b4332;
}

.button {
  display:inline-block;
  background:#2f8a2f;
  color:#fff !important;
  padding:14px 28px;
  text-decoration:none;
  border-radius:6px;
  font-weight:bold;
}

.footer {
  background:#f7faf7;
  border-top:1px solid #e5ece5;
  text-align:center;
  padding:20px;
  font-size:12px;
  color:#777;
}

.footer a {
  color:#2f8a2f;
}

@media (max-width:600px){
  .body-content{
    padding:25px 20px;
  }
}
</style>
</head>

<body>

<center class="wrapper">

<table class="main-table">

<tr>
<td class="header">

<img
 src="${EMAIL.LOGO}"
 alt="Bottoms Up Golf League">

<h1>Bottoms Up Golf League</h1>

<p>Colorado Springs • 2026 Season</p>

</td>
</tr>

<tr>
<td class="divider"></td>
</tr>

<tr>
<td class="body-content">

${bodyHtml}

</td>
</tr>

<tr>
<td class="footer">

<p><strong>Bottoms Up Golf League © 2026</strong></p>

<p>
<a href="${EMAIL.HOME_URL}">
Visit League Home Page →
</a>
</p>

<p style="font-size:11px;">
You are receiving this email because you are a league member.
</p>

</td>
</tr>

</table>

</center>

</body>
</html>
`;

/**
 * Generic email sender used by all email functions.
 */
const sendEmail = async ({
    to,
    bcc,
    subject,
    bodyHtml
}) => {
    return transporter.sendMail({
        from: `"Bottoms Up Golf League" <${process.env.SMTP_USER}>`,
        to,
        bcc,
        subject,
        html: buildLeagueEmail(bodyHtml),
    });
};

/**
 * Existing league broadcast email.
 * (Backwards compatible.)
 */
export const fetchAndSendEmails = async (
    subject,
    rawBodyContent,
    recipients = [],
) => {
    try {
        let emailList = [];

        if (recipients.length > 0) {
            emailList = recipients;

            logger.info(
                `Targeted Mode Activated. Sending only to: ${emailList.join(", ")}`,
            );
        } else {
            logger.info("Global Broadcast Mode Activated.");

            const members = await all(`
        SELECT e_mail
        FROM members
        WHERE e_mail IS NOT NULL
          AND e_mail <> ''
          AND e_mail <> 'tbd@tbd.com'
      `);

            emailList = members.map((m) => m.e_mail);
        }

        if (emailList.length === 0) {
            return {
                success: true,
                count: 0,
            };
        }

        const bodyHtml = rawBodyContent.replace(/(?:\r\n|\r|\n)/g, "<br>");

        const info = await sendEmail({
            to: process.env.SMTP_USER,
            bcc: emailList,
            subject,
            bodyHtml,
        });

        return {
            success: true,
            count: emailList.length,
            messageId: info.messageId,
        };
    } catch (error) {
        logger.error("Email service execution failed", error);
        throw error;
    }
};

/**
 * Sends an activation email to a new member.
 */
export const sendActivationEmail = async ({
    member,
    activationUrl
}) => {
    const bodyHtml = `
<h2>Welcome to Bottoms Up Golf League!</h2>

<p>
Hi ${member.name_first},
</p>

<p>
Your member account has been created.
To activate your account and choose your password,
click the button below.
</p>

<p style="text-align:center;margin:35px 0;">

<a
 class="button"
 href="${activationUrl}">

Activate My Account

</a>

</p>

<p>
If the button doesn't work, copy and paste this link into your browser:
</p>

<p>

<a href="${activationUrl}">
${activationUrl}
</a>

</p>

<p>
This activation link expires in 48 hours.
</p>

<p>
We look forward to seeing you on the course!
</p>
`;

    const info = await sendEmail({
        to: member.e_mail,
        subject: "Activate Your Bottoms Up Golf League Account",
        bodyHtml,
    });

    logger.info(`Activation email sent to ${member.e_mail}`);

    return info;
};

export const sendPasswordResetEmail = async ({
    member,
    resetUrl
}) => {
    const bodyHtml = `
<h2>Password Reset Request</h2>

<p>
Hi ${member.name_first},
</p>

<p>
We received a request to reset the password for your Bottoms Up Golf account.
</p>

<p>
Click the button below to choose a new password.
</p>

<p style="text-align:center;margin:35px 0;">

<a
 class="button"
 href="${resetUrl}">

Reset Password

</a> </p>
<p>
If the button doesn't work, copy and paste this link into your browser:
</p>

<p>

<a href="${resetUrl}">
${resetUrl}
</a>

</p>


</p>

<p>
This link expires in one hour.
</p>

<p>
If you didn't request this password reset, you can safely ignore this email.
Your existing password will remain unchanged.
</p>
`;

    const info = await sendEmail({
        to: member.e_mail,
        subject: "Bottoms Up Golf - Password Reset",
        bodyHtml,
    });

    logger.info(`Password reset email sent to ${member.e_mail}`);

    return info;
};