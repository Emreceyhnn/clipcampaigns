"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Loaded via next/dynamic from the detail view: recharts is ~130 kB and the
// chart sits below the fold, so it stays out of the initial bundle.
export default function DailyViewsChart({
  data,
}: {
  data: { date: string; views: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" fontSize={12} />
        <YAxis fontSize={12} />
        <Tooltip />
        <Area
          type="monotone"
          dataKey="views"
          stroke="var(--primary)"
          fill="var(--primary)"
          fillOpacity={0.2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
