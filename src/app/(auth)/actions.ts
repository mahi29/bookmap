"use server";

import { redirect } from "next/navigation";
import { validateCredentials } from "@/domains/auth/validate-credentials";
import { login, signup } from "@/domains/auth/auth-service";
import { createSession } from "@/infrastructure/auth/session";

export interface AuthFormState {
  message: string;
}

// Server actions: validate the form, run the auth use case, set the session cookie,
// land on the map. On failure they return a message for useActionState to render.

async function authenticate(
  authFn: typeof login,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = validateCredentials({
    username: String(formData.get("username") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.ok) return { message: parsed.error };

  const result = await authFn(parsed.value);
  if (!result.ok) return { message: result.error };

  await createSession(result.value);
  redirect("/map");
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  return authenticate(login, formData);
}

export async function signupAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  return authenticate(signup, formData);
}
