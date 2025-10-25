(() => {
  const LOCAL_DATA_URL = 'data/aed.geojson';
  const REMOTE_DATA_URL = 'https://services9.arcgis.com/n65w8AXGaYPTqFYI/arcgis/rest/services/AED_setting_facilities/FeatureServer/0/query?where=1=1&outFields=*&outSR=4326&f=geojson';
  const METADATA_URL = 'https://services9.arcgis.com/n65w8AXGaYPTqFYI/arcgis/rest/services/AED_setting_facilities/FeatureServer/0?f=pjson';
  const MAX_LIST_ITEMS = 30;
  const numberFmt = new Intl.NumberFormat('ja-JP');
  const collator = new Intl.Collator('ja-JP');
  const dateTimeFmt = new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
  const distanceFmt = new Intl.NumberFormat('ja-JP', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });

  const citySelect = document.getElementById('citySelect');
  const searchInput = document.getElementById('searchInput');
  const totalCountEl = document.getElementById('totalCount');
  const cityCountEl = document.getElementById('cityCount');
  const filteredCountEl = document.getElementById('filteredCount');
  const listSummaryEl = document.getElementById('listSummary');
  const resultListEl = document.getElementById('resultList');
  const dataTimestampEl = document.getElementById('dataTimestamp');
  const refreshButton = document.getElementById('refreshDataButton');

  let allSites = [];
  let filteredSites = [];
  let cityCountMap = new Map();
  let markerStore = new Map();
  let activeSiteId = null;
  let sourceUpdatedAt = null;
  let lastLoadedAt = null;
  let userLocation = null;

  const DEFAULT_MAP_CENTER = [35.99, 139.66];
  const DEFAULT_MAP_ZOOM = 9;
  const USER_LOCATION_ZOOM = 13;

  const map = L.map('map', {
    center: DEFAULT_MAP_CENTER,
    zoom: DEFAULT_MAP_ZOOM,
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

  attemptUserLocationCentering();

  init();

  async function init() {
    try {
      await loadData(LOCAL_DATA_URL, { fitToData: true });
    } catch (error) {
      console.error(error);
      listSummaryEl.textContent = 'ローカルデータの読み込みに失敗しました。ページを再読み込みしてください。';
      return;
    }
    fetchMetadata();
    bindEvents();
  }

  async function loadData(dataUrl, { fitToData = false, preserveCitySelection = false } = {}) {
    const response = await fetch(dataUrl, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`データの取得に失敗しました（HTTP ${response.status}）`);
    }
    const geojson = await response.json();
    ingestDataset(geojson, { fitToData, preserveCitySelection });
    lastLoadedAt = new Date();
    renderTimestamp();
  }

  function ingestDataset(geojson, { fitToData = false, preserveCitySelection = false } = {}) {
    const previousCity = citySelect.value || 'all';
    allSites = (geojson.features || [])
      .map(normalizeFeature)
      .filter((site) => Number.isFinite(site.lat) && Number.isFinite(site.lng));

    cityCountMap = buildCityCountMap(allSites);
    const nextCity = preserveCitySelection && cityCountMap.has(previousCity) ? previousCity : 'all';
    populateCitySelect(nextCity);
    const shouldFitMap = fitToData && !userLocation;
    applyFilters({ shouldFit: shouldFitMap });
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

  function populateCitySelect(selectedCity = 'all') {
    const options = Array.from(cityCountMap.entries())
      .sort((a, b) => collator.compare(a[0], b[0]));

    const fragment = document.createDocumentFragment();
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = '全ての市区町村';
    fragment.appendChild(allOption);

    options.forEach(([city, count]) => {
      const option = document.createElement('option');
      option.value = city;
      option.textContent = `${city}（${numberFmt.format(count)}）`;
      fragment.appendChild(option);
    });

    citySelect.replaceChildren(fragment);
    if (selectedCity !== 'all' && !cityCountMap.has(selectedCity)) {
      citySelect.value = 'all';
      return;
    }
    citySelect.value = selectedCity;
  }

  function bindEvents() {
    citySelect.addEventListener('change', () => {
      applyFilters({ shouldFit: true });
    });

    const debouncedSearch = debounce(() => applyFilters({ shouldFit: false }), 250);
    searchInput.addEventListener('input', debouncedSearch);

    if (refreshButton) {
      refreshButton.addEventListener('click', handleRefreshClick);
    }
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

    if (userLocation) {
      filteredSites.forEach((site) => {
        site.distanceKm = computeDistanceKm(userLocation.lat, userLocation.lng, site.lat, site.lng);
      });
      filteredSites.sort((a, b) => {
        const distanceA = Number.isFinite(a.distanceKm) ? a.distanceKm : Number.POSITIVE_INFINITY;
        const distanceB = Number.isFinite(b.distanceKm) ? b.distanceKm : Number.POSITIVE_INFINITY;
        return distanceA - distanceB;
      });
    } else {
      filteredSites.forEach((site) => {
        delete site.distanceKm;
      });
    }

    if (!filteredSites.some((site) => site.id === activeSiteId)) {
      activeSiteId = null;
    }

    updateStats();
    renderMarkers(filteredSites, { fitToData: shouldFit });
    renderList(filteredSites);
  }

  function renderMarkers(data, { fitToData } = { fitToData: false }) {
    clusterGroup.clearLayers();
    markerStore = new Map();
    data.forEach((site) => {
      const marker = L.marker([site.lat, site.lng]);
      marker.bindPopup(createPopup(site));
      marker.on('click', () => {
        focusSite(site, { shouldScroll: true, focusMap: false });
      });
      clusterGroup.addLayer(marker);
      markerStore.set(site.id, marker);
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
    let summaryText = `${numberFmt.format(data.length)} 件中 ${items.length} 件を表示`;
    if (userLocation) {
      summaryText += '（現在地に近い順）';
    }
    listSummaryEl.textContent = summaryText;

    const fragment = document.createDocumentFragment();
    items.forEach((site) => {
      const li = document.createElement('li');
      li.dataset.siteId = String(site.id);
      li.tabIndex = 0;
      const title = document.createElement('h3');
      title.textContent = site.name;
      const details = document.createElement('p');
      const detailLines = [
        `${escapeHtml(site.city)} / ${escapeHtml(site.address)}`,
        `設置場所: ${escapeHtml(site.location)}`,
        `利用可能: ${escapeHtml(site.availableDays)} ${escapeHtml(site.availableHours)}`
      ];
      if (Number.isFinite(site.distanceKm)) {
        detailLines.push(`現在地から約 ${distanceFmt.format(site.distanceKm)} km`);
      }
      details.innerHTML = detailLines.join('<br>');
      li.appendChild(title);
      li.appendChild(details);
      const actions = document.createElement('div');
      actions.className = 'result-actions';
      actions.appendChild(createDirectionsLink(site));
      li.appendChild(actions);
      li.addEventListener('click', () => focusSite(site, { shouldScroll: false }));
      li.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          focusSite(site, { shouldScroll: false });
        }
      });
      fragment.appendChild(li);
    });
    resultListEl.appendChild(fragment);
    setActiveListItem();
  }

  function updateStats() {
    totalCountEl.textContent = numberFmt.format(allSites.length);
    cityCountEl.textContent = numberFmt.format(cityCountMap.size);
    filteredCountEl.textContent = numberFmt.format(filteredSites.length);
  }

  function createPopup(site) {
    const directionsUrl = buildDirectionsUrl(site);
    const guideLabel = userLocation ? '現在地から道案内' : '道案内';
    return `
      <strong>${escapeHtml(site.name)}</strong><br>
      ${escapeHtml(site.city)} / ${escapeHtml(site.address)}<br>
      設置場所: ${escapeHtml(site.location)}<br>
      利用可能: ${escapeHtml(site.availableDays)} ${escapeHtml(site.availableHours)}<br>
      パッド: ${escapeHtml(site.padType)}<br>
      電話: ${escapeHtml(site.phone || '―')}<br>
      <a class="popup-directions" href="${escapeHtml(
        directionsUrl
      )}" target="_blank" rel="noreferrer noopener">${guideLabel}</a>
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

  function focusSite(site, { shouldScroll = true, focusMap = true } = {}) {
    activeSiteId = site.id;
    const marker = markerStore.get(site.id);
    if (marker) {
      if (focusMap) {
        const targetZoom = Math.max(map.getZoom(), 14);
        map.setView(marker.getLatLng(), targetZoom, { animate: true });
      }
      marker.openPopup();
    }
    setActiveListItem({ shouldScroll });
  }

  function setActiveListItem({ shouldScroll = false } = {}) {
    const items = resultListEl.querySelectorAll('li[data-site-id]');
    items.forEach((item) => {
      const isActive = item.dataset.siteId === String(activeSiteId);
      item.classList.toggle('active', isActive);
      if (isActive && shouldScroll) {
        item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }

  async function handleRefreshClick() {
    if (refreshButton?.disabled) return;
    setRefreshButtonState(true);
    try {
      await loadData(REMOTE_DATA_URL, { fitToData: true, preserveCitySelection: true });
      await fetchMetadata();
    } catch (error) {
      console.error(error);
      renderTimestamp('最新データの取得に失敗しました');
    } finally {
      setRefreshButtonState(false);
    }
  }

  async function fetchMetadata() {
    if (!dataTimestampEl) return;
    try {
      const response = await fetch(METADATA_URL, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`メタデータの取得に失敗しました（HTTP ${response.status}）`);
      }
      const metadata = await response.json();
      const timestamp = metadata?.editingInfo?.dataLastEditDate;
      if (Number.isFinite(timestamp)) {
        sourceUpdatedAt = new Date(timestamp);
        renderTimestamp();
      } else {
        renderTimestamp('県公開データの最終更新日時が取得できませんでした');
      }
    } catch (error) {
      console.error(error);
      renderTimestamp('県公開データのメタデータ取得に失敗しました');
    }
  }

  function renderTimestamp(extraMessage) {
    if (!dataTimestampEl) return;
    const parts = [];
    if (sourceUpdatedAt) {
      parts.push(`県公開データ最終更新: ${formatDateTime(sourceUpdatedAt)}`);
    }
    if (lastLoadedAt) {
      parts.push(`画面に反映: ${formatDateTime(lastLoadedAt)}`);
    }
    let text = parts.join(' / ');
    if (!text) {
      text = 'データ更新情報: 未取得';
    }
    if (extraMessage) {
      text = `${text} / ${extraMessage}`;
    }
    dataTimestampEl.textContent = text;
  }

  function formatDateTime(date) {
    return dateTimeFmt.format(date);
  }

  function setRefreshButtonState(isLoading) {
    if (!refreshButton) return;
    refreshButton.disabled = isLoading;
    refreshButton.textContent = isLoading ? '取得中...' : '最新データを取得';
  }

  function attemptUserLocationCentering() {
    if (!('geolocation' in navigator)) return;
    getCurrentPosition({ enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 })
      .then((position) => {
        const { latitude, longitude } = position.coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
        setUserLocation(latitude, longitude);
      })
      .catch((error) => {
        console.warn('Failed to obtain user location', error);
      });
  }

  function getCurrentPosition(options = {}) {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });
  }

  function setUserLocation(latitude, longitude) {
    userLocation = { lat: latitude, lng: longitude };
    const userLatLng = [latitude, longitude];
    const targetZoom = Math.max(map.getZoom(), USER_LOCATION_ZOOM);
    map.setView(userLatLng, targetZoom, { animate: false });
    if (allSites.length) {
      applyFilters({ shouldFit: false });
    }
  }

  function computeDistanceKm(lat1, lng1, lat2, lng2) {
    const toRad = (value) => (value * Math.PI) / 180;
    const R = 6371; // Earth radius in kilometers
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function buildDirectionsUrl(site) {
    const params = new URLSearchParams();
    params.set('api', '1');
    const destination = buildDestinationQuery(site);
    params.set('destination', destination);
    if (userLocation) {
      const { lat, lng } = userLocation;
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        params.set('origin', `${lat},${lng}`);
        params.set('travelmode', 'walking');
      }
    }
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }

  function buildDestinationQuery(site) {
    const lat = Number(site.lat);
    const lng = Number(site.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return `${lat},${lng}`;
    }
    return site.address || site.name || 'AED';
  }

  function createDirectionsLink(site) {
    const link = document.createElement('a');
    link.className = 'guide-button';
    link.href = buildDirectionsUrl(site);
    link.target = '_blank';
    link.rel = 'noreferrer noopener';
    link.textContent = userLocation ? '現在地から道案内' : '道案内';
    link.setAttribute('aria-label', `${site.name} への道案内を開く`);
    link.addEventListener('click', (event) => event.stopPropagation());
    return link;
  }
})();
