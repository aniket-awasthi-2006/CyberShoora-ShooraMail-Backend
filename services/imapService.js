import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import dotenv from 'dotenv';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';

dotenv.config();

// Helper to create a new client instance
// Note: ImapFlow requires a new instance/connection for distinct lifecycles 
// or you must manage a persistent connection carefully. 
// Here we follow your pattern of "Connect -> Do Work -> Disconnect".
const getClient = (email, password) => {
    return new ImapFlow({
        host: 'imap.stackmail.com', // Your host
        port: 993,
        secure: true,
        tls: {
            rejectUnauthorized: false // Matches your previous config
        },
        auth: {
            user: email,
            pass: password,
        },
        logger: false // Set to true if you want to see debug logs in terminal
    });
};

const parseEmail = async (message, source) => {
    // 'source' is the raw email buffer provided by ImapFlow
    const mail = await simpleParser(source);

    const senderMatch = mail.from?.text.match(/"([^"]*)"/);
    const emailMatch = mail.from?.text.match(/<([^>]*)>/);
    const senderName = senderMatch ? senderMatch[1] : (mail.from?.text.split('<')[0].trim() || 'Unknown');
    const senderEmail = emailMatch ? emailMatch[1] : (mail.from?.text || '');

    const toemailMatch = mail.to?.text.match(/<([^>]*)>/);
    const toemailName = toemailMatch ? toemailMatch[1] : (mail.to?.text.split('@')[0].trim() || 'Unknown');
    const toemailEmail = toemailMatch ? toemailMatch[1] : (mail.to?.text || '');

    return {
        id: message.uid, // ImapFlow provides UID directly on the message object
        sender: senderName,
        senderEmail: senderEmail,
        to: toemailName,
        toEmail: toemailEmail,
        subject: mail.subject,
        preview: mail.textAsHtml ? mail.textAsHtml.slice(0, 100) : (mail.text ? mail.text.slice(0, 100) : ''),
        body: mail.html || mail.textAsHtml || mail.text,
        date: mail.date || message.internalDate,
        unread: !message.flags.has('\\Seen'),
        flagged: message.flags.has('\\Flagged'),
        categoryColor: '#2D62ED',
        category: 'personal',
        attachments: mail.attachments || [],
        avatar: '',
        folder: 'inbox',
        important: message.flags.has('Important'),
    };
};

// Save sent email to "Sent" folder
const saveSentEmail = async (email, password, mailOptions) => {
    const client = getClient(email, password);

    // 1. Compile the email object into a raw buffer (RFC822 format)
    const composer = new MailComposer(mailOptions);
    const messageBuffer = await composer.compile().build();

    await client.connect();

    // 2. Define target folder (Stackmail usually uses "Sent")
    const sentFolder = 'Sent';

    let lock = await client.getMailboxLock(sentFolder);
    try {
        // 3. Append the message with the \Seen flag so it appears read
        await client.append(sentFolder, messageBuffer, ['\\Seen']);
    } catch (err) {
        // Optional: Retry with "Sent Items" if "Sent" fails
    } finally {
        lock.release();
    }

    await client.logout();
};

//fetch inbox
const fetchInbox = async (email, password) => {
    const client = getClient(email, password);
    const parsedMails = [];

    await client.connect();

    // We must lock the mailbox to perform operations
    let lock = await client.getMailboxLock('INBOX');
    try {
        // 1. Get status to find out how many messages are there
        const status = await client.status('INBOX', { messages: true });

        // 2. Calculate range for the last 10 messages
        // If total is 50, we want 41:50. If total is 5, we want 1:5.
        const total = status.messages;
        const fetchCount = 10;
        const start = Math.max(1, total - fetchCount + 1);
        const range = `${start}:*`;

        if (total > 0) {
            // 3. Fetch specific range using UID and Source options
            for await (let message of client.fetch(range, { envelope: true, source: true, uid: true, flags: true, internalDate: true })) {
                const parsed = await parseEmail(message, message.source);
                parsedMails.push(parsed);
            }
        }
    } finally {
        // Always release lock
        lock.release();
    }

    await client.logout();

    const emailUser = email.split('@')[0];
    const userName = emailUser.split('.').map(name => name.charAt(0).toUpperCase() + name.slice(1)).join(' ');

    // Reverse to show newest first
    return {
        userName,
        mails: parsedMails.reverse(),
    };
};

const fetchEmailsByFolder = async (email, password, folder) => {
    const client = getClient(email, password);
    const parsedMails = [];

    await client.connect();

    let lock = await client.getMailboxLock(folder);
    try {
        const status = await client.status(folder, { messages: true });

        // Fetch last 20 as per your original logic
        const total = status.messages;
        const fetchCount = 20;
        const start = Math.max(1, total - fetchCount + 1);
        const range = `${start}:*`;

        if (total > 0) {
            for await (let message of client.fetch(range, { envelope: true, source: true, uid: true, flags: true, internalDate: true })) {
                const parsed = await parseEmail(message, message.source);
                parsed.folder = folder;
                parsedMails.push(parsed);
            }
        }
    } catch (err) {
    } finally {
        lock.release();
    }

    await client.logout();

    return {
        folder,
        mails: parsedMails.reverse(),
    };
};

const markAsRead = async (email, password, messageId, read) => {
    const client = getClient(email, password);
    await client.connect();

    let lock = await client.getMailboxLock('INBOX');
    try {
        // 'uid: true' is crucial because we are passing a UID, not a sequence number
        if (read) {
            await client.messageFlagsAdd(messageId, ['\\Seen'], { uid: true });
        } else {
            await client.messageFlagsRemove(messageId, ['\\Seen'], { uid: true });
        }
    } finally {
        lock.release();
    }

    await client.logout();
};

const saveDraft = async (email, password, draftData) => {
    const client = getClient(email, password);

    // 1. Map your frontend data to Nodemailer structure
    const mailOptions = {
        from: email,
        to: draftData.to,
        subject: draftData.subject,
        text: draftData.body, // or draftData.text depending on your frontend
        html: draftData.html || `<p>${draftData.body}</p>` // simple fallback
    };

    // 2. Compile into raw email buffer
    const composer = new MailComposer(mailOptions);
    const messageBuffer = await composer.compile().build();

    await client.connect();

    // 3. Determine Drafts Folder
    // Common names: 'Drafts', 'Draft', '[Gmail]/Drafts'
    // You can also look it up via client.list() if needed
    const draftFolder = 'Drafts';

    let lock = await client.getMailboxLock(draftFolder);
    try {
        // 4. Append to Drafts folder
        // We add \Seen (so it doesn't look like a new unread mail)
        // We add \Draft (standard IMAP flag for drafts)
        await client.append(draftFolder, messageBuffer, ['\\Seen', '\\Draft']);
    } catch (err) {
        throw err; // Re-throw so your API knows it failed
    } finally {
        lock.release();
    }

    await client.logout();
    return { success: true };
};

// Don't forget to export it!
const toggleStarred = async (email, password, messageId, starred) => {
    const client = getClient(email, password);
    await client.connect();

    let lock = await client.getMailboxLock('INBOX');
    try {
        if (starred) {
            await client.messageFlagsAdd(messageId, ['\\Flagged'], { uid: true });
        } else {
            await client.messageFlagsRemove(messageId, ['\\Flagged'], { uid: true });
        }
    } finally {
        lock.release();
    }

    await client.logout();
};

const toggleImportant = async (email, password, messageId, important) => {
    const client = getClient(email, password);
    await client.connect();

    let lock = await client.getMailboxLock('INBOX');
    try {
        if (important) {
            await client.messageFlagsAdd(messageId, ['Important'], { uid: true });
        } else {
            await client.messageFlagsRemove(messageId, ['Important'], { uid: true });
        }
    } finally {
        lock.release();
    }

    await client.logout();
};
const deleteEmail = async (email, password, messageId) => {
    const client = getClient(email, password);
    await client.connect();

    let lock = await client.getMailboxLock('INBOX');
    try {
        // Mark as deleted
        await client.messageFlagsAdd(messageId, ['\\Deleted'], { uid: true });
        // Expunge/Delete is handled by messageDelete in ImapFlow or implies expunge depending on server
        // Using messageDelete is the safest explicit way to remove by UID
        await client.messageDelete(messageId, { uid: true });
        m
    } finally {
        lock.release();
    }

    await client.logout();
};

const moveEmail = async (email, password, messageId, destinationFolder) => {
    const client = getClient(email, password);
    await client.connect();

    let lock = await client.getMailboxLock('INBOX');
    try {
        // messageMove returns a result object, true usually implies success
        await client.messageMove(messageId, destinationFolder, { uid: true });
    } finally {
        lock.release();
    }

    await client.logout();
};

export { fetchInbox, fetchEmailsByFolder, markAsRead, deleteEmail, moveEmail, toggleStarred, toggleImportant, saveSentEmail, saveDraft };