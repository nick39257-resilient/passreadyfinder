import nodemailer from "nodemailer";

const DEFAULT_EMAIL_HOST = "mail.privateemail.com";
const DEFAULT_EMAIL_PORT = 465;
const DEFAULT_EMAIL_USER = "nick@passready.us";

function readEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

/** Reply-to / From address — prefers Render EMAIL_USER, then legacy MAIL_USERNAME. */
export function getEmailUser(): string {
  return readEnv("EMAIL_USER") || readEnv("MAIL_USERNAME") || DEFAULT_EMAIL_USER;
}

export function getEmailPass(): string {
  return readEnv("EMAIL_PASS") || readEnv("MAIL_PASSWORD");
}

export function getEmailHost(): string {
  return readEnv("EMAIL_HOST") || DEFAULT_EMAIL_HOST;
}

export function getEmailPort(): number {
  const raw = readEnv("EMAIL_PORT");
  if (!raw) {
    return DEFAULT_EMAIL_PORT;
  }
  const port = Number(raw);
  return Number.isFinite(port) && port > 0 ? port : DEFAULT_EMAIL_PORT;
}

/** @deprecated Use getEmailUser() — kept for existing imports. */
export function getPassreadyMailFrom(): string {
  return getEmailUser();
}

/** @deprecated Use getEmailUser() — kept for existing imports. */
export const PASSREADY_MAIL_FROM = DEFAULT_EMAIL_USER;

let transport: nodemailer.Transporter | null = null;

function getTransport(): nodemailer.Transporter {
  if (!transport) {
    const port = getEmailPort();
    const pass = getEmailPass();
    if (!pass) {
      throw new Error(
        "EMAIL_PASS (or legacy MAIL_PASSWORD) is required for SMTP — set it in Render env",
      );
    }

    transport = nodemailer.createTransport({
      host: getEmailHost(),
      port,
      secure: port === 465,
      auth: {
        user: getEmailUser(),
        pass,
      },
    });
  }
  return transport;
}

export function isSmtpMailConfigured(): boolean {
  return Boolean(getEmailPass());
}

export async function sendSmtpMail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ messageId: string }> {
  const transporter = getTransport();
  const info = await transporter.sendMail({
    from: getEmailUser(),
    to: input.to.trim(),
    subject: input.subject.trim(),
    text: input.text,
    ...(input.html?.trim() ? { html: input.html } : {}),
  });

  const messageId = info.messageId?.trim() || `smtp-${Date.now()}`;
  return { messageId };
}
