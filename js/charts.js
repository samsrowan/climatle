// charts.js — Chart.js wrapper functions for each chart type

const SECTOR_COLORS = {
  'AFOLU': '#4CAF50',
  'Buildings': '#FF9800',
  'Energy systems': '#F44336',
  'Industry': '#9C27B0',
  'Transport': '#2196F3',
};

const SECTOR_LABELS = {
  'AFOLU': 'Agriculture & Land Use',
  'Buildings': 'Buildings',
  'Energy systems': 'Energy Systems',
  'Industry': 'Industry',
  'Transport': 'Transport',
};

const ENERGY_COLORS = {
  // Fossil: brown/amber tones
  'Coal': '#8B4513',
  'Gas': '#D2691E',
  'Other Fossil': '#A0522D',
  // Clean: shades of green
  'Solar': '#81C784',
  'Wind': '#4CAF50',
  'Hydro': '#2E7D32',
  'Nuclear': '#A5D6A7',
  'Bioenergy': '#388E3C',
  'Other Renewables': '#C8E6C9',
};

// Order for energy sources: fossil at top, clean at bottom
const ENERGY_ORDER = [
  'Coal', 'Gas', 'Other Fossil',
  'Nuclear', 'Hydro', 'Wind', 'Solar', 'Bioenergy', 'Other Renewables'
];

const ENERGY_TYPE_COLORS = {
  'Fossil': '#A0522D',
  'Clean': '#4CAF50',
};

// Data years (from R pipeline)
const GHG_YEAR = 2021;
const ENERGY_YEAR = 2024;

let ghgChart = null;
let energyChart = null;
let trajectoryChart = null;

const CHART_DEFAULTS = {
  animation: { duration: 600 },
  responsive: true,
  maintainAspectRatio: false,
};

export function renderGhgChart(data, revealed) {
  const ctx = document.getElementById('chart-ghg');
  if (ghgChart) ghgChart.destroy();

  // Filter out zero-share subsectors, then sort by sector and label
  const subsectors = data.subsectors
    .filter(s => s.share > 0.001)
    .sort((a, b) => {
      if (a.sector < b.sector) return -1;
      if (a.sector > b.sector) return 1;
      return a.label < b.label ? -1 : 1;
    });

  const labels = subsectors.map(s => s.label);
  const values = subsectors.map(s => s.share * 100);
  const colors = subsectors.map(s => SECTOR_COLORS[s.sector] || '#666');

  const titleLine1 = revealed
    ? `${revealed}: GHG emissions by subsector`
    : 'Country X: GHG emissions by subsector';
  const titleLine2 = `(${GHG_YEAR}, share of national total)`;

  // Build legend items from unique sectors present
  const sectorsPresent = [...new Set(subsectors.map(s => s.sector))].sort();
  const legendItems = sectorsPresent.map(s => ({
    text: SECTOR_LABELS[s] || s,
    fillStyle: SECTOR_COLORS[s] || '#666',
    fontColor: '#ccc',
    strokeStyle: 'transparent',
    lineWidth: 0,
  }));

  ghgChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderWidth: 0,
        barPercentage: 0.8,
      }]
    },
    options: {
      ...CHART_DEFAULTS,
      indexAxis: 'y',
      layout: {
        padding: { left: 10 }
      },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            color: '#ccc',
            font: { family: "'DM Sans'", size: 11 },
            generateLabels: () => legendItems,
            boxWidth: 12,
            padding: 12,
          }
        },
        title: {
          display: true,
          text: [titleLine1, titleLine2],
          color: '#e0e0e0',
          font: { family: "'DM Sans'", size: 14, weight: 500 },
          padding: { bottom: 8 },
        },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.parsed.x.toFixed(1)}%`
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: '#888',
            callback: v => v + '%',
            font: { family: "'JetBrains Mono'", size: 11 }
          },
          grid: { color: '#1e1e1e' }
        },
        y: {
          ticks: {
            color: '#ccc',
            font: { family: "'DM Sans'", size: 11 },
            autoSkip: false,
          },
          grid: { display: false },
          afterFit(scale) {
            scale.width = Math.max(scale.width, 160);
          }
        }
      }
    }
  });
}

export function renderEnergyChart(data, revealed) {
  const ctx = document.getElementById('chart-energy');
  if (energyChart) energyChart.destroy();

  const sourceMap = {};
  for (const s of data.sources) {
    sourceMap[s.source] = s;
  }

  const ordered = ENERGY_ORDER.filter(name => sourceMap[name]);
  const labels = ordered;
  const values = ordered.map(name => (sourceMap[name].share) * 100);
  const colors = ordered.map(name => ENERGY_COLORS[name] || '#666');

  const titleLine1 = revealed
    ? `${revealed}: Electricity generation by source`
    : 'Country X: Electricity generation by source';
  const titleLine2 = `(${ENERGY_YEAR}, share of total generation)`;

  // Legend: Fossil vs Clean
  const typeLegend = [
    { text: 'Fossil', fillStyle: '#A0522D', fontColor: '#ccc', strokeStyle: 'transparent', lineWidth: 0 },
    { text: 'Clean', fillStyle: '#4CAF50', fontColor: '#ccc', strokeStyle: 'transparent', lineWidth: 0 },
  ];

  energyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderWidth: 0,
        barPercentage: 0.8,
      }]
    },
    options: {
      ...CHART_DEFAULTS,
      indexAxis: 'y',
      layout: {
        padding: { left: 10 }
      },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            color: '#ccc',
            font: { family: "'DM Sans'", size: 11 },
            generateLabels: () => typeLegend,
            boxWidth: 12,
            padding: 12,
          }
        },
        title: {
          display: true,
          text: [titleLine1, titleLine2],
          color: '#e0e0e0',
          font: { family: "'DM Sans'", size: 14, weight: 500 },
          padding: { bottom: 8 },
        },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.parsed.x.toFixed(1)}%`
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: '#888',
            callback: v => v + '%',
            font: { family: "'JetBrains Mono'", size: 11 }
          },
          grid: { color: '#1e1e1e' }
        },
        y: {
          ticks: {
            color: '#ccc',
            font: { family: "'DM Sans'", size: 11 },
            autoSkip: false,
          },
          grid: { display: false },
          afterFit(scale) {
            scale.width = Math.max(scale.width, 140);
          }
        }
      }
    }
  });
}

export function renderTrajectoryChart(data, revealed) {
  const ctx = document.getElementById('chart-trajectory');
  if (trajectoryChart) trajectoryChart.destroy();

  // Normalize: index = 100 at 1990 (or first year)
  const baseIdx = 0;
  const baseVal = data.emissions[baseIdx] || 1;
  const indexed = data.emissions.map(v => (v / baseVal) * 100);

  const titleLine1 = revealed
    ? `${revealed}: GHG emissions trajectory & NDC targets`
    : 'Country X: GHG emissions trajectory & NDC targets';

  const datasets = [{
    label: 'GHG Index',
    data: data.years.map((y, i) => ({ x: y, y: indexed[i] })),
    borderColor: '#e0e0e0',
    backgroundColor: 'rgba(224,224,224,0.1)',
    fill: true,
    tension: 0.2,
    pointRadius: 0,
    pointHitRadius: 6,
    borderWidth: 2,
  }];

  // NDC target points at 2030. Dashed segment departs from 2021 — the COP26
  // baseline these NDCs were set against — so it overlaps the 2022+ observed
  // line a bit and shows the implied trajectory relative to the pledge.
  const NDC_BASE_YEAR = 2021;
  const ndcBaseIdx = data.years.indexOf(NDC_BASE_YEAR);
  const ndcStartYear  = ndcBaseIdx >= 0 ? NDC_BASE_YEAR              : data.years[data.years.length - 1];
  const ndcStartIndex = ndcBaseIdx >= 0 ? indexed[ndcBaseIdx]        : indexed[indexed.length - 1];

  if (data.ndc2_uncond != null) {
    const ndcUncondIdx = (data.ndc2_uncond / baseVal) * 100;
    datasets.push({
      label: 'NDC target (unconditional)',
      data: [{ x: ndcStartYear, y: ndcStartIndex }, { x: 2030, y: ndcUncondIdx }],
      borderColor: '#FF9800',
      borderDash: [6, 4],
      borderWidth: 2,
      pointRadius: [0, 6],
      pointStyle: ['circle', 'triangle'],
      pointBackgroundColor: '#FF9800',
      fill: false,
    });
  }

  if (data.ndc2_cond != null) {
    const ndcCondIdx = (data.ndc2_cond / baseVal) * 100;
    datasets.push({
      label: 'NDC target (conditional)',
      data: [{ x: ndcStartYear, y: ndcStartIndex }, { x: 2030, y: ndcCondIdx }],
      borderColor: '#00BCD4',
      borderDash: [6, 4],
      borderWidth: 2,
      pointRadius: [0, 6],
      pointStyle: ['circle', 'diamond'],
      pointBackgroundColor: '#00BCD4',
      fill: false,
    });
  }

  trajectoryChart = new Chart(ctx, {
    type: 'line',
    data: { datasets },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        legend: {
          display: true,
          labels: { color: '#888', font: { family: "'DM Sans'", size: 11 } }
        },
        title: {
          display: true,
          text: titleLine1,
          color: '#e0e0e0',
          font: { family: "'DM Sans'", size: 14, weight: 500 }
        },
        subtitle: {
          display: true,
          text: 'NDC = Nationally Determined Contribution (country climate mitigation target under the Paris Agreement)',
          color: '#666',
          font: { family: "'DM Sans'", size: 10, style: 'italic' },
          padding: { bottom: 8 },
        },
        tooltip: {
          callbacks: {
            label: ctx => `Index: ${ctx.parsed.y.toFixed(1)}`
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          min: 1990,
          max: 2030,
          ticks: {
            color: '#888',
            stepSize: 5,
            callback: v => v,
            font: { family: "'JetBrains Mono'", size: 11 }
          },
          grid: { color: '#1e1e1e' }
        },
        y: {
          title: {
            display: true,
            text: 'Index (1990 = 100)',
            color: '#888',
            font: { family: "'DM Sans'", size: 12 }
          },
          ticks: {
            color: '#888',
            font: { family: "'JetBrains Mono'", size: 11 }
          },
          grid: { color: '#1e1e1e' }
        }
      }
    }
  });
}

export function updateChartTitles(countryName) {
  if (ghgChart) {
    ghgChart.options.plugins.title.text = [`${countryName}: GHG emissions by subsector`, `(${GHG_YEAR}, share of national total)`];
    ghgChart.update();
  }
  if (energyChart) {
    energyChart.options.plugins.title.text = [`${countryName}: Electricity generation by source`, `(${ENERGY_YEAR}, share of total generation)`];
    energyChart.update();
  }
  if (trajectoryChart) {
    trajectoryChart.options.plugins.title.text = `${countryName}: GHG emissions trajectory & NDC targets`;
    trajectoryChart.update();
  }
}
