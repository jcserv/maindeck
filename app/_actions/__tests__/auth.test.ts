import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));
vi.mock("@/lib/auth/auth", () => ({
  auth: {
    api: {
      signUpEmail: vi.fn(),
      requestPasswordReset: vi.fn(),
      resetPassword: vi.fn(),
      changeEmail: vi.fn(),
      updateUser: vi.fn(),
      changePassword: vi.fn(),
    },
  },
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));
vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(),
}));

import { updateTag } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import {
  signUp,
  requestPasswordReset,
  resetPassword,
  changeEmail,
  changeUsername,
  changePassword,
  updateDateOfBirth,
  deleteAccount,
} from "../auth";

const mockSignUpEmail = vi.mocked(auth.api.signUpEmail);
const mockRequestPasswordReset = vi.mocked(auth.api.requestPasswordReset);
const mockResetPassword = vi.mocked(auth.api.resetPassword);
const mockChangeEmail = vi.mocked(auth.api.changeEmail);
const mockUpdateUser = vi.mocked(auth.api.updateUser);
const mockChangePassword = vi.mocked(auth.api.changePassword);
const mockPrismaUserUpdate = vi.mocked(prisma.user.update);
const mockRequireSession = vi.mocked(requireSession);
const mockUpdateTag = vi.mocked(updateTag);

const USER_ID = "user-1";
const MOCK_SESSION = {
  userId: USER_ID,
  email: "test@example.com",
  username: "testuser",
  dateOfBirth: new Date("1990-01-01"),
};

// DOB for a 20-year-old
const VALID_DOB_ISO: string = (() => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 20);
  return d.toISOString().slice(0, 10);
})();

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSession.mockResolvedValue(MOCK_SESSION);
});

// ---------------------------------------------------------------------------
// signUp
// ---------------------------------------------------------------------------

describe("signUp", () => {
  const validInput = {
    username: "newuser",
    email: "new@example.com",
    password: "password123",
    dateOfBirth: VALID_DOB_ISO,
  };

  it("calls signUpEmail with correct body and returns ok:true", async () => {
    mockSignUpEmail.mockResolvedValue({} as never);

    const result = await signUp(formData(validInput));

    expect(mockSignUpEmail).toHaveBeenCalledWith({
      body: expect.objectContaining({
        email: "new@example.com",
        username: "newuser",
        name: "newuser",
      }),
    });
    expect(result).toEqual({ ok: true });
  });

  it("maps 'already exists' error to user-safe message", async () => {
    mockSignUpEmail.mockRejectedValue(
      new Error("User already exists. Use another email."),
    );

    const result = await signUp(formData(validInput));

    expect(result).toEqual({
      error: "An account with that email already exists.",
    });
  });

  it("returns generic error for unknown failures", async () => {
    mockSignUpEmail.mockRejectedValue(new Error("Database connection failed"));

    const result = await signUp(formData(validInput));

    expect(result).toEqual({ error: "Something went wrong. Try again." });
  });

  it("returns generic error when error is not an Error object (e.g. a string)", async () => {
    mockSignUpEmail.mockRejectedValue("string rejection");

    const result = await signUp(formData(validInput));

    expect(result).toEqual({ error: "Something went wrong. Try again." });
  });

  it("returns first ZodError message when input is invalid", async () => {
    const result = await signUp(
      formData({ username: "x", email: "bad", password: "short", dateOfBirth: "not-a-date" }),
    );
    expect(result).toHaveProperty("error");
    expect(mockSignUpEmail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// requestPasswordReset
// ---------------------------------------------------------------------------

describe("requestPasswordReset", () => {
  it("calls requestPasswordReset and returns ok:true", async () => {
    mockRequestPasswordReset.mockResolvedValue({} as never);

    const result = await requestPasswordReset(
      formData({ email: "user@example.com" }),
    );

    expect(mockRequestPasswordReset).toHaveBeenCalledWith({
      body: { email: "user@example.com", redirectTo: "/reset-password" },
    });
    expect(result).toEqual({ ok: true });
  });

  it("returns ok:true even for unknown email (prevents enumeration)", async () => {
    mockRequestPasswordReset.mockRejectedValue(new Error("User not found"));

    const result = await requestPasswordReset(
      formData({ email: "unknown@example.com" }),
    );

    expect(result).toEqual({ ok: true });
  });

  it("returns ZodError message for invalid email", async () => {
    const result = await requestPasswordReset(formData({ email: "bad-email" }));
    expect(result).toEqual({ error: "Enter a valid email address" });
    expect(mockRequestPasswordReset).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// resetPassword
// ---------------------------------------------------------------------------

describe("resetPassword", () => {
  const validInput = { token: "valid-token", password: "newpassword123" };

  it("calls resetPassword and returns ok:true on success", async () => {
    mockResetPassword.mockResolvedValue({} as never);

    const result = await resetPassword(formData(validInput));

    expect(mockResetPassword).toHaveBeenCalledWith({
      body: { token: "valid-token", newPassword: "newpassword123" },
    });
    expect(result).toEqual({ ok: true });
  });

  it("maps INVALID_TOKEN error to expired link message", async () => {
    mockResetPassword.mockRejectedValue(new Error("INVALID_TOKEN"));

    const result = await resetPassword(formData(validInput));

    expect(result).toEqual({
      error: "This reset link has expired. Request a new one.",
    });
  });

  it("maps 'Invalid token' message to expired link message", async () => {
    mockResetPassword.mockRejectedValue(new Error("Invalid token"));

    const result = await resetPassword(formData(validInput));

    expect(result).toEqual({
      error: "This reset link has expired. Request a new one.",
    });
  });

  it("maps TOKEN_EXPIRED error to expired link message", async () => {
    mockResetPassword.mockRejectedValue(new Error("TOKEN_EXPIRED"));

    const result = await resetPassword(formData(validInput));

    expect(result).toEqual({
      error: "This reset link has expired. Request a new one.",
    });
  });

  it("returns generic error for unknown failures", async () => {
    mockResetPassword.mockRejectedValue(new Error("Some other error"));

    const result = await resetPassword(formData(validInput));

    expect(result).toEqual({ error: "Something went wrong. Try again." });
  });
});

// ---------------------------------------------------------------------------
// changeEmail
// ---------------------------------------------------------------------------

describe("changeEmail", () => {
  it("calls changeEmail with correct body and returns ok:true", async () => {
    mockChangeEmail.mockResolvedValue({} as never);

    const result = await changeEmail(formData({ newEmail: "new@example.com" }));

    expect(mockChangeEmail).toHaveBeenCalledWith({
      body: {
        newEmail: "new@example.com",
        callbackURL: "/account?emailChanged=1",
      },
      headers: expect.anything(),
    });
    expect(result).toEqual({ ok: true });
  });

  it("returns error on failure", async () => {
    mockChangeEmail.mockRejectedValue(new Error("Something failed"));

    const result = await changeEmail(formData({ newEmail: "new@example.com" }));

    expect(result).toEqual({ error: "Something went wrong. Try again." });
  });

  it("returns ZodError message and skips API call on invalid email", async () => {
    const result = await changeEmail(formData({ newEmail: "bad" }));

    expect(result).toEqual({ error: "Enter a valid email address" });
    expect(mockChangeEmail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// changeUsername
// ---------------------------------------------------------------------------

describe("changeUsername", () => {
  it("calls updateUser and returns ok:true on success", async () => {
    mockUpdateUser.mockResolvedValue({} as never);

    const result = await changeUsername(formData({ username: "newusername" }));

    expect(mockUpdateUser).toHaveBeenCalledWith({
      body: { username: "newusername" },
      headers: expect.anything(),
    });
    expect(mockUpdateTag).toHaveBeenCalledWith("session");
    expect(result).toEqual({ ok: true });
  });

  it("falls back to direct DB update when updateUser rejects with not-allowed", async () => {
    mockUpdateUser.mockRejectedValue(new Error("not allowed"));
    mockPrismaUserUpdate.mockResolvedValue({} as never);

    const result = await changeUsername(formData({ username: "newusername" }));

    expect(mockPrismaUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
      }),
    );
    expect(mockUpdateTag).toHaveBeenCalledWith("session");
    expect(result).toEqual({ ok: true });
  });

  it("returns 'taken' error when DB update hits unique constraint", async () => {
    mockUpdateUser.mockRejectedValue(new Error("not allowed"));
    mockPrismaUserUpdate.mockRejectedValue(new Error("P2002 Unique constraint"));

    const result = await changeUsername(formData({ username: "takenuser" }));

    expect(result).toEqual({ error: "That username is taken." });
  });

  it("returns generic error for unexpected DB failure in fallback path", async () => {
    mockUpdateUser.mockRejectedValue(new Error("No fields to update"));
    mockPrismaUserUpdate.mockRejectedValue(new Error("Connection refused"));

    const result = await changeUsername(formData({ username: "someuser" }));

    expect(result).toEqual({ error: "Something went wrong. Try again." });
  });

  it("returns 'taken' error when updateUser throws P2002", async () => {
    mockUpdateUser.mockRejectedValue(new Error("P2002 Unique constraint violation"));

    const result = await changeUsername(formData({ username: "takenuser" }));

    expect(result).toEqual({ error: "That username is taken." });
  });

  it("returns generic error for unknown updateUser failure", async () => {
    mockUpdateUser.mockRejectedValue(new Error("Some unknown error"));

    const result = await changeUsername(formData({ username: "user" }));

    expect(result).toEqual({ error: "Something went wrong. Try again." });
  });

  it("returns ZodError message and skips API call when username has special characters", async () => {
    const result = await changeUsername(formData({ username: "bad name!" }));

    expect(result).toHaveProperty("error");
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// changePassword
// ---------------------------------------------------------------------------

describe("changePassword", () => {
  const validInput = {
    currentPassword: "oldpassword",
    newPassword: "newpassword123",
  };

  it("calls changePassword and returns ok:true on success", async () => {
    mockChangePassword.mockResolvedValue({} as never);

    const result = await changePassword(formData(validInput));

    expect(mockChangePassword).toHaveBeenCalledWith({
      body: {
        currentPassword: "oldpassword",
        newPassword: "newpassword123",
        revokeOtherSessions: true,
      },
      headers: expect.anything(),
    });
    expect(mockUpdateTag).toHaveBeenCalledWith("session");
    expect(result).toEqual({ ok: true });
  });

  it("maps INVALID_PASSWORD error to user-safe message", async () => {
    mockChangePassword.mockRejectedValue(new Error("INVALID_PASSWORD"));

    const result = await changePassword(formData(validInput));

    expect(result).toEqual({ error: "Current password is incorrect." });
  });

  it("maps 'Invalid password' message to user-safe message", async () => {
    mockChangePassword.mockRejectedValue(new Error("Invalid password"));

    const result = await changePassword(formData(validInput));

    expect(result).toEqual({ error: "Current password is incorrect." });
  });

  it("returns generic error for unknown failures", async () => {
    mockChangePassword.mockRejectedValue(new Error("Network error"));

    const result = await changePassword(formData(validInput));

    expect(result).toEqual({ error: "Something went wrong. Try again." });
  });

  it("returns ZodError message and skips API call when newPassword is too short", async () => {
    const result = await changePassword(
      formData({ currentPassword: "old", newPassword: "x" }),
    );

    expect(result).toHaveProperty("error");
    expect(mockChangePassword).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateDateOfBirth
// ---------------------------------------------------------------------------

describe("updateDateOfBirth", () => {
  it("calls updateUser and returns ok:true on success", async () => {
    mockUpdateUser.mockResolvedValue({} as never);

    const result = await updateDateOfBirth(
      formData({ dateOfBirth: VALID_DOB_ISO }),
    );

    expect(mockUpdateUser).toHaveBeenCalledWith({
      body: { dateOfBirth: expect.anything() },
      headers: expect.anything(),
    });
    expect(mockUpdateTag).toHaveBeenCalledWith("session");
    expect(result).toEqual({ ok: true });
  });

  it("falls back to direct DB update when updateUser rejects with not-allowed", async () => {
    mockUpdateUser.mockRejectedValue(new Error("not allowed"));
    mockPrismaUserUpdate.mockResolvedValue({} as never);

    const result = await updateDateOfBirth(
      formData({ dateOfBirth: VALID_DOB_ISO }),
    );

    expect(mockPrismaUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
      }),
    );
    expect(mockUpdateTag).toHaveBeenCalledWith("session");
    expect(result).toEqual({ ok: true });
  });

  it("falls back to direct DB update when updateUser says 'No fields to update'", async () => {
    mockUpdateUser.mockRejectedValue(new Error("No fields to update"));
    mockPrismaUserUpdate.mockResolvedValue({} as never);

    const result = await updateDateOfBirth(
      formData({ dateOfBirth: VALID_DOB_ISO }),
    );

    expect(mockPrismaUserUpdate).toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });

  it("falls back to direct DB update when updateUser says FIELD_NOT_ALLOWED", async () => {
    mockUpdateUser.mockRejectedValue(new Error("FIELD_NOT_ALLOWED"));
    mockPrismaUserUpdate.mockResolvedValue({} as never);

    const result = await updateDateOfBirth(
      formData({ dateOfBirth: VALID_DOB_ISO }),
    );

    expect(mockPrismaUserUpdate).toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });

  it("returns generic error for unknown updateUser failures", async () => {
    mockUpdateUser.mockRejectedValue(new Error("Unknown error"));

    const result = await updateDateOfBirth(
      formData({ dateOfBirth: VALID_DOB_ISO }),
    );

    expect(result).toEqual({ error: "Something went wrong. Try again." });
  });

  it("returns ZodError message and skips API call on invalid dateOfBirth", async () => {
    const result = await updateDateOfBirth(
      formData({ dateOfBirth: "not-a-date" }),
    );

    expect(result).toHaveProperty("error");
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deleteAccount
// ---------------------------------------------------------------------------

describe("deleteAccount", () => {
  const mockPrismaUserDelete = vi.mocked(prisma.user.delete);

  it("deletes the user via Prisma and redirects to sign-in", async () => {
    mockPrismaUserDelete.mockResolvedValue({} as never);

    await expect(deleteAccount()).rejects.toThrow(
      "NEXT_REDIRECT:/sign-in?deleted=1",
    );

    expect(mockPrismaUserDelete).toHaveBeenCalledWith({
      where: { id: USER_ID },
    });
  });

  it("throws generic error when Prisma delete fails", async () => {
    mockPrismaUserDelete.mockRejectedValue(new Error("Database error"));

    await expect(deleteAccount()).rejects.toThrow(
      "Something went wrong. Try again.",
    );
  });
});
