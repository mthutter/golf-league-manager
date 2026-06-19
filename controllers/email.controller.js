import { all } from "../config/db.js";
import { fetchAndSendEmails } from "../services/email.service.js";

// Renders the email.ejs form view
export const renderEmailForm = async (req, res) => {
  try {
    // 🚨 FIX: Removed [ ] brackets. SQLite's db.all returns the array directly.
    const members = await all(
      "SELECT e_mail FROM members WHERE e_mail IS NOT NULL AND e_mail != '' AND e_mail != 'tbd@tbd.com'",
    );
    console.log(members);

    // Pass the members array into EJS
    res.render("email", { members: members });
  } catch (error) {
    console.error("Failed to load members for email form:", error);
    res.render("email", { members: [], error: "Could not load member list." });
  }
};

// Handles form data submission
export const sendBulkEmail = async (req, res) => {
  try {
    // 💡 FIXED: Explicitly pull recipients from the incoming req.body payload
    const { subject, message, recipients } = req.body;

    if (!subject || !message) {
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

    // Pass the selected emails array down into your service layer
    const result = await fetchAndSendEmails(subject, message, selectedEmails);

    // Sends the accurate dynamic count back to your alert box interface
    res.status(200).json({
      success: true,
      message: `Successfully broadcasted to ${result.count} member(s)!`,
    });
  } catch (error) {
    console.error("Controller broadcasting failed:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};
