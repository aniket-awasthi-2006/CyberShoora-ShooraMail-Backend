const mailConfig = {
    imap: {
        host: process.env.IMAP_HOST,
        port: process.env.IMAP_PORT,
        tls: process.env.IMAP_SECURE === 'true',
        authTimeout: 10000
    },
    smtp: {
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SITE_EMAIL,
            pass: process.env.SITE_PASSWORD
        }
    }
};


export { mailConfig };