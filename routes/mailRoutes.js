import express from 'express';
import { fetchInbox, fetchEmailsByFolder, markAsRead, deleteEmail, moveEmail, toggleStarred, toggleImportant, saveDraft, saveSentEmail } from '../services/imapService.js';
import { sendEmail, replyEmail, forwardEmail } from '../services/smtpService.js';

const router = express.Router();

// Login and Fetch Initial Emails
router.post('/login-fetch', async (req, res) => {
    const { email, password } = req.body;

    try {
        const emails = await fetchInbox(email, password);

        // Send Welcome Mail (Fire and forget)
        const welcomeHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Image Email</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background-color: #f4f4f4;
        }
        .email-container {
            width: 100%;
            margin: 0;
            padding: 0;
        }
        .responsive-image {
            width: 100%;
            height: auto;
            display: block;
            border-radius: 10px;
            -webkit-border-radius: 10px;
            -moz-border-radius: 10px;
        }
    </style>
</head>
<body>
    <div class="email-container">
        <img src="https://res.cloudinary.com/dtwumvj5i/image/upload/v1767200085/Mail_Image_iwjmp1.jpg" 
             alt="Mail Image" 
             class="responsive-image">
    </div>
</body>
</html>
        `;

        sendEmail(
            null,
            {
                from: `Shoora Mail <${process.env.SITE_EMAIL}>`,
                to: email,
                subject: 'Welcome to Shoora Mail! 🚀',
                html: welcomeHtml,
                text: 'Welcome to Shoora Mail! You have successfully logged in.',
            }
        ).catch(err => { });
        res.status(200).json({ success: true, data: emails });
    } catch (error) {
        res.status(401).json({ success: false, message: "Invalid Credentials or Connection Failed" });
    }
});

// Fetch Inbox Emails
router.post('/inbox-fetch', async (req, res) => {
    const { email, password } = req.body;

    try {
        const emails = await fetchInbox(email, password);
        res.status(200).json({ success: true, data: emails });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch inbox" });
    }
});

// Fetch Emails by Folder
router.post('/folder-fetch', async (req, res) => {
    const { email, password, folder } = req.body;

    try {
        const emails = await fetchEmailsByFolder(email, password, folder);
        res.status(200).json({ success: true, data: emails });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch folder emails" });
    }
});

// Send Email
router.post('/send-mail', async (req, res) => {
    const { email, password, to, subject, body, attachments } = req.body;
    try {
        await sendEmail(
            { user: email, pass: password },
            { from: email, to, subject, text: body, attachments }
        );
        res.status(200).json({ success: true, message: "Email Sent Successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    } finally {
        try {
            await saveSentEmail(
                email, // Assuming authDetails has the email/user
                password, // Assuming authDetails has the password
                { from: email, to, subject, text: body, attachments }
            );
        } catch (err) {
            // We log the error but don't throw it, because the email WAS actually sent to the recipient.
            // We don't want to tell the frontend "Failed" just because the copy wasn't saved.
        }

        return result;
    }
});

// Reply to Email
router.post('/reply-mail', async (req, res) => {
    const { email, password, to, subject, body, originalMessageId } = req.body;
    try {
        await replyEmail(
            { user: email, pass: password },
            { from: email, to, subject, text: body, inReplyTo: originalMessageId }
        );
        res.status(200).json({ success: true, message: "Reply Sent Successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Forward Email
router.post('/forward-mail', async (req, res) => {
    const { email, password, to, subject, body } = req.body;
    try {
        await forwardEmail(
            { user: email, pass: password },
            { from: email, to, subject, text: body }
        );
        res.status(200).json({ success: true, message: "Email Forwarded Successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Mark Email as Read/Unread
router.post('/mark-read', async (req, res) => {
    const { email, password, messageId, read } = req.body;
    try {
        await markAsRead(email, password, messageId, read);
        res.status(200).json({ success: true, message: `Email marked as ${read ? 'read' : 'unread'}` });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to mark email" });
    }
});

//toggle-star
router.post('/toggle-star', async (req, res) => {
    const { email, password, messageId, starred } = req.body;
    try {
        await toggleStarred(email, password, messageId, starred);
        res.status(200).json({ success: true, message: `Email marked as ${starred ? 'starred' : 'unstarred'}` });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to mark email" });
    }
});

//toggle-important
router.post('/toggle-important', async (req, res) => {
    const { email, password, messageId, important } = req.body;
    try {
        await toggleImportant(email, password, messageId, important);
        res.status(200).json({ success: true, message: `Email marked as ${important ? 'important' : 'unimportant'}` });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to mark email" });
    }
});

//save-draft
router.post('/api/save-draft', async (req, res) => {
    try {
        const { email, password, ...composeData } = req.body;

        // composeData contains: { to: '...', subject: '...', body: '...' }
        await saveDraft(email, password, ...composeData);

        res.json({ success: true, message: 'Draft saved successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to save draft' });
    }
});


// Delete Email
router.post('/delete-mail', async (req, res) => {
    const { email, password, messageId } = req.body;
    try {
        await deleteEmail(email, password, messageId);
        res.status(200).json({ success: true, message: "Email deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to delete email" });
    }
});

// Move Email to Folder
router.post('/move-mail', async (req, res) => {
    const { email, password, messageId, destinationFolder } = req.body;
    try {
        await moveEmail(email, password, messageId, destinationFolder);
        res.status(200).json({ success: true, message: "Email moved successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to move email" });
    }
});

export default router;
