'use client';

import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

export default function ChartWrapper({
  type,
  data,
  options = {},
  height = 300,
  className = ''
}) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // Destroy existing chart if it exists
    if (chartRef.current) {
      chartRef.current.destroy();
    }

    // Create new chart
    const ctx = canvasRef.current.getContext('2d');

    // Default chart configuration
    const defaultOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            font: { family: 'Inter, sans-serif', size: 12, weight: 500 },
            color: '#64748b',
            padding: 16,
            usePointStyle: true,
          },
        },
      },
      scales: {
        x: {
          grid: {
            display: false,
          },
          ticks: {
            font: { family: 'Inter, sans-serif', size: 12 },
            color: '#94a3b8',
          },
        },
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(203, 213, 225, 0.3)',
            drawBorder: false,
          },
          ticks: {
            font: { family: 'Inter, sans-serif', size: 12 },
            color: '#94a3b8',
          },
        },
      },
    };

    // Merge options
    const mergedOptions = {
      ...defaultOptions,
      ...options,
      plugins: {
        ...defaultOptions.plugins,
        ...(options.plugins || {}),
      },
    };

    // Create chart
    chartRef.current = new Chart(ctx, {
      type,
      data: {
        ...data,
        datasets: data.datasets?.map((dataset) => ({
          ...dataset,
          borderColor: dataset.borderColor || '#2563eb',
          backgroundColor: dataset.backgroundColor || 'rgba(37, 99, 235, 0.1)',
          borderWidth: dataset.borderWidth || 2,
          tension: 0.4,
          fill: dataset.fill !== false,
        })) || [],
      },
      options: mergedOptions,
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
      }
    };
  }, [type, data, options]);

  return (
    <div className={`bg-white rounded-xl border border-slate-200 p-6 ${className}`}>
      <div style={{ height: `${height}px`, position: 'relative' }}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
