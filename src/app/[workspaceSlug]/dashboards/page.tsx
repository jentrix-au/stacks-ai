import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { auth } from "@/auth";
import { getWorkspaceBySlug } from "@/server/queries/workspaces";
import {
  getBugsDashboard,
  getCrmDashboard,
  getRoadmapDashboard,
  getSupportDashboard,
} from "@/server/queries/dashboards";
import { BarChartCard } from "@/components/dashboards/bar-chart-card";

function money(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function hours(value: number | null): string {
  if (value === null) return "—";
  return value < 48
    ? `${value.toFixed(1)}h`
    : `${(value / 24).toFixed(1)}d`;
}

export default async function DashboardsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const [session, { workspaceSlug }] = await Promise.all([auth(), params]);
  if (!session?.user?.id) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspaceSlug, session.user.id);
  const [crm, support, bugs, roadmap] = await Promise.all([
    getCrmDashboard(workspace.id),
    getSupportDashboard(workspace.id),
    getBugsDashboard(workspace.id),
    getRoadmapDashboard(workspace.id),
  ]);

  const empty = !crm && !support && !bugs && !roadmap;

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboards</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Cross-board metrics for {workspace.name}. Archived work excluded.
        </p>
      </header>

      {empty && (
        <p className="text-muted-foreground mt-16 text-center text-sm">
          Nothing to chart yet — create CRM, Support, Bugs, or Roadmap boards
          with some tasks.
        </p>
      )}

      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {crm && (
          <Section title="Sales pipeline" data-kind="crm">
            <StatRow
              stats={[
                { label: "Open deals", value: String(crm.dealCount) },
                {
                  label: "Pipeline value",
                  value: money(crm.totalValue, crm.currency),
                },
                {
                  label: "Closing this quarter",
                  value: `${crm.closingThisQuarter.count} · ${money(crm.closingThisQuarter.value, crm.currency)}`,
                },
              ]}
            />
            <h3 className="text-muted-foreground mt-4 text-xs font-medium uppercase">
              Value by stage
            </h3>
            <BarChartCard
              data={crm.byStage.map((s) => ({ name: s.name, value: s.value }))}
              valueLabel="Value"
              formatValue="currency"
              color="#10b981"
            />
            {crm.byOwner.length > 0 && (
              <>
                <h3 className="text-muted-foreground mt-2 text-xs font-medium uppercase">
                  By owner
                </h3>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {crm.byOwner.slice(0, 5).map((o) => (
                    <li key={o.name} className="flex justify-between">
                      <span className="truncate">{o.name}</span>
                      <span className="text-muted-foreground">
                        {money(o.value, crm.currency)} · {o.count}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Section>
        )}

        {support && (
          <Section title="Support">
            <StatRow
              stats={[
                { label: "Open tickets", value: String(support.openCount) },
                {
                  label: "SLA breaches",
                  value: String(support.slaBreaches),
                  tone: support.slaBreaches > 0 ? "bad" : undefined,
                },
                {
                  label: "Avg first response",
                  value: hours(support.avgFirstResponseHours),
                },
              ]}
            />
            <h3 className="text-muted-foreground mt-4 text-xs font-medium uppercase">
              Open by severity
            </h3>
            <BarChartCard
              data={support.openBySeverity}
              valueLabel="Tickets"
              color="#0ea5e9"
            />
          </Section>
        )}

        {bugs && (
          <Section title="Bugs">
            <StatRow
              stats={[
                { label: "Open bugs", value: String(bugs.openCount) },
                {
                  label: "Avg time to resolve",
                  value: hours(bugs.avgResolutionHours),
                },
                { label: "Reopened", value: String(bugs.reopenedCount) },
              ]}
            />
            <h3 className="text-muted-foreground mt-4 text-xs font-medium uppercase">
              Open by severity
            </h3>
            <BarChartCard
              data={bugs.openBySeverity}
              valueLabel="Bugs"
              color="#ef4444"
            />
          </Section>
        )}

        {roadmap && (
          <Section
            title="Roadmap"
            action={
              <Link
                href={`/${workspace.slug}/roadmap`}
                className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
              >
                Dependency graph <ArrowRight className="size-3" />
              </Link>
            }
          >
            <StatRow
              stats={[
                { label: "Initiatives", value: String(roadmap.total) },
                {
                  label: "Blocked",
                  value: String(roadmap.blocked),
                  tone: roadmap.blocked > 0 ? "bad" : undefined,
                },
              ]}
            />
            <h3 className="text-muted-foreground mt-4 text-xs font-medium uppercase">
              By quarter
            </h3>
            <BarChartCard
              data={roadmap.byQuarter.map((q) => ({
                name: q.name,
                value: q.total,
              }))}
              valueLabel="Initiatives"
              color="#8b5cf6"
            />
          </Section>
        )}
      </div>
    </main>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border bg-card rounded-xl border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function StatRow({
  stats,
}: {
  stats: { label: string; value: string; tone?: "bad" }[];
}) {
  return (
    <dl className="grid grid-cols-3 gap-2">
      {stats.map((s) => (
        <div key={s.label} className="bg-muted/40 rounded-lg p-2.5">
          <dt className="text-muted-foreground text-[11px]">{s.label}</dt>
          <dd
            className={
              "mt-0.5 text-base font-semibold " +
              (s.tone === "bad" ? "text-red-600 dark:text-red-400" : "")
            }
          >
            {s.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
