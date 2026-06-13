export {
  getDefaultReplyToEmail,
  getEmailUser,
  getPassreadyMailFrom,
  getResendApiKey,
  getResendClient,
  isOutreachMailConfigured,
  isSmtpMailConfigured,
  PASSREADY_MAIL_FROM,
  sendOutreachMail,
  sendSmtpMail,
  type OutreachMailRegion,
} from "./resend-mail-service.js";

export {
  describeOutreachSender,
  formatOutreachFromAddress,
  getEmailFromName,
  getEmailUserForRegion,
  getOutreachFromForRegion,
} from "../outreach-mail-from.js";
