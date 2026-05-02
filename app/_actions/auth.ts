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

/** better-auth APIError shape (better-call's InternalAPIError). */
type BetterAuthAPIError = {
  body?: { code?: string; message?: string };
  status?: unknown;
};

/**
 * Type guard for better-auth's APIError (better-call's InternalAPIError).
 *
 * The `isAPIError` utility from better-auth is an internal helper with no
 * stable public export, so we replicate the relevant duck-typing check here.
 */
function isBetterAuthAPIError(err: unknown): err is BetterAuthAPIError {
  return (
    err !== null &&
    typeof err === "object" &&
    "status" in err &&
    "body" in err
  );
}

/**
 * Map a better-auth error to a user-facing error string.
 *
 * Prefers `err.body.code` (a stable enum key set by APIError.from) over
 * substring matching on `err.message`, decoupling callers from human-readable
 * message text that may change between better-auth versions.
 * Substring matching is retained as a fallback for any errors that don't go
 * through the APIError path.
 *
 * Returns the matching user-facing string, or null to signal "unhandled —
 * fall through to GENERIC_ERROR".
 */
function mapBetterAuthError(
  err: unknown,
  mappings: Record<string, string>,
): string | null {
  // Prefer body.code from APIError (stable enum, doesn't contain PII)
  if (isBetterAuthAPIError(err)) {
    const code = err.body?.code;
    if (code !== undefined && Object.prototype.hasOwnProperty.call(mappings, code)) {
      return mappings[code] ?? null;
    }
  }
  // Fallback: substring match on err.message
  const message =
    err !== null && typeof err === "object" && "message" in err
      ? String((err as { message: unknown }).message)
      : "";
  for (const [key, value] of Object.entries(mappings)) {
    if (message.includes(key)) return value;
  }
  return null;
}

/** Returns true if the error indicates better-auth rejected a field on updateUser. */
function isFieldRejectedError(err: unknown): boolean {
  if (isBetterAuthAPIError(err)) {
    return (
      err.body?.code === "FIELD_NOT_ALLOWED" ||
      err.body?.code === "VALIDATION_ERROR"
    );
  }
  const message =
    err !== null && typeof err === "object" && "message" in err
      ? String((err as { message: unknown }).message)
      : "";
  return (
    message.includes("not allowed") ||
    message.includes("No fields to update") ||
    message.includes("FIELD_NOT_ALLOWED")
  );
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
          dateOfBirth: input.dateOfBirth,
        },
      });
      return { ok: true };
    } catch (err) {
      const mapped = mapBetterAuthError(err, {
        USER_ALREADY_EXISTS: "An account with that email already exists.",
        USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "An account with that email already exists.",
        // Substring fallbacks for older/alternative code paths
        "User already exists": "An account with that email already exists.",
        "already exists": "An account with that email already exists.",
      });
      return { error: mapped ?? GENERIC_ERROR };
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
    } catch {
      // Always return ok to prevent account enumeration.
      // err is intentionally not logged to avoid capturing email addresses
      // from better-auth error messages (PII).
      logWarn({ source: "auth.requestPasswordReset" }, "Password reset request failed");
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
      const expiredMsg = "This reset link has expired. Request a new one.";
      const mapped = mapBetterAuthError(err, {
        INVALID_TOKEN: expiredMsg,
        TOKEN_EXPIRED: expiredMsg,
        // Substring fallbacks
        "Invalid token": expiredMsg,
        "Token expired": expiredMsg,
      });
      return { error: mapped ?? GENERIC_ERROR };
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
      if (isFieldRejectedError(err)) {
        // better-auth rejected the username field — fall back to a direct DB update.
        // This can happen with certain plugin/version combinations. Tracked via warn
        // so we can remove the fallback once confirmed unnecessary.
        logWarn(
          { source: "auth.changeUsername" },
          "updateUser rejected username field; falling back to Prisma",
        );
        const session = await requireSession();
        try {
          await prisma.user.update({
            where: { id: session.userId },
            data: { username: input.username },
          });
          updateTag("session");
          return { ok: true };
        } catch (dbErr) {
          const takenMsg = "That username is taken.";
          const mapped = mapBetterAuthError(dbErr, {
            P2002: takenMsg,
            "Unique constraint": takenMsg,
          });
          return { error: mapped ?? GENERIC_ERROR };
        }
      }

      const takenMsg = "That username is taken.";
      const mapped = mapBetterAuthError(err, {
        P2002: takenMsg,
        "Unique constraint": takenMsg,
      });
      return { error: mapped ?? GENERIC_ERROR };
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
      const mapped = mapBetterAuthError(err, {
        INVALID_PASSWORD: "Current password is incorrect.",
        // Substring fallback
        "Invalid password": "Current password is incorrect.",
      });
      return { error: mapped ?? GENERIC_ERROR };
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
        body: { dateOfBirth: input.dateOfBirth },
        headers: await headers(),
      });
      updateTag("session");
      return { ok: true };
    } catch (err) {
      if (isFieldRejectedError(err)) {
        // better-auth rejected dateOfBirth — fall back to a direct DB update.
        // Tracked via warn so we can remove the fallback once confirmed unnecessary.
        logWarn(
          { source: "auth.updateDateOfBirth" },
          "updateUser rejected dateOfBirth field; falling back to Prisma",
        );
        const session = await requireSession();
        await prisma.user.update({
          where: { id: session.userId },
          data: { dateOfBirth: input.dateOfBirth },
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
