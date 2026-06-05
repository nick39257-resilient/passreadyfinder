import nodemailer from "nodemailer";

/** Fixed sender profile for Namecheap Private Email. */
export const PASSREADY_MAIL_FROM = "nick@passready.us";

const SMTP_HOST = "mail.privateemail.com";
const SMTP_PORT = 465;

let transport: nodemailer.Transporter | null = null;

function requireMailEnv(name: "MAIL_USERNAME" | "MAIL_PASSWORD"): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required in .env`);
  }
  return value;
}

function getTransport(): nodemailer.Transporter {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: true,
      auth: {
        user: requireMailEnv("MAIL_USERNAME"),
        pass: requireMailEnv("MAIL_PASSWORD"),
      },
    });
  }
  return transport;
}

export function isSmtpMailConfigured(): boolean {
  return Boolean(
    process.env.MAIL_USERNAME?.trim() && process.env.MAIL_PASSWORD?.trim(),
  );
}

export async function sendSmtpMail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ messageId: string }> {
  const transporter = getTransport();
  const info = await transporter.sendMail({
    from: PASSREADY_MAIL_FROM,
    to: input.to.trim(),
    subject: input.subject.trim(),
    text: input.text,
    ...(input.html?.trim() ? { html: input.html } : {}),
  });

  const messageId = info.messageId?.trim() || `smtp-${Date.now()}`;
  return { messageId };
}
