import { Resend } from "resend";
import { getEnv } from "@/lib/env";

type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
};

let client: Resend | null = null;

function getClient(): Resend {
  if (client === null) {
    client = new Resend(getEnv().RESEND_API_KEY);
  }
  return client;
}

export async function sendEmail({ to, subject, text }: SendEmailInput): Promise<void> {
  const { EMAIL_FROM } = getEnv();
  const result = await getClient().emails.send({
    from: EMAIL_FROM,
    to,
    subject,
    text,
  });
  if (result.error) {
    console.error("sendEmail failed", { to, subject, error: result.error });
  }
}
