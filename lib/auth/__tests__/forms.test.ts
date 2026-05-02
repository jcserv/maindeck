import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  MIN_AGE_YEARS,
  dateOfBirthSchema,
  signUpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changeEmailSchema,
  changeUsernameSchema,
  changePasswordSchema,
  updateDateOfBirthSchema,
  parseAuthForm,
  tryParseAuthForm,
} from "../forms";

// ---------------------------------------------------------------------------
// dateOfBirthSchema — age gate
// ---------------------------------------------------------------------------

function dobExactlyYearsAgo(years: number): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d;
}

function dobYearsAgoMinusOnDay(years: number): Date {
  const d = dobExactlyYearsAgo(years);
  d.setDate(d.getDate() + 1); // one day forward = one day short of the age
  return d;
}

describe("dateOfBirthSchema", () => {
  it(`accepts a date exactly ${MIN_AGE_YEARS} years ago`, () => {
    const dob = dobExactlyYearsAgo(MIN_AGE_YEARS);
    expect(() => dateOfBirthSchema.parse(dob)).not.toThrow();
  });

  it(`rejects a date that is ${MIN_AGE_YEARS} years minus one day ago`, () => {
    const dob = dobYearsAgoMinusOnDay(MIN_AGE_YEARS);
    expect(() => dateOfBirthSchema.parse(dob)).toThrow();
  });

  it("rejects future dates", () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(() => dateOfBirthSchema.parse(tomorrow)).toThrow();
  });

  it("accepts far-past dates", () => {
    const ancient = new Date("1920-01-01");
    expect(() => dateOfBirthSchema.parse(ancient)).not.toThrow();
  });

  it("rejects invalid date strings", () => {
    expect(() => dateOfBirthSchema.parse("not-a-date")).toThrow();
  });

  it("coerces ISO strings to Date", () => {
    const dob = dobExactlyYearsAgo(MIN_AGE_YEARS);
    expect(() => dateOfBirthSchema.parse(dob.toISOString())).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// signUpSchema
// ---------------------------------------------------------------------------

describe("signUpSchema", () => {
  const valid = {
    username: "testuser",
    email: "test@example.com",
    password: "securepassword",
    dateOfBirth: dobExactlyYearsAgo(MIN_AGE_YEARS),
  };

  it("accepts valid input", () => {
    expect(() => signUpSchema.parse(valid)).not.toThrow();
  });

  it("rejects short username", () => {
    expect(() => signUpSchema.parse({ ...valid, username: "ab" })).toThrow();
  });

  it("rejects invalid email", () => {
    expect(() =>
      signUpSchema.parse({ ...valid, email: "not-an-email" }),
    ).toThrow();
  });

  it("rejects short password", () => {
    expect(() => signUpSchema.parse({ ...valid, password: "short" })).toThrow();
  });

  it("rejects underage dob", () => {
    const underage = dobYearsAgoMinusOnDay(MIN_AGE_YEARS);
    expect(() =>
      signUpSchema.parse({ ...valid, dateOfBirth: underage }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// forgotPasswordSchema
// ---------------------------------------------------------------------------

describe("forgotPasswordSchema", () => {
  it("accepts valid email", () => {
    expect(() =>
      forgotPasswordSchema.parse({ email: "user@example.com" }),
    ).not.toThrow();
  });

  it("rejects invalid email", () => {
    expect(() =>
      forgotPasswordSchema.parse({ email: "bad-email" }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// resetPasswordSchema
// ---------------------------------------------------------------------------

describe("resetPasswordSchema", () => {
  it("accepts valid token and password", () => {
    expect(() =>
      resetPasswordSchema.parse({ token: "tok123", password: "newpassword123" }),
    ).not.toThrow();
  });

  it("rejects empty token", () => {
    expect(() =>
      resetPasswordSchema.parse({ token: "", password: "newpassword123" }),
    ).toThrow();
  });

  it("rejects short password", () => {
    expect(() =>
      resetPasswordSchema.parse({ token: "tok123", password: "short" }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// changeEmailSchema
// ---------------------------------------------------------------------------

describe("changeEmailSchema", () => {
  it("accepts valid email", () => {
    expect(() =>
      changeEmailSchema.parse({ newEmail: "new@example.com" }),
    ).not.toThrow();
  });

  it("rejects invalid email", () => {
    expect(() =>
      changeEmailSchema.parse({ newEmail: "bad" }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// changeUsernameSchema
// ---------------------------------------------------------------------------

describe("changeUsernameSchema", () => {
  it("accepts valid username", () => {
    expect(() =>
      changeUsernameSchema.parse({ username: "valid_user" }),
    ).not.toThrow();
  });

  it("rejects username with special characters", () => {
    expect(() =>
      changeUsernameSchema.parse({ username: "invalid user!" }),
    ).toThrow();
  });

  it("rejects too-long username", () => {
    expect(() =>
      changeUsernameSchema.parse({ username: "a".repeat(33) }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// changePasswordSchema
// ---------------------------------------------------------------------------

describe("changePasswordSchema", () => {
  it("accepts valid current and new passwords", () => {
    expect(() =>
      changePasswordSchema.parse({
        currentPassword: "oldpassword",
        newPassword: "newpassword123",
      }),
    ).not.toThrow();
  });

  it("rejects empty current password", () => {
    expect(() =>
      changePasswordSchema.parse({
        currentPassword: "",
        newPassword: "newpassword123",
      }),
    ).toThrow();
  });

  it("rejects short new password", () => {
    expect(() =>
      changePasswordSchema.parse({
        currentPassword: "oldpassword",
        newPassword: "short",
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// updateDateOfBirthSchema
// ---------------------------------------------------------------------------

describe("updateDateOfBirthSchema", () => {
  it("accepts valid dob", () => {
    expect(() =>
      updateDateOfBirthSchema.parse({
        dateOfBirth: dobExactlyYearsAgo(MIN_AGE_YEARS),
      }),
    ).not.toThrow();
  });

  it("rejects underage dob", () => {
    expect(() =>
      updateDateOfBirthSchema.parse({
        dateOfBirth: dobYearsAgoMinusOnDay(MIN_AGE_YEARS),
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// parseAuthForm
// ---------------------------------------------------------------------------

describe("parseAuthForm", () => {
  it("extracts specified fields from FormData", () => {
    const fd = new FormData();
    fd.set("email", "user@example.com");
    fd.set("extra", "ignored");

    const result = parseAuthForm(forgotPasswordSchema, fd, ["email"]);
    expect(result.email).toBe("user@example.com");
  });

  it("throws ZodError when validation fails", () => {
    const fd = new FormData();
    fd.set("email", "not-an-email");

    expect(() => parseAuthForm(forgotPasswordSchema, fd, ["email"])).toThrow();
  });

  it("ignores fields not present in FormData", () => {
    const fd = new FormData();
    // email not set — should fail validation
    expect(() =>
      parseAuthForm(forgotPasswordSchema, fd, ["email"]),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// tryParseAuthForm
// ---------------------------------------------------------------------------

describe("tryParseAuthForm", () => {
  it("returns ok:true with parsed data on valid input", () => {
    const fd = new FormData();
    fd.set("email", "user@example.com");

    const result = tryParseAuthForm(forgotPasswordSchema, fd, ["email"]);
    expect(result).toEqual({ ok: true, data: { email: "user@example.com" } });
  });

  it("returns ok:false with the first ZodError message on invalid input", () => {
    const fd = new FormData();
    fd.set("email", "not-an-email");

    const result = tryParseAuthForm(forgotPasswordSchema, fd, ["email"]);
    expect(result).toEqual({ ok: false, error: "Enter a valid email address" });
  });

  it("rethrows non-Zod errors thrown by the schema", () => {
    const boom = new Error("non-zod failure");
    const explodingSchema = z.object({}).transform(() => {
      throw boom;
    });
    const fd = new FormData();

    expect(() => tryParseAuthForm(explodingSchema, fd, [])).toThrow(boom);
  });

  it("falls back to 'Invalid input.' when ZodError has no issues", () => {
    const explodingSchema = z.object({}).transform(() => {
      throw new z.ZodError([]);
    });
    const fd = new FormData();

    const result = tryParseAuthForm(explodingSchema, fd, []);
    expect(result).toEqual({ ok: false, error: "Invalid input." });
  });
});
