"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Loader2, Wrench } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  signInWithEmail,
  signInWithProvider,
  type SignInState,
} from "@/server/auth/actions";

const IS_DEV = process.env.NODE_ENV !== "production";

export function LoginForm({
  initialCheckEmail,
  invite,
  authError,
}: {
  initialCheckEmail: boolean;
  invite?: string;
  authError?: string;
}) {
  const initialState: SignInState = initialCheckEmail
    ? { status: "sent" }
    : { status: "idle" };
  const [state, formAction, pending] = useActionState<SignInState, FormData>(
    signInWithEmail,
    initialState,
  );

  if (state.status === "sent") {
    return (
      <div className="flex flex-col items-center text-center">
        <div className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
          <Mail className="size-5" />
        </div>
        <h2 className="mt-4 text-base font-semibold">Check your email</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          We sent you a sign-in link. It expires in 24 hours.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {authError && (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-xs"
        >
          {authError}
        </p>
      )}

      <div className="grid gap-2">
        <GoogleButton invite={invite} />
      </div>

      <div className="text-muted-foreground flex items-center gap-3 text-xs">
        <Separator className="flex-1" />
        or with email
        <Separator className="flex-1" />
      </div>

      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="invite" value={invite ?? ""} />
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            placeholder="you@company.com"
          />
        </div>
        {state.status === "error" && (
          <p className="text-destructive text-xs">{state.message}</p>
        )}
        <Button
          type="submit"
          loading={pending}
          loadingText="Sending…"
          className="w-full"
        >
          Send sign-in link
        </Button>
      </form>

      {IS_DEV && <DevSignInButton invite={invite} />}
    </div>
  );
}

function DevSignInButton({ invite }: { invite?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function go() {
    setPending(true);
    try {
      const res = await fetch("/api/dev/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        toast.error(error ?? "Dev sign-in failed");
        return;
      }
      router.refresh();
      router.push(invite ? `/invite/${invite}` : "/");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="border-border bg-muted/30 -mx-1 mt-4 rounded-md border border-dashed p-3 text-xs">
      <div className="text-muted-foreground mb-2 flex items-center gap-1.5 font-medium">
        <Wrench className="size-3" />
        Dev only
      </div>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={go}
        loading={pending}
        loadingText="Signing in…"
      >
        Continue as demo@stacks.local
      </Button>
    </div>
  );
}

function GoogleButton({ invite }: { invite?: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await signInWithProvider("google", invite);
        });
      }}
      className={buttonVariants({ variant: "outline" }) + " w-full"}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <GoogleIcon />}
      Continue with Google
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}
