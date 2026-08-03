"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatGHSWithUnit, formatGHSCompact, toChartNumber } from "@/lib/money";
import { parseISODate, quarterLabel } from "@/lib/quarters";

interface Point {
  quarterDate: string;
  valueGHS: string;
}

export function SingleHoldingChart({
  series,
  colorToken,
}: {
  series: Point[];
  colorToken: string;
}) {
  const chartData = series.map((p) => ({
    quarterDate: p.quarterDate,
    label: quarterLabel(parseISODate(p.quarterDate)),
    value: toChartNumber(p.valueGHS),
    rawGHS: p.valueGHS,
  }));

  // Resolve CSS variable to actual color if passed as --color-*, or fallback to ink
  const lineColor = "var(" + colorToken + ", var(--color-ink))";

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 12, right: 12, left: 12, bottom: 12 }}>
          <XAxis
            dataKey="label"
            stroke="var(--color-rule)"
            tickLine={false}
            className="chart-tick"
          />
          <YAxis
            stroke="var(--color-rule)"
            tickLine={false}
            tickFormatter={(val) => formatGHSCompact(val)}
            className="chart-tick"
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload || !payload.length) return null;
              const data = payload[0].payload;
              return (
                <div className="border border-rule bg-paper-raised p-3 shadow-none">
                  <p className="type-body-sm font-medium text-ink m-0">{data.label}</p>
                  <p className="type-data text-ink m-0 mt-1 font-mono">
                    {formatGHSWithUnit(data.rawGHS)}
                  </p>
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={lineColor}
            strokeWidth={2}
            dot={{ r: 4, fill: lineColor }}
            activeDot={{ r: 6, fill: lineColor }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
