(function () {
  "use strict";

  const DEFAULT_DATA_URL = "../data/roadbook-map.final.json";
  const DAY_COLORS = [
    "#1769aa",
    "#15803d",
    "#c2410c",
    "#7c3aed",
    "#0f766e",
    "#b91c1c",
    "#a16207",
    "#be185d",
    "#2563eb",
    "#4d7c0f",
    "#9333ea",
    "#0e7490"
  ];

  const MARKER_META = {
    overnight: { label: "住宿", glyph: "宿" },
    fuel: { label: "加油", glyph: "油" },
    medical: { label: "急救", glyph: "医" },
    repair: { label: "维修", glyph: "修" },
    risk: { label: "风险", glyph: "险" },
    detour: { label: "绕行", glyph: "绕" }
  };

  const MARKER_LAYER = {
    detour: "detours",
    overnight: "overnight",
    fuel: "fuel",
    medical: "medical",
    repair: "repair",
    risk: "risk"
  };

  const state = {
    AMap: null,
    map: null,
    infoWindow: null,
    roadbook: null,
    selectedDay: "all",
    contentLayers: {
      routes: true,
      detours: true,
      overnight: true,
      fuel: true,
      medical: true,
      repair: true,
      risk: true
    },
    mapLayers: {},
    overlays: {
      routes: [],
      detours: [],
      overnight: [],
      fuel: [],
      medical: [],
      repair: [],
      risk: []
    }
  };

  const els = {};

  document.addEventListener("DOMContentLoaded", boot);

  function boot() {
    cacheElements();
    wireUi();
    initFromConfig();
  }

  function cacheElements() {
    els.statusText = document.getElementById("status-text");
    els.dataUrl = document.getElementById("data-url");
    els.dataFile = document.getElementById("data-file");
    els.reloadData = document.getElementById("reload-data");
    els.dayFilter = document.getElementById("day-filter");
    els.fitView = document.getElementById("fit-view");
    els.dayList = document.getElementById("day-list");
  }

  function wireUi() {
    els.reloadData.addEventListener("click", () => loadAndRenderData(els.dataUrl.value.trim()));
    els.fitView.addEventListener("click", fitVisibleOverlays);

    els.dayFilter.addEventListener("change", (event) => {
      state.selectedDay = event.target.value;
      applyFilters();
      renderDayList();
      fitVisibleOverlays();
    });

    document.querySelectorAll("[data-layer]").forEach((input) => {
      input.addEventListener("change", (event) => {
        const layer = event.target.dataset.layer;
        state.contentLayers[layer] = event.target.checked;
        applyFilters();
      });
    });

    document.querySelectorAll("[data-map-layer]").forEach((input) => {
      input.addEventListener("change", (event) => {
        setBaseLayer(event.target.dataset.mapLayer, event.target.checked);
      });
    });

    els.dataFile.addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      try {
        setStatus(`正在读取 ${file.name}...`);
        const json = JSON.parse(await file.text());
        renderRoadbook(json);
        setStatus(`已加载 ${file.name}`, "ready");
      } catch (error) {
        setStatus(`本地 JSON 解析失败：${error.message}`, "error");
      } finally {
        event.target.value = "";
      }
    });
  }

  function initFromConfig() {
    const params = new URLSearchParams(window.location.search);
    const config = window.G318_AMAP_CONFIG || {};
    const jsapiKey = config.AMAP_JSAPI_KEY || window.AMAP_JSAPI_KEY;
    const securityJsCode = config.AMAP_SECURITY_JS_CODE || window.AMAP_SECURITY_JS_CODE;
    const dataUrl = params.get("data") || config.DATA_URL || DEFAULT_DATA_URL;

    els.dataUrl.value = dataUrl;

    if (!jsapiKey || !securityJsCode) {
      setStatus("缺少 config.local.js 中的 AMAP_JSAPI_KEY 或 AMAP_SECURITY_JS_CODE。", "error");
      return;
    }

    window._AMapSecurityConfig = {
      securityJsCode
    };

    if (!window.AMapLoader) {
      setStatus("AMapLoader 未加载，请检查网络或 loader.js。", "error");
      return;
    }

    setStatus("正在加载高德 JSAPI...");
    window.AMapLoader.load({
      key: jsapiKey,
      version: "2.0",
      plugins: ["AMap.Scale", "AMap.ToolBar", "AMap.ControlBar"]
    })
      .then((AMap) => {
        state.AMap = AMap;
        AMap.getConfig().appname = "g318-roadbook-amap-jsapi";
        createMap();
        return loadAndRenderData(dataUrl);
      })
      .catch((error) => {
        setStatus(`高德 JSAPI 加载失败：${error.message || error}`, "error");
      });
  }

  function createMap() {
    const AMap = state.AMap;
    state.map = new AMap.Map("map", {
      viewMode: "3D",
      zoom: 6,
      pitch: 28,
      center: [102.6, 30.5],
      resizeEnable: true
    });

    state.map.addControl(new AMap.Scale());
    state.map.addControl(new AMap.ToolBar({ position: "RB" }));
    state.map.addControl(new AMap.ControlBar({ position: "RT" }));

    state.infoWindow = new AMap.InfoWindow({
      anchor: "bottom-center",
      offset: new AMap.Pixel(0, -34),
      autoMove: true,
      closeWhenClickMap: true
    });

    state.mapLayers.satellite = new AMap.TileLayer.Satellite();
    state.mapLayers.roadNet = new AMap.TileLayer.RoadNet();
    state.mapLayers.traffic = new AMap.TileLayer.Traffic({
      zIndex: 10,
      autoRefresh: true,
      interval: 180
    });

    Object.values(state.mapLayers).forEach((layer) => {
      state.map.add(layer);
      layer.hide();
    });
  }

  async function loadAndRenderData(url) {
    if (!state.map) return;
    try {
      setStatus(`正在加载路书数据：${url}`);
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const json = await response.json();
      renderRoadbook(json);
      setStatus(`已加载 ${summarizeData(json)}`, "ready");
    } catch (error) {
      setStatus(`数据加载失败：${error.message}。可通过本地 HTTP 服务打开，或使用“打开本地 JSON”。`, "error");
    }
  }

  function renderRoadbook(roadbook) {
    state.roadbook = normalizeRoadbook(roadbook);
    clearOverlays();
    renderRoutes();
    renderDetours();
    renderMarkers();
    populateDayFilter();
    renderDayList();
    applyFilters();
    fitVisibleOverlays();
  }

  function normalizeRoadbook(roadbook) {
    return {
      metadata: roadbook.metadata || {},
      days: Array.isArray(roadbook.days) ? roadbook.days : [],
      routes: Array.isArray(roadbook.routes) ? roadbook.routes : [],
      fuelStations: Array.isArray(roadbook.fuelStations) ? roadbook.fuelStations : [],
      medicalStations: Array.isArray(roadbook.medicalStations) ? roadbook.medicalStations : [],
      repairStations: Array.isArray(roadbook.repairStations) ? roadbook.repairStations : [],
      lodgings: Array.isArray(roadbook.lodgings) ? roadbook.lodgings : [],
      risks: Array.isArray(roadbook.risks) ? roadbook.risks : [],
      detours: Array.isArray(roadbook.detours) ? roadbook.detours : []
    };
  }

  function renderRoutes() {
    state.roadbook.routes.forEach((route) => {
      if (!isValidPath(route.path)) return;
      const line = new state.AMap.Polyline({
        path: route.path,
        isOutline: true,
        outlineColor: "#ffffff",
        borderWeight: 2,
        strokeColor: colorForDay(route.day),
        strokeOpacity: 0.88,
        strokeWeight: 7,
        strokeStyle: "solid",
        lineJoin: "round",
        lineCap: "round",
        showDir: true,
        zIndex: 50 + Number(route.day || 0),
        extData: { layer: "routes", day: route.day, id: route.id }
      });

      line.on("click", (event) => {
        openInfoWindow("route", route, event.lnglat || route.path[Math.floor(route.path.length / 2)]);
      });

      state.map.add(line);
      state.overlays.routes.push({ day: route.day, overlay: line, source: route });
    });
  }

  function renderDetours() {
    state.roadbook.detours.forEach((detour) => {
      if (isValidPath(detour.path)) {
        const line = new state.AMap.Polyline({
          path: detour.path,
          isOutline: true,
          outlineColor: "#2f2415",
          borderWeight: 1,
          strokeColor: colorForDay(detour.day),
          strokeOpacity: 0.92,
          strokeWeight: 6,
          strokeStyle: "dashed",
          strokeDasharray: [12, 8],
          lineJoin: "round",
          lineCap: "round",
          zIndex: 90 + Number(detour.day || 0),
          extData: { layer: "detours", day: detour.day, id: detour.id }
        });

        line.on("click", (event) => {
          openInfoWindow("detour", detour, event.lnglat || detour.path[Math.floor(detour.path.length / 2)]);
        });

        state.map.add(line);
        state.overlays.detours.push({ day: detour.day, overlay: line, source: detour });
      }

      const markerCoord = detour.coord || firstCoord(detour.path);
      if (isValidCoord(markerCoord)) {
        addMarker("detour", detour, markerCoord);
      }
    });
  }

  function renderMarkers() {
    state.roadbook.lodgings.forEach((item) => addMarker("overnight", item, item.coord));
    state.roadbook.fuelStations.forEach((item) => addMarker("fuel", item, item.coord));
    state.roadbook.medicalStations.forEach((item) => addMarker("medical", item, item.coord));
    state.roadbook.repairStations.forEach((item) => addMarker("repair", item, item.coord));
    state.roadbook.risks.forEach((item) => addMarker("risk", item, item.coord));
  }

  function addMarker(type, item, coord) {
    if (!isValidCoord(coord)) return;
    const layer = MARKER_LAYER[type] || type;
    if (!state.overlays[layer]) state.overlays[layer] = [];
    const marker = new state.AMap.Marker({
      position: coord,
      anchor: "bottom-center",
      content: createMarkerNode(type, item),
      title: item.name || MARKER_META[type].label,
      clickable: true,
      zIndex: item.isPriority ? 150 : type === "risk" ? 130 : 120,
      extData: { layer, type, day: item.day, id: item.id }
    });

    marker.on("click", (event) => openInfoWindow(type, item, event.target.getPosition()));
    state.map.add(marker);
    state.overlays[layer].push({ day: item.day, overlay: marker, source: item });
  }

  function createMarkerNode(type, item = {}) {
    const node = document.createElement("div");
    node.className = `map-marker map-marker-${type}`;
    if (item.isPriority || item.availability === "must-refuel") {
      node.classList.add("map-marker-priority");
    }
    node.textContent = MARKER_META[type].glyph;
    return node;
  }

  function clearOverlays() {
    const all = [];
    Object.keys(state.overlays).forEach((key) => {
      state.overlays[key].forEach((entry) => all.push(entry.overlay));
      state.overlays[key] = [];
    });
    if (all.length) state.map.remove(all);
    if (state.infoWindow) state.infoWindow.close();
  }

  function populateDayFilter() {
    const current = state.selectedDay;
    els.dayFilter.innerHTML = '<option value="all">全部日期</option>';
    state.roadbook.days.forEach((day) => {
      const option = document.createElement("option");
      option.value = String(day.day);
      option.textContent = `D${day.day} ${day.title || ""}`.trim();
      els.dayFilter.appendChild(option);
    });
    const nextValue = current === "all" || hasDay(current) ? current : "all";
    state.selectedDay = nextValue;
    els.dayFilter.value = nextValue;
  }

  function renderDayList() {
    els.dayList.innerHTML = "";
    const visibleDays = state.roadbook.days.filter((day) => dayMatches(day.day));

    if (!visibleDays.length) {
      const empty = document.createElement("p");
      empty.className = "status-text";
      empty.textContent = "当前筛选下没有每日摘要。";
      els.dayList.appendChild(empty);
      return;
    }

    visibleDays.forEach((day) => {
      const item = document.createElement("article");
      item.className = "day-item";
      item.style.borderLeftColor = colorForDay(day.day);
      if (String(day.day) === state.selectedDay) item.classList.add("is-active");
      item.addEventListener("click", () => {
        state.selectedDay = String(day.day);
        els.dayFilter.value = state.selectedDay;
        applyFilters();
        renderDayList();
        fitVisibleOverlays();
      });

      const title = document.createElement("div");
      title.className = "day-item-title";
      title.append(textNode(`D${day.day} ${day.title || ""}`.trim()));

      const risk = document.createElement("span");
      risk.textContent = day.riskLevel || "待定";
      title.appendChild(risk);

      const meta = document.createElement("div");
      meta.className = "day-item-meta";
      const start = day.start && day.start.name ? day.start.name : "起点待填";
      const end = day.end && day.end.name ? day.end.name : "终点待填";
      const distance = day.plannedDistanceKm ? `约 ${day.plannedDistanceKm} km` : "里程待填";
      meta.textContent = `${start} -> ${end} | ${distance}`;

      item.append(title, meta);
      els.dayList.appendChild(item);
    });
  }

  function applyFilters() {
    setOverlayGroup("routes", state.contentLayers.routes);
    setOverlayGroup("detours", state.contentLayers.detours);
    setOverlayGroup("overnight", state.contentLayers.overnight);
    setOverlayGroup("fuel", state.contentLayers.fuel);
    setOverlayGroup("medical", state.contentLayers.medical);
    setOverlayGroup("repair", state.contentLayers.repair);
    setOverlayGroup("risk", state.contentLayers.risk);
  }

  function setOverlayGroup(group, enabled) {
    state.overlays[group].forEach((entry) => {
      if (enabled && dayMatches(entry.day)) {
        entry.overlay.show();
      } else {
        entry.overlay.hide();
      }
    });
  }

  function setBaseLayer(layerName, enabled) {
    const layer = state.mapLayers[layerName];
    if (!layer) return;
    if (enabled) {
      layer.show();
    } else {
      layer.hide();
    }
  }

  function fitVisibleOverlays() {
    if (!state.map) return;
    const visible = [];
    Object.keys(state.overlays).forEach((group) => {
      if (!state.contentLayers[group]) return;
      state.overlays[group].forEach((entry) => {
        if (dayMatches(entry.day)) visible.push(entry.overlay);
      });
    });
    if (visible.length) {
      state.map.setFitView(visible, false, [70, 420, 70, 70], 12);
    }
  }

  function openInfoWindow(type, item, position) {
    const content = createInfoContent(type, item);
    state.infoWindow.setContent(content);
    state.infoWindow.open(state.map, position);
  }

  function createInfoContent(type, item) {
    const root = document.createElement("div");
    root.className = "info-window-content";

    const title = document.createElement("h3");
    title.className = "info-window-title";
    title.textContent = item.name || item.title || "未命名点位";
    root.appendChild(title);

    const rows = [
      ["重点级别", item.priorityLabel || ""],
      ["沿途位置", Number.isFinite(item.routeDistanceKm) ? `距当日起点约 ${item.routeDistanceKm} km` : ""],
      ["离主线", Number.isFinite(item.distanceFromRouteKm) ? `约 ${item.distanceFromRouteKm} km` : ""],
      ["地址", item.address || ""],
      ["营业", item.openTime || ""],
      ["评分", item.rating || ""],
      ["类型", type === "route" ? "每日路线" : MARKER_META[type]?.label || type],
      ["行程日", item.day ? `D${item.day}` : "待填"],
      ["风险级别", item.riskLevel || item.risk_level || "待定"],
      ["备注", item.notes || item.note || item.summary || "待主线程补充"],
      ["状态", item.status || item.availability || item.bookingStatus || ""],
      ["分类", item.category || item.type || ""]
    ];

    rows.forEach(([label, value]) => {
      if (!value) return;
      const row = document.createElement("div");
      row.className = "info-row";

      const labelNode = document.createElement("span");
      labelNode.className = "info-label";
      labelNode.textContent = label;

      const valueNode = document.createElement("span");
      valueNode.textContent = String(value);

      row.append(labelNode, valueNode);
      root.appendChild(row);
    });

    return root;
  }

  function summarizeData(data) {
    const days = Array.isArray(data.days) ? data.days.length : 0;
    const routes = Array.isArray(data.routes) ? data.routes.length : 0;
    return `${days} 天、${routes} 条路线`;
  }

  function setStatus(message, mode) {
    els.statusText.textContent = message;
    els.statusText.classList.toggle("is-error", mode === "error");
    els.statusText.classList.toggle("is-ready", mode === "ready");
  }

  function colorForDay(day) {
    const index = Math.max(Number(day || 1) - 1, 0) % DAY_COLORS.length;
    return DAY_COLORS[index];
  }

  function hasDay(day) {
    return state.roadbook.days.some((item) => String(item.day) === String(day));
  }

  function dayMatches(day) {
    return state.selectedDay === "all" || String(day) === state.selectedDay;
  }

  function isValidCoord(coord) {
    return (
      Array.isArray(coord) &&
      coord.length === 2 &&
      Number.isFinite(Number(coord[0])) &&
      Number.isFinite(Number(coord[1]))
    );
  }

  function isValidPath(path) {
    return Array.isArray(path) && path.length >= 2 && path.every(isValidCoord);
  }

  function firstCoord(path) {
    return Array.isArray(path) ? path.find(isValidCoord) : null;
  }

  function textNode(text) {
    return document.createTextNode(text);
  }

  window.g318RoadbookMap = {
    reload: () => loadAndRenderData(els.dataUrl.value.trim()),
    setDay: (day) => {
      state.selectedDay = String(day || "all");
      els.dayFilter.value = state.selectedDay;
      applyFilters();
      renderDayList();
      fitVisibleOverlays();
    },
    loadData: renderRoadbook,
    getState: () => ({
      selectedDay: state.selectedDay,
      contentLayers: { ...state.contentLayers },
      metadata: state.roadbook && state.roadbook.metadata
    })
  };
})();
