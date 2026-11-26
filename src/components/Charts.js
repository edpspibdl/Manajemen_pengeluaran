import Chart from 'chart.js/auto';
import { formatCompactIDR, formatIDR } from '../utils/currency.js';

const chartRegistry = new Map();

function destroyExistingChart(canvasId) {
  const existing = chartRegistry.get(canvasId);
  if (existing) {
    existing.destroy();
    chartRegistry.delete(canvasId);
  }
}

/**
 * Custom Chart.js plugin rendering external percentage & label callouts matching Screen 3.
 */
const pieCalloutPlugin = {
  id: 'kosmatePieCallout',
  afterDatasetsDraw(chart) {
    if (chart.config.type !== 'pie') return;
    const { ctx } = chart;
    const meta = chart.getDatasetMeta(0);
    if (!meta || !meta.data) return;

    const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
    if (total <= 0) return;

    ctx.save();
    ctx.font = '600 11px sans-serif';
    ctx.textBaseline = 'middle';

    meta.data.forEach((arc, index) => {
      const value = chart.data.datasets[0].data[index];
      const pct = Math.round((value / total) * 100);
      if (pct < 4) return;

      const { startAngle, endAngle, outerRadius, x, y } = arc;
      const midAngle = (startAngle + endAngle) / 2;
      const cos = Math.cos(midAngle);
      const sin = Math.sin(midAngle);

      const lineStartX = x + cos * (outerRadius * 0.85);
      const lineStartY = y + sin * (outerRadius * 0.85);
      const lineEndX = x + cos * (outerRadius + 14);
      const lineEndY = y + sin * (outerRadius + 14);

      ctx.strokeStyle = '#64748B';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lineStartX, lineStartY);
      ctx.lineTo(lineEndX, lineEndY);
      ctx.stroke();

      const labelText = `${pct}% ${chart.data.labels[index]}`;
      ctx.fillStyle = '#073B2E';
      ctx.textAlign = cos >= 0 ? 'left' : 'right';
      const textX = lineEndX + (cos >= 0 ? 4 : -4);
      ctx.fillText(labelText, textX, lineEndY);
    });
    ctx.restore();
  }
};

/**
 * Mount Month-to-Month Capsule Bar Chart matching Reference Screen 2.
 */
export function mountMonthlySpendingBarChart(canvas, series) {
  if (!canvas) return;
  const id = canvas.id || 'monthly-bar';
  destroyExistingChart(id);

  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 170);
  gradient.addColorStop(0, '#D91B5C');
  gradient.addColorStop(0.7, '#EC6D98');
  gradient.addColorStop(1, '#FCE7EF');

  const chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: series.map((s) => s.label),
      datasets: [
        {
          label: 'Pengeluaran',
          data: series.map((s) => s.total),
          backgroundColor: gradient,
          borderRadius: { topLeft: 12, topRight: 12, bottomLeft: 0, bottomRight: 0 },
          borderSkipped: false,
          barThickness: 16
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctxItem) => formatIDR(ctxItem.raw)
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: '#D91B5C', width: 2 },
          ticks: {
            color: '#64748B',
            font: { size: 11, weight: '700' }
          }
        },
        y: {
          beginAtZero: true,
          border: { display: false },
          grid: {
            color: 'rgba(100, 116, 139, 0.14)',
            tickLength: 0
          },
          ticks: {
            maxTicksLimit: 3,
            color: '#94A3B8',
            font: { size: 10, weight: '600' },
            callback: (val) => (val === 0 ? '0' : formatCompactIDR(val))
          }
        }
      }
    }
  });

  chartRegistry.set(id, chart);
}

/**
 * Mount Category Spending Pie Chart matching Reference Screen 3.
 */
export function mountCategoryPieChart(canvas, items) {
  if (!canvas) return;
  const id = canvas.id || 'category-pie';
  destroyExistingChart(id);

  const palette = ['#F59E0B', '#10B981', '#1D4ED8', '#E11D48', '#0EA5E9', '#5B21B6', '#64748B'];
  const chart = new Chart(canvas.getContext('2d'), {
    type: 'pie',
    data: {
      labels: items.map((i) => i.name.split(' ')[0]),
      datasets: [
        {
          data: items.map((i) => i.total),
          backgroundColor: items.map((i, idx) => i.color || palette[idx % palette.length]),
          borderColor: '#FFFFFF',
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 24, bottom: 24, left: 32, right: 32 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctxItem) => {
              const item = items[ctxItem.dataIndex];
              return `${item.name}: ${formatIDR(item.total)} (${item.percentage}%)`;
            }
          }
        }
      }
    },
    plugins: [pieCalloutPlugin]
  });

  chartRegistry.set(id, chart);
}
