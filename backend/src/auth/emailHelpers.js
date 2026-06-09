import nodemailer from 'nodemailer';

// The transporter is created lazily (on first use) so that process.env values
// are read AFTER dotenv has loaded the .env file. If the transporter were created
// at module load time, it would see undefined env vars because this module is
// initialized before env.js runs dotenv.config() in the ESM import chain.
let transporter = null;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT),
      secure: false, // true for 465, false for 587
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }
  return transporter;
};

/**
 * Verify Gmail SMTP connection on server startup.
 * Call this in server.js after connectDB().
 * Throws if credentials are wrong — server will not start.
 */
export const connectMailer = async () => {
  await getTransporter().verify();
  console.log('Nodemailer connected successfully.');
};

/**
 * Send email verification link to newly registered user.
 * @param {string} to - User's email address
 * @param {string} token - Random verification token (hex string)
 */
export const sendVerificationEmail = async (to, token) => {
  const verifyUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;

  await getTransporter().sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: 'Zuno — Apna Email Verify Karo',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #1a1a1a;">Zuno mein aapka swagat hai!</h2>
        <p>Apna account activate karne ke liye neeche diye button par click karo.</p>
        <p>Yeh link <strong>24 ghante</strong> tak valid hai.</p>
        <a href="${verifyUrl}"
           style="display:inline-block; padding:12px 24px; background:#4F46E5;
                  color:#fff; text-decoration:none; border-radius:6px; margin:16px 0;">
          Email Verify Karo
        </a>
        <p style="color:#666; font-size:13px;">
          Agar tumne Zuno par register nahi kiya to is email ko ignore karo.
        </p>
      </div>
    `,
  });
};

/**
 * Send password reset link.
 * @param {string} to - User's email address
 * @param {string} token - Random reset token (hex string)
 */
export const sendPasswordResetEmail = async (to, token) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

  await getTransporter().sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: 'Zuno — Password Reset Link',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #1a1a1a;">Password Reset Request</h2>
        <p>Apna password reset karne ke liye neeche diye button par click karo.</p>
        <p>Yeh link <strong>15 minute</strong> tak valid hai.</p>
        <a href="${resetUrl}"
           style="display:inline-block; padding:12px 24px; background:#4F46E5;
                  color:#fff; text-decoration:none; border-radius:6px; margin:16px 0;">
          Password Reset Karo
        </a>
        <p style="color:#666; font-size:13px;">
          Agar tumne yeh request nahi ki to is email ko ignore karo.
          Tumhara account safe hai.
        </p>
      </div>
    `,
  });
};
