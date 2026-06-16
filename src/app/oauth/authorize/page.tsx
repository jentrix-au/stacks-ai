import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { resolveClient } from "@/lib/oauth/cimd";
import { parseScopes } from "@/lib/oauth/service";
import { listMyWorkspaces } from "@/server/queries/workspaces";
import { ConsentForm } from "@/components/oauth/consent-form";

// OAuth 2.1 authorization endpoint (P2.7). Per spec, client/redirect_uri
// problems render an error page (no redirect to an unverified URI); only a
// fully-validated request reaches the consent form.

function ErrorCard({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6">
      <div className="rounded-lg border p-6">
        <h1 className="font-heading text-lg font-semibold">{title}</h1>
        <p className="text-muted-foreground mt-2 text-sm">{detail}</p>
      </div>
    </main>
  );
}

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const first = (key: string): string | null => {
    const v = params[key];
    return typeof v === "string" ? v : null;
  };

  const session = await auth();
  if (!session?.user?.id) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string") query.set(key, value);
    }
    redirect(
      `/login?callbackUrl=${encodeURIComponent(`/oauth/authorize?${query}`)}`,
    );
  }

  const clientId = first("client_id");
  const redirectUri = first("redirect_uri");
  const responseType = first("response_type");
  const codeChallenge = first("code_challenge");
  const codeChallengeMethod = first("code_challenge_method");

  if (!clientId || !redirectUri) {
    return (
      <ErrorCard
        title="Invalid authorization request"
        detail="client_id and redirect_uri are required."
      />
    );
  }
  if (responseType !== "code") {
    return (
      <ErrorCard
        title="Unsupported response_type"
        detail='Only response_type="code" is supported.'
      />
    );
  }
  if (!codeChallenge || codeChallengeMethod !== "S256") {
    return (
      <ErrorCard
        title="PKCE required"
        detail="This server requires PKCE with code_challenge_method=S256."
      />
    );
  }

  let client;
  try {
    client = await resolveClient(clientId);
  } catch (e) {
    return (
      <ErrorCard
        title="Unknown client"
        detail={e instanceof Error ? e.message : "Client resolution failed."}
      />
    );
  }
  if (!client.redirectUris.includes(redirectUri)) {
    return (
      <ErrorCard
        title="Unregistered redirect_uri"
        detail="The redirect_uri does not exactly match any URI registered in the client's metadata document."
      />
    );
  }

  let scopes;
  try {
    scopes = parseScopes(first("scope"));
  } catch {
    return (
      <ErrorCard
        title="Invalid scope"
        detail="Supported scopes: read, write, admin."
      />
    );
  }

  const workspaces = await listMyWorkspaces(session.user.id);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">
      <ConsentForm
        client={{
          clientId: client.clientId,
          name: client.name,
          logoUri: client.logoUri,
        }}
        redirectUri={redirectUri}
        requestedScopes={scopes}
        state={first("state")}
        codeChallenge={codeChallenge}
        workspaces={workspaces.map((w) => ({ id: w.id, name: w.name }))}
        userEmail={session.user.email ?? ""}
      />
    </main>
  );
}
