"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * One generic bar chart used by every dashboard section. Data arrives as
 * plain serializable props from Server Components.
 */
export function BarChartCard({
  data,
  color = "var(--color-primary, #6366f1)",
  valueLabel,
  formatValue,
}: {
  data: { name: string; value: number }[];
  color?: string;
  valueLabel: string;
  formatValue?: "currency";
}) {
  const fmt = (v: number) =>
    formatValue === "currency"
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        }).format(v)
      : String(v);

  return (
    <div className="h-56 w-full" data-testid="bar-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} />
          <YAxis
            tick={{ fontSize: 11 }}
            tickLine={false}
            width={formatValue === "currency" ? 64 : 32}
            tickFormatter={(v: number) => fmt(v)}
          />
          <Tooltip
            cursor={{ fill: "transparent" }}
            formatter={(value) => [fmt(Number(value)), valueLabel]}
          />
          <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
