import type { ChartSpec } from '@/types/dataset';

export function gwiDefaultChartSpecs(questionName: string): ChartSpec[] {
  return [
    {
      id: 'distribution',
      title: `${questionName} · Audience distribution`,
      x: 'timeBucket',
      y: 'audiencePct',
      legend: 'audience',
      yLabel: 'Audience %',
    },
    {
      id: 'composition',
      title: `${questionName} · Composition by audience`,
      x: 'audience',
      y: 'dataPointPct',
      legend: 'timeBucket',
      yLabel: 'Data point %',
    },
    {
      id: 'index_heatmap',
      title: `${questionName} · Index heatmap`,
      x: 'timeBucket',
      y: 'audience',
      z: 'index',
      zLabel: 'Index (base = 100)',
    },
  ];
}
