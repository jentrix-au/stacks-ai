"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import dagre from "dagre";
import {
  Background,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type {
  RoadmapGraphEdge,
  RoadmapGraphNode,
} from "@/server/queries/roadmap-graph";

const NODE_WIDTH = 240;
const NODE_HEIGHT = 72;

/** dagre left-to-right layout: blockers on the left, blocked work right. */
function layout(
  nodes: RoadmapGraphNode[],
  edges: RoadmapGraphEdge[],
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 32, ranksep: 96 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes)
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const e of edges) g.setEdge(e.fromTaskId, e.toTaskId);
  dagre.layout(g);
  const out = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    const pos = g.node(n.id);
    out.set(n.id, {
      x: pos.x - NODE_WIDTH / 2,
      y: pos.y - NODE_HEIGHT / 2,
    });
  }
  return out;
}

export function RoadmapGraph({
  workspaceSlug,
  nodes,
  edges,
}: {
  workspaceSlug: string;
  nodes: RoadmapGraphNode[];
  edges: RoadmapGraphEdge[];
}) {
  const router = useRouter();

  const flow = useMemo(() => {
    const positions = layout(nodes, edges);
    const flowNodes: Node[] = nodes.map((n) => ({
      id: n.id,
      position: positions.get(n.id) ?? { x: 0, y: 0 },
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      data: {
        label: (
          <div className="flex h-full flex-col justify-center gap-0.5 text-left">
            <div className="text-muted-foreground flex items-center gap-1.5 font-mono text-[10px]">
              {n.taskKey}
              {n.quarter && <span>· {n.quarter}</span>}
              {n.boardKind !== "ROADMAP" && (
                <span className="uppercase">· {n.boardKind.toLowerCase()}</span>
              )}
              {n.blocked && (
                <span className="font-sans font-medium text-red-600 dark:text-red-400">
                  Blocked
                </span>
              )}
            </div>
            <div className="truncate text-xs font-medium">{n.title}</div>
          </div>
        ),
      },
      style: {
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        borderRadius: 10,
        padding: 10,
        border: n.blocked
          ? "1.5px solid var(--color-red-500, #ef4444)"
          : "1px solid var(--border, #e5e7eb)",
        background: "var(--card, #fff)",
        color: "inherit",
      },
    }));
    const flowEdges: Edge[] = edges.map((e) => ({
      id: `${e.fromTaskId}->${e.toTaskId}:${e.kind}`,
      source: e.fromTaskId,
      target: e.toTaskId,
      animated: e.kind === "BLOCKS",
      label: e.kind === "BLOCKS" ? "blocks" : "depends on",
      labelStyle: { fontSize: 10 },
      style:
        e.kind === "BLOCKS"
          ? { stroke: "var(--color-red-500, #ef4444)" }
          : undefined,
    }));
    return { flowNodes, flowEdges };
  }, [nodes, edges]);

  return (
    <div className="h-[70vh] w-full rounded-xl border" data-testid="roadmap-graph">
      <ReactFlow
        nodes={flow.flowNodes}
        edges={flow.flowEdges}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => {
          const n = nodes.find((x) => x.id === node.id);
          if (n)
            router.push(
              `/${workspaceSlug}/board/${n.boardSlug}?task=${n.id}`,
            );
        }}
      >
        <Background gap={24} />
      </ReactFlow>
    </div>
  );
}
