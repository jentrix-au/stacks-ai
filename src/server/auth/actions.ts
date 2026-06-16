"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { isSignInAllowed, NOT_INVITED_MESSAGE } from "./signup-gate";

export type SignInState =
  | { status: "idle" }
  | { status: "sent" }
  | { status: "error"; message: string };

// Only accept UUID-shape invite tokens, to keep crafted values from
// reaching the post-auth `redirectTo` and pointing anywhere unexpected.
function inviteRedirect(invite: string | null | undefined): string {
  if (!invite) return "/";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(invite)) return "/";
  return `/invite/${invite}`;
}

export async function signInWithEmail(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { status: "error", message: "Email is required." };
  const invite = String(formData.get("invite") ?? "") || null;

  // Don't send a magic link to an address that can't sign in (invite-only mode).
  // The `signIn` callback enforces this regardless; this is just nicer UX.
  if (!(await isSignInAllowed(email))) {
    return { status: "error", message: NOT_INVITED_MESSAGE };
  }

  try {
    await signIn("resend", {
      email,
      redirect: false,
      redirectTo: inviteRedirect(invite),
    });
    return { status: "sent" };
  } catch (err) {
    if (err instanceof AuthError) {
      // The gate throws AccessDenied — show the friendly invite-only message.
      if (err.type === "AccessDenied") {
        return { status: "error", message: NOT_INVITED_MESSAGE };
      }
      return { status: "error", message: err.message };
    }
    return { status: "error", message: "Could not send sign-in email." };
  }
}

export async function signInWithProvider(provider: "google", invite?: string) {
  await signIn(provider, { redirectTo: inviteRedirect(invite) });
}
