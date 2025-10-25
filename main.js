(() => {
  const DATA_URL = 'data/aed.geojson';
  const MAX_LIST_ITEMS = 30;
  const DEFAULT_BAR_COLOR = '#4e79a7';
  const HIGHLIGHT_BAR_COLOR = '#f45b69';
  const numberFmt = new Intl.NumberFormat('ja-JP');
  const collator = new Intl.Collator('ja-JP');

  const citySelect = document.getElementById('citySelect');
  const searchInput = document.getElementById('searchInput');
  const totalCountEl = document.getElementById('totalCount');
  const cityCountEl = document.getElementById('cityCount');
  const filteredCountEl = document.getElementById('filteredCount');
  const listSummaryEl = document.getElementById('listSummary');
  const resultListEl = document.getElementById('resultList');

  let allSites = [];
  let filteredSites = [];
  let cityCountMap = new Map();
  let chartInstance = null;

  const map = L.map('map', {
    center: [35.99, 139.66],
    zoom: 8,
    minZoom: 7,
    maxZoom: 17,
    scrollWheelZoom: true,
    worldCopyJump: false
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  const clusterGroup = L.markerClusterGroup({
    chunkedLoading: true,
    disableClusteringAtZoom: 15,
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: false
  });
  map.addLayer(clusterGroup);

  init();

  async function init() {
    try {
      const response = await fetch(DATA_URL);
      if (!response.ok) {
        throw new Error(`データの取得に失敗しました（HTTP ${response.status}）`);
      }
      const geojson = await response.json();
      allSites = (geojson.features || [])
        .map(normalizeFeature)
        .filter((site) => Number.isFinite(site.lat) && Number.isFinite(site.lng));

      cityCountMap = buildCityCountMap(allSites);
      filteredSites = [...allSites];

      updateStats();
      populateCitySelect();
      renderMarkers(filteredSites, { fitToData: true });
      renderList(filteredSites);
      highlightSelection();
      setupChart();
      bindEvents();
    } catch (error) {
      console.error(error);
      listSummaryEl.textContent = 'データの取得に失敗しました。ページを再読み込みしてください。';
    }
  }

  function normalizeFeature(feature, index) {
    const props = feature.properties || {};
    const coordinates = feature.geometry?.coordinates || [];
    return {
      id: props.OBJECTID ?? index,
      name: props['施設名称'] || props['施設名等'] || '名称未設定',
      location: props['設置場所'] || '-',
      prefecture: props['都道府県'] || '埼玉県',
      city: props['市区町村'] || '不明',
      address: props['住所'] || '-',
      phone: props['電話番号'] || '',
      availableDays: props['利用可能日'] || '-',
      availableHours: props['利用可能時間'] || '-',
      padType: props['パッドの種類'] || '-',
      lat: coordinates[1],
      lng: coordinates[0]
    };
  }

  function buildCityCountMap(data) {
    const map = new Map();
    data.forEach((site) => {
      const key = (site.city || '不明').trim();
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }

  function populateCitySelect() {
    const options = Array.from(cityCountMap.entries())
      .sort((a, b) => collator.compare(a[0], b[0]));

    const fragment = document.createDocumentFragment();
    options.forEach(([city, count]) => {
      const option = document.createElement('option');
      option.value = city;
      option.textContent = `${city}（${numberFmt.format(count)}）`;
      fragment.appendChild(option);
    });
    citySelect.appendChild(fragment);
  }

  function bindEvents() {
    citySelect.addEventListener('change', () => {
      applyFilters({ shouldFit: true });
    });

    const debouncedSearch = debounce(() => applyFilters({ shouldFit: false }), 250);
    searchInput.addEventListener('input', debouncedSearch);
  }

  function applyFilters({ shouldFit } = { shouldFit: false }) {
    const selectedCity = citySelect.value;
    const keyword = searchInput.value.trim();
    const normalizedKeyword = keyword ? keyword.toLowerCase() : '';

    filteredSites = allSites.filter((site) => {
      const cityMatch = selectedCity === 'all' || site.city === selectedCity;
      if (!cityMatch) return false;
      if (!normalizedKeyword) return true;
      return [site.name, site.address, site.location]
        .some((field) => String(field || '').toLowerCase().includes(normalizedKeyword));
    });

    updateStats();
    renderMarkers(filteredSites, { fitToData: shouldFit });
    renderList(filteredSites);
    highlightSelection();
  }

  function renderMarkers(data, { fitToData } = { fitToData: false }) {
    clusterGroup.clearLayers();
    data.forEach((site) => {
      const marker = L.marker([site.lat, site.lng]);
      marker.bindPopup(createPopup(site));
      clusterGroup.addLayer(marker);
    });

    if (fitToData && data.length) {
      const bounds = L.latLngBounds(data.map((site) => [site.lat, site.lng]));
      const padding = data.length === allSites.length ? 0.05 : 0.12;
      map.fitBounds(bounds.pad(padding), { maxZoom: 13 });
    }
  }

  function renderList(data) {
    resultListEl.innerHTML = '';
    if (!data.length) {
      listSummaryEl.textContent = '条件に一致する設置場所が見つかりませんでした。';
      return;
    }

    const items = data.slice(0, MAX_LIST_ITEMS);
    listSummaryEl.textContent = `${numberFmt.format(data.length)} 件中 ${items.length} 件を表示`;

    const fragment = document.createDocumentFragment();
    items.forEach((site) => {
      const li = document.createElement('li');
      const title = document.createElement('h3');
      title.textContent = site.name;
      const details = document.createElement('p');
      details.innerHTML = [
        `${escapeHtml(site.city)} / ${escapeHtml(site.address)}`,
        `設置場所: ${escapeHtml(site.location)}`,
        `利用可能: ${escapeHtml(site.availableDays)} ${escapeHtml(site.availableHours)}`
      ].join('<br>');
      li.appendChild(title);
      li.appendChild(details);
      fragment.appendChild(li);
    });
    resultListEl.appendChild(fragment);
  }

  function updateStats() {
    totalCountEl.textContent = numberFmt.format(allSites.length);
    cityCountEl.textContent = numberFmt.format(cityCountMap.size);
    filteredCountEl.textContent = numberFmt.format(filteredSites.length);
  }

  function setupChart() {
    if (!window.Chart) {
      console.warn('Chart.js が読み込まれていません。');
      return;
    }

    const topCities = Array.from(cityCountMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);
    const counts = topCities.map(([, count]) => count);
    const yAxisScale = getNiceScale(counts);

    const ctx = document.getElementById('cityChart').getContext('2d');
    chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: topCities.map(([city]) => city),
        datasets: [
          {
            label: 'AED 設置数',
            data: topCities.map(([, count]) => count),
            backgroundColor: topCities.map(() => DEFAULT_BAR_COLOR)
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
              label: (context) => `${context.formattedValue} 件`
            }
          }
        },
        scales: {
          x: {
            ticks: {
              autoSkip: false,
              maxRotation: 45,
              minRotation: 30
            }
          },
          y: {
            beginAtZero: true,
            suggestedMax: yAxisScale.suggestedMax,
            ticks: {
              stepSize: yAxisScale.stepSize,
              callback: (value) => `${value} 件`
            },
            title: { display: true, text: '件数' }
          }
        }
      }
    });

    ctx.canvas.addEventListener('click', (event) => {
      const points = chartInstance.getElementsAtEventForMode(event, 'nearest', { intersect: true }, true);
      if (!points.length) return;
      const index = points[0].index;
      const cityName = chartInstance.data.labels[index];
      citySelect.value = cityName;
      applyFilters({ shouldFit: true });
    });
  }

  function highlightSelection() {
    if (!chartInstance) return;
    const selectedCity = citySelect.value;
    const colors = chartInstance.data.labels.map((label) => (
      selectedCity !== 'all' && label === selectedCity ? HIGHLIGHT_BAR_COLOR : DEFAULT_BAR_COLOR
    ));
    chartInstance.data.datasets[0].backgroundColor = colors;
    chartInstance.update('none');
  }

  function createPopup(site) {
    return `
      <strong>${escapeHtml(site.name)}</strong><br>
      ${escapeHtml(site.city)} / ${escapeHtml(site.address)}<br>
      設置場所: ${escapeHtml(site.location)}<br>
      利用可能: ${escapeHtml(site.availableDays)} ${escapeHtml(site.availableHours)}<br>
      パッド: ${escapeHtml(site.padType)}<br>
      電話: ${escapeHtml(site.phone || '―')}
    `;
  }

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, (char) => {
      switch (char) {
        case '&':
          return '&amp;';
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '"':
          return '&quot;';
        case '\'':
          return '&#39;';
        default:
          return char;
      }
    });
  }

  function debounce(fn, wait = 200) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(null, args), wait);
    };
  }

  function getNiceScale(values = []) {
    const maxValue = Math.max(...values, 0);
    if (!Number.isFinite(maxValue) || maxValue <= 0) {
      return { suggestedMax: 5, stepSize: 1 };
    }
    const exponent = Math.floor(Math.log10(maxValue));
    const magnitude = Math.pow(10, exponent);
    const normalized = maxValue / magnitude;
    let niceNormalized;
    if (normalized <= 1) niceNormalized = 1;
    else if (normalized <= 2) niceNormalized = 2;
    else if (normalized <= 5) niceNormalized = 5;
    else niceNormalized = 10;
    const suggestedMax = niceNormalized * magnitude;
    return {
      suggestedMax,
      stepSize: Math.max(1, Math.round(suggestedMax / 5))
    };
  }
})();
