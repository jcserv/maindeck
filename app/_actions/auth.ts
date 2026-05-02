"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db";
import { withActionLogging, logWarn } from "@/lib/telemetry";
import {
  tryParseAuthForm,
  signUpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changeEmailSchema,
  changeUsernameSchema,
  changePasswordSchema,
  updateDateOfBirthSchema,
} from "@/lib/auth/forms";
import { requireSession } from "@/lib/auth/session";

export type ActionResult = { ok: true } | { error: string };

const GENERIC_ERROR = "Something went wrong. Try again.";

function extractErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return GENERIC_ERROR;
}


export const signUp = withActionLogging(
  "auth.signUp",
  async (formData: FormData): Promise<ActionResult> => {
    const parsed = tryParseAuthForm(signUpSchema, formData, [
      "username",
      "email",
      "password",
      "dateOfBirth",
    ]);
    if (!parsed.ok) return { error: parsed.error };
    const input = parsed.data;

    try {
      await auth.api.signUpEmail({
        body: {
          email: input.email,
          password: input.password,
          username: input.username,
          name: input.username,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          dateOfBirth: input.dateOfBirth as any,
        },
      });
      return { ok: true };
    } catch (err) {
      const message = extractErrorMessage(err);
      if (
        message.includes("User already exists") ||
        message.includes("already exists")
      ) {
        return { error: "An account with that email already exists." };
      }
      return { error: GENERIC_ERROR };
    }
  },
);

export const requestPasswordReset = withActionLogging(
  "auth.requestPasswordReset",
  async (formData: FormData): Promise<ActionResult> => {
    const parsed = tryParseAuthForm(forgotPasswordSchema, formData, ["email"]);
    if (!parsed.ok) return { error: parsed.error };
    const input = parsed.data;

    try {
      await auth.api.requestPasswordReset({
        body: { email: input.email, redirectTo: "/reset-password" },
      });
    } catch (err) {
      // Always return ok to prevent account enumeration
      logWarn({ source: "auth.requestPasswordReset" }, "Password reset request failed", err);
    }

    return { ok: true };
  },
);

export const resetPassword = withActionLogging(
  "auth.resetPassword",
  async (formData: FormData): Promise<ActionResult> => {
    const parsed = tryParseAuthForm(resetPasswordSchema, formData, [
      "token",
      "password",
    ]);
    if (!parsed.ok) return { error: parsed.error };
    const input = parsed.data;

    try {
      await auth.api.resetPassword({
        body: { token: input.token, newPassword: input.password },
      });
      return { ok: true };
    } catch (err) {
      const message = extractErrorMessage(err);
      if (
        message.includes("INVALID_TOKEN") ||
        message.includes("Invalid token") ||
        message.includes("TOKEN_EXPIRED") ||
        message.includes("Token expired")
      ) {
        return {
          error: "This reset link has expired. Request a new one.",
        };
      }
      return { error: GENERIC_ERROR };
    }
  },
);

export const changeEmail = withActionLogging(
  "auth.changeEmail",
  async (formData: FormData): Promise<ActionResult> => {
    const parsed = tryParseAuthForm(changeEmailSchema, formData, ["newEmail"]);
    if (!parsed.ok) return { error: parsed.error };
    const input = parsed.data;

    try {
      await auth.api.changeEmail({
        body: {
          newEmail: input.newEmail,
          callbackURL: "/account?emailChanged=1",
        },
        headers: await headers(),
      });
      return { ok: true };
    } catch {
      return { error: GENERIC_ERROR };
    }
  },
);

export const changeUsername = withActionLogging(
  "auth.changeUsername",
  async (formData: FormData): Promise<ActionResult> => {
    const parsed = tryParseAuthForm(changeUsernameSchema, formData, ["username"]);
    if (!parsed.ok) return { error: parsed.error };
    const input = parsed.data;

    try {
      await auth.api.updateUser({
        body: { username: input.username },
        headers: await headers(),
      });
      updateTag("session");
      return { ok: true };
    } catch (err) {
      // If updateUser doesn't accept username, fall back to direct DB update
      const message = extractErrorMessage(err);
      if (
        message.includes("not allowed") ||
        message.includes("No fields to update")
      ) {
        const session = await requireSession();
        try {
          await prisma.user.update({
            where: { id: session.userId },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data: { username: input.username } as any,
          });
          updateTag("session");
          return { ok: true };
        } catch (dbErr) {
          const dbMessage = extractErrorMessage(dbErr);
          if (
            dbMessage.includes("P2002") ||
            dbMessage.includes("Unique constraint")
          ) {
            return { error: "That username is taken." };
          }
          return { error: GENERIC_ERROR };
        }
      }
      if (message.includes("P2002") || message.includes("Unique constraint")) {
        return { error: "That username is taken." };
      }
      return { error: GENERIC_ERROR };
    }
  },
);

export const changePassword = withActionLogging(
  "auth.changePassword",
  async (formData: FormData): Promise<ActionResult> => {
    const parsed = tryParseAuthForm(changePasswordSchema, formData, [
      "currentPassword",
      "newPassword",
    ]);
    if (!parsed.ok) return { error: parsed.error };
    const input = parsed.data;

    try {
      await auth.api.changePassword({
        body: {
          currentPassword: input.currentPassword,
          newPassword: input.newPassword,
          revokeOtherSessions: true,
        },
        headers: await headers(),
      });
      updateTag("session");
      return { ok: true };
    } catch (err) {
      const message = extractErrorMessage(err);
      if (
        message.includes("INVALID_PASSWORD") ||
        message.includes("Invalid password")
      ) {
        return { error: "Current password is incorrect." };
      }
      return { error: GENERIC_ERROR };
    }
  },
);

export const updateDateOfBirth = withActionLogging(
  "auth.updateDateOfBirth",
  async (formData: FormData): Promise<ActionResult> => {
    const parsed = tryParseAuthForm(updateDateOfBirthSchema, formData, [
      "dateOfBirth",
    ]);
    if (!parsed.ok) return { error: parsed.error };
    const input = parsed.data;

    try {
      await auth.api.updateUser({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        body: { dateOfBirth: input.dateOfBirth as any },
        headers: await headers(),
      });
      updateTag("session");
      return { ok: true };
    } catch (err) {
      // If updateUser rejects dateOfBirth, fall back to direct DB update
      const message = extractErrorMessage(err);
      if (
        message.includes("not allowed") ||
        message.includes("No fields to update") ||
        message.includes("FIELD_NOT_ALLOWED")
      ) {
        const session = await requireSession();
        await prisma.user.update({
          where: { id: session.userId },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: { dateOfBirth: input.dateOfBirth } as any,
        });
        updateTag("session");
        return { ok: true };
      }
      return { error: GENERIC_ERROR };
    }
  },
);

export const deleteAccount = withActionLogging(
  "auth.deleteAccount",
  async (): Promise<never> => {
    const session = await requireSession();

    try {
      await prisma.user.delete({ where: { id: session.userId } });
    } catch {
      throw new Error(GENERIC_ERROR);
    }

    redirect("/sign-in?deleted=1");
  },
);
