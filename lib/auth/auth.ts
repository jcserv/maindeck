import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { username } from "better-auth/plugins";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { sendEmail } from "@/lib/email/mailer";

const env = getEnv();

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    sendResetPassword: async ({ user, token }) => {
      const resetUrl = `${env.BETTER_AUTH_URL}/reset-password?token=${token}`;
      void sendEmail({
        to: user.email,
        subject: "Reset your Maindeck password",
        text: `Reset your Maindeck password by clicking the link below:\n\n${resetUrl}\n\nThis link expires in 1 hour. If you didn't request a password reset, you can ignore this email.`,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60,
    sendVerificationEmail: async ({ user, url }) => {
      const verifyUrl = new URL(url);
      verifyUrl.searchParams.set("callbackURL", "/verify-email");
      void sendEmail({
        to: user.email,
        subject: "Verify your email for Maindeck",
        text: `Confirm your email to finish creating your Maindeck account:\n\n${verifyUrl.toString()}\n\nThis link expires in 1 hour.`,
      });
    },
  },
  user: {
    changeEmail: {
      enabled: true,
      sendChangeEmailVerification: async ({ newEmail, url }: { newEmail: string; url: string }) => {
        void sendEmail({
          to: newEmail,
          subject: "Confirm your new Maindeck email address",
          text: `Confirm your new email address for Maindeck by clicking the link below:\n\n${url}\n\nThis link expires in 1 hour. If you didn't request an email change, you can ignore this email.`,
        });
      },
    },
    additionalFields: {
      dateOfBirth: {
        type: "date",
        required: true,
        input: true,
      },
    },
  },
  plugins: [username()],
});

export type Auth = typeof auth;
