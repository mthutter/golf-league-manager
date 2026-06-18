import { all } from "../config/db.js";
import { fetchAndSendEmails } from "../services/email.service.js";

// Renders the email.ejs form view
export const renderEmailForm = async (req, res) => {
  try {
    // 🚨 FIX: Removed [ ] brackets. SQLite's db.all returns the array directly.
    const members = await all("SELECT e_mail FROM members WHERE e_mail IS NOT NULL AND e_mail != '' AND e_mail != 'tbd@tbd.com'");
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
  const { subject, message } = req.body;

  if (!subject || !message) {
    return res.status(400).json({ error: "Both subject and message are required." });
  }

  try {
    const result = await fetchAndSendEmails(subject, `<p>${message.replace(/\n/g, "<br>")}</p>`);
    return res.status(200).json({
      message: `Successfully broadcasted to ${result.count} members!`,
      id: result.messageId,
    });
  } catch (error) {
    return res.status(500).json({ error: "Server error processing your email request." });
  }
};
