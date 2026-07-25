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

// Overrides for individual subsector labels where str_to_title in R produces
// the wrong casing (e.g. "Non-Co2" should be "Non-CO2").
const SUBSECTOR_LABEL_OVERRIDES = {
  'Non-Co2': 'Non-CO2',
};

// Within the Energy Systems sector, override the alphabetical-by-label sort
// with this domain-meaningful order. Subsectors not listed fall to the end.
const ENERGY_SECTOR_SUBSECTOR_ORDER = [
  'Electricity And Heat',
  'Coal Mining Fugitive',
  'Oil And Gas Fugitive',
  'Petroleum Refining',
  'Other',
];

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

// Display labels (the data key is what the R pipeline produces; we map it to a
// nicer label here so we don't need to re-export JSON on UI label changes).
const ENERGY_SOURCE_LABEL = {
  'Other Fossil':     'Oil and other fossil',
  'Other Renewables': 'Other renewables',
};

// Data years (from R pipeline)
const GHG_YEAR = 2021;
const ENERGY_YEAR = 2024;

// Chart instances keyed by canvas id, so the same render functions can draw
// into the daily-game canvases and a country-profile view's own canvases
// without clobbering each other.
const chartInstances = new Map();

function renderChart(canvasId, config) {
  const ctx = document.getElementById(canvasId);
  chartInstances.get(canvasId)?.destroy();
  const chart = new Chart(ctx, config);
  chartInstances.set(canvasId, chart);
  return chart;
}

const CHART_DEFAULTS = {
  animation: { duration: 600 },
  responsive: true,
  maintainAspectRatio: false,
};

export function renderGhgChart(data, revealed, canvasId = 'chart-ghg') {
  // Show ALL subsectors (including zero-share) so the bar count is constant
  // across countries — an empty bar for "Coal mining fugitive" or "Domestic
  // aviation" is itself a clue. Sorted by sector, then by label (with the
  // Energy Systems sector using a domain-specific order).
  const energyOrderRank = (label) => {
    const i = ENERGY_SECTOR_SUBSECTOR_ORDER.indexOf(label);
    return i === -1 ? Number.POSITIVE_INFINITY : i;
  };
  const subsectors = [...data.subsectors]
    .sort((a, b) => {
      if (a.sector !== b.sector) return a.sector < b.sector ? -1 : 1;
      if (a.sector === 'Energy systems') {
        return energyOrderRank(a.label) - energyOrderRank(b.label);
      }
      return a.label < b.label ? -1 : 1;
    });

  const labels = subsectors.map(s => SUBSECTOR_LABEL_OVERRIDES[s.label] || s.label);
  const values = subsectors.map(s => s.share * 100);
  const colors = subsectors.map(s => SECTOR_COLORS[s.sector] || '#666');

  const titleLine1 = revealed
    ? `${revealed}: sectoral GHG emissions`
    : 'Country X: sectoral GHG emissions';
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

  renderChart(canvasId, {
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

export function renderEnergyChart(data, revealed, canvasId = 'chart-energy') {
  const sourceMap = {};
  for (const s of data.sources) {
    sourceMap[s.source] = s;
  }

  const ordered = ENERGY_ORDER.filter(name => sourceMap[name]);
  const labels = ordered.map(name => ENERGY_SOURCE_LABEL[name] || name);
  const values = ordered.map(name => (sourceMap[name].share) * 100);
  const colors = ordered.map(name => ENERGY_COLORS[name] || '#666');

  const titleLine1 = revealed
    ? `${revealed}: electricity mix`
    : 'Country X: electricity mix';
  const titleLine2 = `(${ENERGY_YEAR}, share of total generation)`;

  // Legend: Fossil vs Clean
  const typeLegend = [
    { text: 'Fossil', fillStyle: '#A0522D', fontColor: '#ccc', strokeStyle: 'transparent', lineWidth: 0 },
    { text: 'Clean', fillStyle: '#4CAF50', fontColor: '#ccc', strokeStyle: 'transparent', lineWidth: 0 },
  ];

  renderChart(canvasId, {
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

export function renderTrajectoryChart(data, revealed, canvasId = 'chart-trajectory') {
  // Normalize: index = 100 at 1990 (or first year)
  const baseIdx = 0;
  const baseVal = data.emissions[baseIdx] || 1;
  const indexed = data.emissions.map(v => (v / baseVal) * 100);

  const titleLine1 = revealed
    ? `${revealed}: GHG trajectory & NDC targets`
    : 'Country X: GHG trajectory & NDC targets';

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

  renderChart(canvasId, {
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
          font: { family: "'DM Sans'", size: 14, weight: 500 },
          padding: { bottom: 8 },
        },
        tooltip: {
          callbacks: {
            // Override the default title formatter — Chart.js runs linear-axis
            // values through Intl.NumberFormat, which turns 2030 into "2,030".
            title: ctx => String(ctx[0]?.parsed.x ?? ''),
            label: ctx => `Index: ${ctx.parsed.y.toFixed(1)}`,
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          min: 1990,
          // Extend a couple of years past 2030 so the NDC target markers
          // (triangle/diamond, 6px radius at x=2030) don't get clipped against
          // the right edge of the plot area. stepSize:5 ensures no tick gets
          // drawn beyond 2030 — the extra space is just visual buffer.
          max: 2032,
          ticks: {
            color: '#888',
            stepSize: 5,
            includeBounds: false,
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
  const ghgChart = chartInstances.get('chart-ghg');
  if (ghgChart) {
    ghgChart.options.plugins.title.text = [`${countryName}: sectoral GHG emissions`, `(${GHG_YEAR}, share of national total)`];
    ghgChart.update();
  }
  const energyChart = chartInstances.get('chart-energy');
  if (energyChart) {
    energyChart.options.plugins.title.text = [`${countryName}: electricity mix`, `(${ENERGY_YEAR}, share of total generation)`];
    energyChart.update();
  }
  const trajectoryChart = chartInstances.get('chart-trajectory');
  if (trajectoryChart) {
    trajectoryChart.options.plugins.title.text = `${countryName}: GHG trajectory & NDC targets`;
    trajectoryChart.update();
  }
}
