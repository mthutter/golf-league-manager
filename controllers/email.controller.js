import {
    all
} from "../config/db.js";
import {
    fetchAndSendEmails
} from "../services/email.service.js";
import logger from "../utilities/logger.js";
import {
    catchAsync
} from "../utilities/asyncHandler.js";
import posthog from "../utilities/posthog.js";

/**
 * GET /email
 * Renders the email.ejs form view
 */
export const renderEmailForm = catchAsync(async (req, res, next) => {
    // SQLite's db.all returns the array directly.
    const members = await all("SELECT e_mail FROM members WHERE e_mail IS NOT NULL AND e_mail != '' AND e_mail != 'tbd@tbd.com'");

    // Safe structured JSON logging for Render streams
    logger.info("Loaded active member directory for email mailing form");

    // Pass the members array into EJS
    return res.render("email", {
        members: members
    });
});

/**
 * POST /email/send
 * Handles form data submission
 */
export const sendBulkEmail = catchAsync(async (req, res, next) => {
    // Explicitly pull recipients from the incoming req.body payload
    const {
        subject,
        message,
        recipients
    } = req.body;

    if (!subject || !message) {
        logger.warn({
            subjectHasValue: !!subject,
            messageHasValue: !!message
        }, "Email broadcast rejected: Missing subject or body context");
        return res.status(400).json({
            success: false,
            error: "Both subject and message are required.",
        });
    }

    // Ensure recipients is passed down as a reliable array structure
    let selectedEmails = [];
    if (recipients) {
        selectedEmails = Array.isArray(recipients) ? recipients : [recipients];
    }

    logger.info("Initiating bulk email transmission sequence");

    // Pass the selected emails array down into your service layer
    const result = await fetchAndSendEmails(subject, message, selectedEmails);

    logger.info("Bulk email broadcast delivered successfully");
    posthog.capture({
        distinctId: req.session?.id,
        event: "email_broadcast_sent",
        properties: {
            recipient_count: result.count
        },
    });

    // Sends the accurate dynamic count back to your alert box interface
    return res.status(200).json({
        success: true,
        message: `Successfully broadcasted to ${result.count} member(s)!`,
    });
});