import { z } from "zod";

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 32;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const MIN_AGE_YEARS = 13;

const usernamePattern = /^[a-zA-Z0-9_]+$/;

export const usernameSchema = z
  .string()
  .trim()
  .min(USERNAME_MIN, `Username must be at least ${USERNAME_MIN} characters`)
  .max(USERNAME_MAX, `Username must be at most ${USERNAME_MAX} characters`)
  .regex(usernamePattern, "Username may only contain letters, numbers, and underscores");

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .email("Enter a valid email address");

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`)
  .max(PASSWORD_MAX, `Password must be at most ${PASSWORD_MAX} characters`);

function yearsBetween(from: Date, to: Date): number {
  let years = to.getFullYear() - from.getFullYear();
  const m = to.getMonth() - from.getMonth();
  if (m < 0 || (m === 0 && to.getDate() < from.getDate())) {
    years -= 1;
  }
  return years;
}

export const dateOfBirthSchema = z
  .coerce.date({ message: "Enter a valid date of birth" })
  .refine((d) => !Number.isNaN(d.getTime()), "Enter a valid date of birth")
  .refine((d) => d.getTime() <= Date.now(), "Date of birth cannot be in the future")
  .refine(
    (d) => yearsBetween(d, new Date()) >= MIN_AGE_YEARS,
    `You must be at least ${MIN_AGE_YEARS} years old`,
  );

export const signUpSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  dateOfBirth: dateOfBirthSchema,
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changeEmailSchema = z.object({
  newEmail: emailSchema,
});
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;

export const changeUsernameSchema = z.object({
  username: usernameSchema,
});
export type ChangeUsernameInput = z.infer<typeof changeUsernameSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const updateDateOfBirthSchema = z.object({
  dateOfBirth: dateOfBirthSchema,
});
export type UpdateDateOfBirthInput = z.infer<typeof updateDateOfBirthSchema>;

/**
 * Mirror of `parseDeckForm` — pulls named keys from FormData and hands them
 * to a zod schema for trimming/coercion/validation in one place.
 */
export function parseAuthForm<T extends z.ZodType>(
  schema: T,
  formData: FormData,
  fields: readonly (keyof z.input<T> & string)[],
): z.output<T> {
  const input: Record<string, unknown> = {};
  for (const key of fields) {
    const value = formData.get(key);
    if (value !== null) input[key] = value;
  }
  return schema.parse(input);
}

export function tryParseAuthForm<T extends z.ZodType>(
  schema: T,
  formData: FormData,
  fields: readonly (keyof z.input<T> & string)[],
): { ok: true; data: z.output<T> } | { ok: false; error: string } {
  try {
    return { ok: true, data: parseAuthForm(schema, formData, fields) };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, error: err.issues[0]?.message ?? "Invalid input." };
    }
    throw err;
  }
}
