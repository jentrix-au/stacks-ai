import { Suspense } from "react";
import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";
import { NOT_INVITED_MESSAGE } from "@/server/auth/signup-gate";

/** Map an Auth.js `?error=<code>` into user-facing copy. */
function authErrorMessage(code?: string): string | undefined {
  switch (code) {
    case undefined:
    case "":
      return undefined;
    case "AccessDenied":
      return NOT_INVITED_MESSAGE;
    case "Verification":
      return "That sign-in link has expired or was already used. Request a new one below.";
    default:
      return "Something went wrong while signing you in. Please try again.";
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    "check-email"?: string;
    invite?: string;
    error?: string;
  }>;
}) {
  const [session, params] = await Promise.all([auth(), searchParams]);
  const invite =
    params.invite && /^[A-Za-z0-9_-]{1,64}$/.test(params.invite)
      ? params.invite
      : undefined;
  if (session?.user) redirect(invite ? `/invite/${invite}` : "/");

  const checkEmail = params["check-email"] === "1";
  const authError = authErrorMessage(params.error);

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm font-medium"
          >
            ← Back home
          </Link>
          <h1 className="mt-8 text-2xl font-semibold tracking-tight">
            Sign in to Stacks
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Use a passwordless email link, or continue with a provider.
          </p>
        </div>

        <div className="border-border bg-card mt-8 rounded-xl border p-6 shadow-sm">
          <Suspense
            fallback={
              <div className="bg-muted h-32 animate-pulse rounded-md" />
            }
          >
            <LoginForm
              initialCheckEmail={checkEmail}
              invite={invite}
              authError={authError}
            />
          </Suspense>
        </div>

        <p className="text-muted-foreground mt-6 text-center text-xs">
          By continuing you agree to our terms and privacy policy.
        </p>
      </div>
    </main>
  );
}
