import nodemailer from "nodemailer";
import "./env.js";
import logger from "../utilities/logger.js";

export const EMAIL = {
    FROM_NAME: "Bottoms Up Golf League",
    HOME_URL: process.env.APP_URL,
    LOGO: " https://bottoms-up.b-cdn.net/bottoms-up-logo.png",
    SUBJECTS: {
        ACTIVATION: "Activate Your Bottoms Up Golf League Account",
        PASSWORD_RESET: "Reset Your Bottoms Up Golf League Password",
        ANNOUNCEMENT: "Bottoms Up Golf League Update",
    },
};

export const transporter = nodemailer.createTransport({
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
    .then(() => logger.info("Titan SMTP server is ready"))
    .catch((err) => logger.error("SMTP Verification failed:", err));

export default transporter;