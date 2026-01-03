import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { saveSentEmail } from './imapService.js';
dotenv.config();

const createTransporter = (authDetails) => {
    const auth = authDetails
        ? {
            user: authDetails.user,
            pass: authDetails.pass,
        }
        : {
            user: process.env.SITE_EMAIL,
            pass: process.env.SITE_PASSWORD,
        };

    return nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.stackmail.com',
        port: parseInt(process.env.SMTP_PORT) || 465,
        secure: process.env.SMTP_SECURE === 'true',
        tls: {
            rejectUnauthorized: false,
        },
        auth: auth,
    });
};

const sendEmail = async (authDetails, mailOptions) => {
    const transporter = createTransporter(authDetails);
    return transporter.sendMail(mailOptions);

  
};

const replyEmail = async (authDetails, mailOptions) => {
    const replySubject = mailOptions.subject.startsWith('Re: ') ? mailOptions.subject : `Re: ${mailOptions.subject}`;
    const replyBody = `\n\n--- Original Message ---\n${mailOptions.text}`;

    const replyOptions = {
        ...mailOptions,
        subject: replySubject,
        text: replyBody,
    };

    const transporter = createTransporter(authDetails);
    return transporter.sendMail(replyOptions);
};

const forwardEmail = async (authDetails, mailOptions) => {
    const forwardSubject = mailOptions.subject.startsWith('Fwd: ') ? mailOptions.subject : `Fwd: ${mailOptions.subject}`;
    const forwardBody = `\n\n--- Forwarded Message ---\n${mailOptions.text}`;

    const forwardOptions = {
        ...mailOptions,
        subject: forwardSubject,
        text: forwardBody,
    };

    const transporter = createTransporter(authDetails);
    return transporter.sendMail(forwardOptions);
};

export { sendEmail, replyEmail, forwardEmail };
