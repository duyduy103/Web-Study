import { z } from "zod";
import { vi } from "@/lib/i18n/vi";

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, { message: vi.auth.validation.emailRequired })
    .email({ message: vi.auth.validation.emailInvalid }),
  password: z
    .string()
    .min(6, { message: vi.auth.validation.passwordMin }),
});

export const signupSchema = z.object({
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
  password: z
    .string()
    .min(6, { message: vi.auth.validation.passwordMin }),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;

