import nodemailer from "nodemailer";
import "./config/env.js";
//const nodemailer = require("nodemailer");

// Create a transporter using SMTP
const transporter = nodemailer.createTransport({
  host: "smtp.titan.email",
  //port: 587,
  port: 465,
  secure: true, // use STARTTLS (upgrade connection to TLS after connecting)
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    //user: "admin@bottoms-up-cos.org",
    //pass: "Ch@ngeM3!00123!",
  },
});

// Test the connection
try {
  await transporter.verify();
  console.log("Server is ready to take our messages");
} catch (err) {
  console.error("Verification failed:", err);
}
// Send a message
try {
  const info = await transporter.sendMail({
    from: '"Golf League Admin" <admin@bottoms-up-cos.org>', // sender address
    to: "mthutter@me.com, mark.hutter.ctr@amentum.com", // list of recipients
    subject: "Hello", // subject line
    text: "Hello world?", // plain text body
    html: "<b>Hello world?</b>", // HTML body
  });

  console.log("Message sent: %s", info.messageId);
  // Preview URL is only available when using an Ethereal test account
  console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
} catch (err) {
  console.error("Error while sending mail:", err);
}
