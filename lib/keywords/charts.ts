import type { ChartSpec } from '@/types/dataset';

export function keywordDefaultChartSpecs(): ChartSpec[] {
  return [
    {
      id: 'top_primary',
      title: 'Top Primary Keywords',
      x: 'keyword',
      y: 'avgMonthlySearches',
      legend: 'tier',
      filter: { tier: 'Primary' },
      yLabel: 'Avg. monthly searches',
    },
    {
      id: 'tier_share',
      title: 'Tier Share of Volume',
      x: 'tier',
      y: 'volumeSum',
      yLabel: 'Total searches',
    },
    {
      id: 'category_volume',
      title: 'Category Volume Performance',
      x: 'categories',
      y: 'volumeSum',
      yLabel: 'Total searches',
    },
  ];
}
