import { z } from "zod";
import { vi } from "@/lib/i18n/vi";
import {
  strongPasswordSchema,
  isPasswordContainingEmail,
} from "@/lib/auth/password-rules";

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, { message: vi.auth.validation.emailRequired })
    .email({ message: vi.auth.validation.emailInvalid }),
  password: z
    .string()
    .min(1, { message: vi.auth.validation.passwordMin10 }),
});

export const signupSchema = z
  .object({
    role: z.enum(["student", "teacher"], {
      message: vi.auth.validation.roleInvalid,
    }),
    displayName: z
      .string()
      .trim()
      .max(60, { message: vi.auth.validation.displayNameMax })
      .optional(),
    email: z
      .string()
      .trim()
      .min(1, { message: vi.auth.validation.emailRequired })
      .email({ message: vi.auth.validation.emailInvalid }),
    password: strongPasswordSchema,
    confirmPassword: z
      .string()
      .min(1, { message: vi.auth.validation.confirmPasswordRequired }),
    consentAccepted: z.boolean().refine((val) => val === true, {
      message: vi.auth.validation.consentRequired,
    }),
  })
  .refine((data) => !isPasswordContainingEmail(data.password, data.email), {
    message: vi.auth.validation.passwordContainsEmail,
    path: ["password"],
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: vi.auth.validation.passwordMismatch,
    path: ["confirmPassword"],
  });

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, { message: vi.auth.validation.emailRequired })
    .email({ message: vi.auth.validation.emailInvalid }),
});

export const resetPasswordSchema = z
  .object({
    password: strongPasswordSchema,
    confirmPassword: z
      .string()
      .min(1, { message: vi.auth.validation.confirmPasswordRequired }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: vi.auth.validation.passwordMismatch,
    path: ["confirmPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
