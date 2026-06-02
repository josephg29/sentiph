export type BarSegmentMode = "project" | "model";

export type Segment = { label: string; tokens: number; color: string };

export type BarData = {
  date: string;
  totalTokens: number;
  sessions: number;
  segments: Segment[];
};

export type HeatmapCell = {
  date: string;
  week: number;
  dayOfWeek: number;
  totalTokens: number;
  sessions: number;
  intensity: number;
  bar: BarData | null;
};
