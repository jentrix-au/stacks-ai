/**
 * Attribution chip for agent actions (P2.8 badge, upgraded by P4.1 to show
 * the token's teammate identity). Plain markup — usable from server and
 * client components alike.
 */
export function AgentBadge({
  name,
  emoji,
}: {
  name: string;
  emoji: string | null;
}) {
  return (
    <span
      className="text-muted-foreground bg-muted rounded px-1 py-px text-[10px]"
      title={`Performed by the agent "${name}" through the MCP API`}
    >
      via {emoji ?? "🤖"} {name}
    </span>
  );
}
