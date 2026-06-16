import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getWorkspaceBySlug } from "@/server/queries/workspaces";
import { getRoadmapGraph } from "@/server/queries/roadmap-graph";
import { RoadmapGraph } from "@/components/dashboards/roadmap-graph";

export default async function RoadmapGraphPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const [session, { workspaceSlug }] = await Promise.all([auth(), params]);
  if (!session?.user?.id) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspaceSlug, session.user.id);
  const graph = await getRoadmapGraph(workspace.id);

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Roadmap</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Initiative dependency graph — blockers flow left to right. Click a
          node to open the task.
        </p>
      </header>

      <div className="mt-6">
        {graph.nodes.length === 0 ? (
          <p className="text-muted-foreground mt-10 text-center text-sm">
            No initiatives yet — create a ROADMAP board to populate the graph.
          </p>
        ) : (
          <RoadmapGraph
            workspaceSlug={workspace.slug}
            nodes={graph.nodes}
            edges={graph.edges}
          />
        )}
      </div>
    </main>
  );
}
