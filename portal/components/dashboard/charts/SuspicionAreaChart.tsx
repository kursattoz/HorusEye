'use client';

import * as React from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  ChartContainer, ChartLegend, ChartLegendContent,
  ChartTooltip, ChartTooltipContent, type ChartConfig,
} from '@/components/ui/chart';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

// Mock data: suspicious events captured per minute during a 90-min exam session
// headTurn = head turning sideways events, gazeDev = gaze deviation alerts, noFace = camera lost face
const rawData = [
  { min:  0, headTurn:  1, gazeDev:  0, noFace: 0 },
  { min:  5, headTurn:  3, gazeDev:  2, noFace: 1 },
  { min: 10, headTurn:  2, gazeDev:  4, noFace: 0 },
  { min: 15, headTurn:  7, gazeDev:  5, noFace: 2 },
  { min: 20, headTurn:  5, gazeDev:  8, noFace: 1 },
  { min: 25, headTurn:  4, gazeDev:  6, noFace: 3 },
  { min: 30, headTurn: 12, gazeDev: 10, noFace: 4 }, // mid-exam spike
  { min: 35, headTurn:  9, gazeDev:  7, noFace: 2 },
  { min: 40, headTurn:  6, gazeDev:  9, noFace: 3 },
  { min: 45, headTurn: 15, gazeDev: 13, noFace: 6 }, // peak
  { min: 50, headTurn: 11, gazeDev: 12, noFace: 5 },
  { min: 55, headTurn:  8, gazeDev: 10, noFace: 3 },
  { min: 60, headTurn: 18, gazeDev: 14, noFace: 7 }, // second spike
  { min: 65, headTurn: 14, gazeDev: 11, noFace: 4 },
  { min: 70, headTurn:  9, gazeDev:  8, noFace: 3 },
  { min: 75, headTurn:  6, gazeDev:  6, noFace: 2 },
  { min: 80, headTurn:  4, gazeDev:  5, noFace: 1 },
  { min: 85, headTurn:  3, gazeDev:  3, noFace: 1 },
  { min: 90, headTurn:  2, gazeDev:  2, noFace: 0 },
];

const chartConfig = {
  headTurn: {
    label: 'Head Turning',
    color: 'var(--chart-1)',
  },
  gazeDev: {
    label: 'Gaze Deviation',
    color: 'var(--chart-2)',
  },
  noFace: {
    label: 'Face Lost',
    color: 'var(--chart-5)',
  },
} satisfies ChartConfig;

export function SuspicionAreaChart() {
  const [range, setRange] = React.useState<'full' | 'first' | 'second'>('full');

  const data = React.useMemo(() => {
    if (range === 'first')  return rawData.filter(d => d.min <= 45);
    if (range === 'second') return rawData.filter(d => d.min >= 45);
    return rawData;
  }, [range]);

  return (
    <Card className="pt-0 flex flex-col h-full">
      <CardHeader className="flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row shrink-0">
        <div className="grid flex-1 gap-1">
          <CardTitle>Suspicious Activity Over Time</CardTitle>
          <CardDescription>
            AI-detected anomalies per 5-minute interval — Exam Session #4
          </CardDescription>
        </div>
        <Select value={range} onValueChange={v => setRange(v as typeof range)}>
          <SelectTrigger className="hidden w-max min-w-[190px] rounded-lg sm:ml-auto sm:flex" aria-label="Select range">
            <SelectValue placeholder="Full session (90 min)" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="full"   className="rounded-lg">Full session (90 min)</SelectItem>
            <SelectItem value="first"  className="rounded-lg">First half (0–45 min)</SelectItem>
            <SelectItem value="second" className="rounded-lg">Second half (45–90 min)</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6 flex-1 flex flex-col">
        <ChartContainer config={chartConfig} className="flex-1 w-full min-h-[200px]">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="fillHeadTurn" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="var(--color-headTurn)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--color-headTurn)" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="fillGazeDev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="var(--color-gazeDev)" stopOpacity={0.7} />
                <stop offset="95%" stopColor="var(--color-gazeDev)" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="fillNoFace" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="var(--color-noFace)" stopOpacity={0.6} />
                <stop offset="95%" stopColor="var(--color-noFace)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="min"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={v => `${v}m`}
            />
            <YAxis hide />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={v => `Minute ${v}`}
                  indicator="dot"
                />
              }
            />
            <Area dataKey="noFace"    type="monotone" fill="url(#fillNoFace)"    stroke="var(--color-noFace)"    stackId="a" />
            <Area dataKey="gazeDev"   type="monotone" fill="url(#fillGazeDev)"   stroke="var(--color-gazeDev)"   stackId="a" />
            <Area dataKey="headTurn"  type="monotone" fill="url(#fillHeadTurn)"  stroke="var(--color-headTurn)"  stackId="a" />
            <ChartLegend content={<ChartLegendContent />} />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
