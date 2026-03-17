'use client';

import { AlertTriangle } from 'lucide-react';
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, Legend } from 'recharts';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from '@/components/ui/chart';

// Mock data: average suspicious event count per behavior category
// Comparing high-risk vs low-risk student cohorts during the exam
const chartData = [
  { behavior: 'Head Turn',     highRisk: 18, lowRisk:  3 },
  { behavior: 'Gaze Deviation',highRisk: 22, lowRisk:  5 },
  { behavior: 'Face Lost',     highRisk: 12, lowRisk:  1 },
  { behavior: 'Lip Movement',  highRisk: 16, lowRisk:  4 },
  { behavior: 'Phone Detected',highRisk:  9, lowRisk:  0 },
  { behavior: 'Posture Change', highRisk: 14, lowRisk:  6 },
];

const chartConfig = {
  highRisk: {
    label: 'High-Risk Students',
    color: 'var(--chart-5)',
  },
  lowRisk: {
    label: 'Low-Risk Students',
    color: 'var(--chart-2)',
  },
} satisfies ChartConfig;

export function SuspicionRadarChart() {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="items-center pb-2">
        <CardTitle>Behavior Risk Profile</CardTitle>
        <CardDescription>
          AI anomaly scores by category — Exam Session #4
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-0">
        <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[300px]">
          <RadarChart data={chartData} outerRadius="62%">
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <PolarAngleAxis
              dataKey="behavior"
              tick={{ fontSize: 11 }}
              tickLine={false}
            />
            <PolarGrid />
            <Radar
              dataKey="highRisk"
              fill="var(--color-highRisk)"
              fillOpacity={0.35}
              stroke="var(--color-highRisk)"
              strokeWidth={2}
              dot={{ r: 4, fillOpacity: 1 }}
            />
            <Radar
              dataKey="lowRisk"
              fill="var(--color-lowRisk)"
              fillOpacity={0.25}
              stroke="var(--color-lowRisk)"
              strokeWidth={2}
              dot={{ r: 4, fillOpacity: 1 }}
            />
            <Legend
              formatter={(value) => chartConfig[value as keyof typeof chartConfig]?.label ?? value}
              iconSize={8}
              wrapperStyle={{ fontSize: 11 }}
            />
          </RadarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col gap-1 text-sm pt-2">
        <div className="flex items-center gap-2 font-medium leading-none">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          7 students flagged as high-risk this session
        </div>
        <div className="text-xs text-muted-foreground">
          Based on real-time camera analysis · Session #4 · CENG 101
        </div>
      </CardFooter>
    </Card>
  );
}
