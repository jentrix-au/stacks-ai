import { requireUser } from "@/lib/session";
import { listApiTokens } from "@/server/actions/api-tokens";
import { listMyWorkspaces } from "@/server/queries/workspaces";
import { TokensClient } from "./_components/tokens-client";

export default async function TokensPage() {
  const user = await requireUser();
  const [tokens, workspaces] = await Promise.all([
    listApiTokens(),
    listMyWorkspaces(user.id),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">API tokens</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Personal access tokens for the Task Manager MCP server. Add a token to
          your Claude Desktop or Claude Code config as a bearer to let an agent
          manage your tasks. Scope tokens to the least access the agent needs.
        </p>
      </div>
      <TokensClient
        tokens={tokens}
        workspaces={workspaces.map((w) => ({ id: w.id, name: w.name }))}
      />
    </div>
  );
}
