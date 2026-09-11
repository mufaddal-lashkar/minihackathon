"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import { SEVERITY_ORDER, type Severity } from "@/lib/rules/types";
import { SEVERITY_COLOR, CLASS_COLOR } from "./severity";

const INK = "#0f3d3e";
const MUTED = "#4b6b6a";
const GRID = "#e3efee";
const SEV_LABEL: Record<Severity, string> = { SELF_CARE: "Self care", CALL_CLINIC: "Call clinic", URGENT_CARE: "Urgent care", EMERGENCY: "Emergency" };

function Tip({ active, payload, label }: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-surface px-3 py-2 text-xs shadow-lg ring-1 ring-border">
      {label !== undefined && <div className="mb-1 font-semibold text-foreground">{label}</div>}
      {payload.map((p) => (
        <div key={String(p.name)} className="flex items-center gap-2 text-foreground">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color ?? (p.payload as { fill?: string })?.fill }} aria-hidden />
          <span className="text-muted-fg">{p.name}</span><span className="ml-auto font-semibold tabular-nums">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export type DayRow = { day: string } & Record<Severity, number>;

export function ReportsByDay({ data }: { data: DayRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="day" tick={{ fill: MUTED, fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fill: MUTED, fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip content={<Tip />} cursor={{ fill: "rgba(15,118,110,0.06)" }} />
        <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12, color: INK }} itemSorter={(item) => SEVERITY_ORDER.indexOf(item.dataKey as Severity)} />
        {SEVERITY_ORDER.map((s, i) => (
          <Bar key={s} dataKey={s} name={SEV_LABEL[s]} stackId="a" fill={SEVERITY_COLOR[s]} stroke="#fff" strokeWidth={2} radius={i === SEVERITY_ORDER.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={36} isAnimationActive={false} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SeverityDonut({ data }: { data: { severity: Severity; count: number }[] }) {
  const total = data.reduce((n, d) => n + d.count, 0);
  return (
    <div className="flex items-center gap-4">
      <div className="relative h-40 w-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="count" nameKey="severity" innerRadius={52} outerRadius={72} paddingAngle={2} stroke="#fff" strokeWidth={2} cornerRadius={4} isAnimationActive={false}>
              {data.map((d) => <Cell key={d.severity} fill={SEVERITY_COLOR[d.severity]} />)}
            </Pie>
            <Tooltip content={<Tip />} formatter={(v, n) => [v ?? 0, SEV_LABEL[String(n) as Severity] ?? String(n)]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="font-heading text-2xl font-bold tabular-nums">{total}</span><span className="text-[11px] text-muted-fg">reports</span></div>
      </div>
      <ul className="flex-1 space-y-1.5 text-sm">
        {data.map((d) => (
          <li key={d.severity} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SEVERITY_COLOR[d.severity] }} aria-hidden />
            <span className="text-muted-fg">{SEV_LABEL[d.severity]}</span>
            <span className="ml-auto font-semibold tabular-nums">{d.count}</span>
            <span className="w-10 text-right text-xs text-muted-fg tabular-nums">{total ? Math.round((d.count / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ClassBars({ data }: { data: { cls: number; label: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((n, d) => n + d.count, 0);
  return (
    <ul className="space-y-3" aria-label="Reports by rule class">
      {data.map((d) => (
        <li key={d.cls}>
          <div className="flex items-center justify-between text-sm"><span className="font-medium">{d.label}</span><span className="tabular-nums text-muted-fg"><b className="text-foreground">{d.count}</b> · {total ? Math.round((d.count / total) * 100) : 0}%</span></div>
          <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${(d.count / max) * 100}%`, background: CLASS_COLOR[d.cls] }} /></div>
        </li>
      ))}
    </ul>
  );
}

export type TimelinePoint = { at: string; label: string; rank: number; severity: Severity; text: string };

export function SeverityTimeline({ data, height = 200 }: { data: TimelinePoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 12, right: 12, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 3]} ticks={[0, 1, 2, 3]} tickFormatter={(v: number) => SEV_LABEL[SEVERITY_ORDER[v]]} width={84} tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip content={({ active, payload }) => {
          const p = payload?.[0]?.payload as TimelinePoint | undefined;
          if (!active || !p) return null;
          return <div className="max-w-xs rounded-lg bg-surface px-3 py-2 text-xs shadow-lg ring-1 ring-border"><div className="font-semibold">{SEV_LABEL[p.severity]}</div><div className="text-muted-fg">{p.at}</div><div className="mt-1 text-foreground">“{p.text}”</div></div>;
        }} />
        <Line type="stepAfter" dataKey="rank" stroke="#0f766e" strokeWidth={2} dot={(props: { cx?: number; cy?: number; payload?: TimelinePoint; index?: number }) => (
          <circle key={props.index} cx={props.cx} cy={props.cy} r={5} fill={SEVERITY_COLOR[props.payload!.severity]} stroke="#fff" strokeWidth={2} />
        )} activeDot={{ r: 7 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
