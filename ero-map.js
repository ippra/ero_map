/* Centered, hypothetical Excessive Rainfall Outlook map for survey experiments.
   Everything the respondent compares is drawn in screen pixels around the map
   center, so the picture is identical for every ZIP code. No dependencies. */
(function () {
  "use strict";

  var W = 640, H = 480, ZOOM = 7;

  var CATEGORIES = [
    { id: "marginal", name: "Marginal", level: 1, fill: "#a0c587", line: "#4f7a3a", text: "#000000" },
    { id: "slight", name: "Slight", level: 2, fill: "#f9e070", line: "#c9a640", text: "#000000" },
    { id: "enhanced", name: "Enhanced", level: 3, fill: "#f19c38", line: "#b5651d", text: "#000000" },
    { id: "moderate", name: "Moderate", level: 4, fill: "#d9453c", line: "#9c2a23", text: "#ffffff" },
    { id: "high", name: "High", level: 5, fill: "#c826e8", line: "#a01fc0", text: "#ffffff" }
  ];

  /* Contour control points, in pixels relative to map center.
     Listed outermost first and smoothed into closed curves when drawn. */
  var CONTOURS = {
    marginal: [[-217,194],[-147,204],[-51,166],[30,90],[86,15],[151,-48],[167,-103],[145,-131],[89,-132],[10,-87],[-78,-54],[-173,2],[-237,84],[-247,154]],
    slight: [[-187,168],[-126,174],[-52,131],[-4,78],[20,27],[61,-2],[107,-40],[127,-80],[113,-100],[69,-92],[19,-58],[-20,-27],[-76,-18],[-140,13],[-202,72],[-213,132]],
    enhanced: [[-167,148],[-119,149],[-60,112],[-29,64],[-24,31],[-36,15],[-70,10],[-124,26],[-177,73],[-188,119]],
    moderate: [[-152,131],[-110,128],[-66,99],[-46,65],[-42,41],[-51,28],[-75,26],[-114,35],[-154,70],[-168,109]],
    high: [[-136,115],[-106,109],[-74,88],[-65,66],[-61,52],[-67,44],[-82,44],[-105,46],[-134,71],[-148,99]]
  };

  /* This whole circle lies inside the Slight area and outside every higher level.
     About 88% of ZIPs with a known boundary fit inside it at the fixed zoom. */
  var SAFE_RADIUS = 20;

  var DEFAULTS = {
    zip: "",
    baseUrl: "",
    detail: "full",
    attribution: "",
    fallback: { lat: 39.5, lon: -98.5 },
    maxRetries: 2,
    markerLabel: "Your area",
    fallbackMarkerLabel: "Example location",
    title: "Excessive Rainfall Outlook",
    legendTitle: "Risk of Flash Flooding from Excessive Rainfall",
    showMarker: false,
    basemapTimeoutMs: 25000,
    lookupTimeoutMs: 10000,
    allowZoomOut: true,
    maxZoomOutSteps: 2,
    onZoom: null,
    onDone: null
  };

  var CSS = [
    ".ero-root{font-family:Arial,Helvetica,sans-serif;color:#222;max-width:642px;margin:0 auto;line-height:1.3;text-align:left;background:#ececec;padding:6px;box-sizing:content-box}",
    ".ero-bar{background:#0c1c40;color:#fff;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:2px 12px;padding:6px 10px}",
    ".ero-title{font-size:20px;font-weight:700;margin:0}",
    ".ero-frame{position:relative;width:100%;overflow:hidden;background:#b8c8de;border:1px solid #9a9a9a;box-sizing:border-box;margin:6px 0}",
    ".ero-stage{position:absolute;left:0;top:0;width:640px;height:480px;transform-origin:0 0;overflow:hidden}",
    ".ero-stage svg{position:absolute;left:0;top:0;z-index:1}",
    ".ero-attr{position:absolute;right:0;bottom:0;background:rgba(255,255,255,.85);z-index:4;font-size:10px;padding:1px 4px;color:#333}",
    ".ero-zoom{position:absolute;left:8px;top:8px;z-index:5;display:grid;gap:0;border:1px solid #555;background:#fff}",
    ".ero-zoom button{width:36px;height:36px;font:700 22px/1 Arial,Helvetica,sans-serif;background:#fff;color:#111;border:0;margin:0;padding:0;cursor:pointer}",
    ".ero-zoom button+button{border-top:1px solid #999}",
    ".ero-zoom button:disabled{color:#aaa;cursor:default}",
    ".ero-zoom button:focus-visible{outline:3px solid #0b5c8a;outline-offset:-3px}",
    ".ero-legend{background:#fff;border:1px solid #bbb;margin:0 auto 6px;padding:6px 8px 8px;max-width:560px;box-sizing:border-box}",
    ".ero-legend-title{font-size:14px;font-weight:700;text-align:center;margin:0 0 4px}",
    ".ero-levels{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin:0;padding:0;list-style:none}",
    ".ero-levels li{margin:0;padding:0;text-align:center;min-width:0}",
    ".ero-levels span{display:block;font-size:12px;font-weight:700;color:#555;margin:0 0 2px}",
    ".ero-levels b{display:block;font-size:12px;border:2px solid;padding:4px 1px;box-sizing:border-box}",
    ".ero-form{margin:0;padding:12px;border:1px solid #9aa5b1;background:#f5f7fa}",
    ".ero-form label{display:block;font-size:15px;margin:0 0 8px}",
    ".ero-form input{font-size:16px;padding:6px 8px;width:7em;margin:0 8px 0 0;box-sizing:border-box}",
    ".ero-form button{font-size:15px;padding:6px 14px;cursor:pointer}",
    ".ero-loading{padding:40px 12px;text-align:center;color:#52606d}"
  ].join("");

  /* ---------- geometry ---------- */

  function worldPixel(lat, lon, zoom) {
    var size = 256 * Math.pow(2, zoom);
    var s = Math.sin(lat * Math.PI / 180);
    return {
      x: (lon + 180) / 360 * size,
      y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * size
    };
  }

  function kmPerPixel(lat, zoom) {
    return 40075.016686 * Math.cos(lat * Math.PI / 180) / (256 * Math.pow(2, zoom));
  }

  /* Closed Catmull-Rom curve through the points, written as SVG cubic Beziers. */
  function smoothPath(points) {
    var n = points.length, d = "M" + points[0][0] + " " + points[0][1];
    for (var i = 0; i < n; i++) {
      var p0 = points[(i - 1 + n) % n], p1 = points[i], p2 = points[(i + 1) % n], p3 = points[(i + 2) % n];
      d += "C" + [
        (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1), (p1[1] + (p2[1] - p0[1]) / 6).toFixed(1),
        (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1), (p2[1] - (p3[1] - p1[1]) / 6).toFixed(1),
        p2[0], p2[1]
      ].join(" ");
    }
    return d + "Z";
  }

  /* ---------- ZIP lookup ---------- */

  var shardCache = {}, shardWaiters = {};

  function normalizeZip(value) {
    var m = String(value == null ? "" : value).trim().match(/^(\d{5})(?:-?\d{4})?$/);
    return m ? m[1] : null;
  }

  function loadShard(digit, baseUrl, timeoutMs) {
    if (shardCache[digit]) return Promise.resolve(shardCache[digit]);
    return new Promise(function (resolve, reject) {
      (shardWaiters[digit] = shardWaiters[digit] || []).push(resolve);
      var script = document.createElement("script");
      var timer = setTimeout(function () { reject(new Error("timeout")); }, timeoutMs);
      script.src = baseUrl + "zips/" + digit + ".js";
      script.onload = function () { clearTimeout(timer); };
      script.onerror = function () { clearTimeout(timer); reject(new Error("load")); };
      document.head.appendChild(script);
    });
  }

  function lookup(zip, opts) {
    var clean = normalizeZip(zip);
    if (!clean) return Promise.resolve({ status: "invalid" });
    return loadShard(clean[0], opts.baseUrl, opts.lookupTimeoutMs).then(function (shard) {
      var hit = shard[clean];
      return hit ? { status: "ok", zip: clean, lat: hit[0], lon: hit[1], fit: hit[2] === undefined ? "yes" : hit[2] < 0 ? "unknown" : "no", radius: hit[2] > 0 ? hit[2] : null } : { status: "not_found", zip: clean };
    }, function () {
      return { status: "lookup_failed", zip: clean };
    });
  }

  /* ---------- drawing ---------- */

  function make(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  /* ---------- basemap ---------- */

  var basemapData = null, basemapWaiters = [];
  var DETAIL = {
    minimal: { cities: false, roads: false },
    cities: { cities: true, roads: false },
    roads: { cities: false, roads: true },
    full: { cities: true, roads: true }
  };
  var MAX_CITIES = 14, MAX_ROUTE_MARKERS = 10;

  function normalizeDetail(value) {
    var v = String(value || "").trim().toLowerCase();
    return DETAIL.hasOwnProperty(v) ? v : "full";
  }

  function bounds(flat) {
    var a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (var i = 0; i < flat.length; i += 2) {
      if (flat[i] < a) a = flat[i];
      if (flat[i] > c) c = flat[i];
      if (flat[i + 1] < b) b = flat[i + 1];
      if (flat[i + 1] > d) d = flat[i + 1];
    }
    return [a, b, c, d];
  }

  function prepareBasemap(raw) {
    ["states", "borders"].forEach(function (k) {
      raw[k] = raw[k].map(function (l) { return { p: l, b: bounds(l) }; });
    });
    ["majorRoads", "roads"].forEach(function (k) {
      raw[k] = raw[k].map(function (r) { return { n: r[0], l: r[1], p: r[2], b: bounds(r[2]) }; });
    });
    ["land", "us", "lakes"].forEach(function (k) {
      raw[k] = raw[k].map(function (r) { return { r: r, b: bounds(r[0]) }; });
    });
    return raw;
  }

  function loadBasemap(opts) {
    if (basemapData) return Promise.resolve(basemapData);
    return new Promise(function (resolve, reject) {
      basemapWaiters.push(resolve);
      var script = document.createElement("script");
      var timer = setTimeout(function () { reject(new Error("timeout")); }, opts.basemapTimeoutMs);
      script.src = opts.baseUrl + "basemap.js";
      script.onload = function () { clearTimeout(timer); };
      script.onerror = function () { clearTimeout(timer); reject(new Error("load")); };
      document.head.appendChild(script);
    });
  }

  function layerCanvas(stage, zIndex) {
    var canvas = document.createElement("canvas"), dpr = 2;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.cssText = "position:absolute;left:0;top:0;width:" + W + "px;height:" + H + "px;pointer-events:none;z-index:" + zIndex;
    stage.appendChild(canvas);
    var g = canvas.getContext("2d");
    g.scale(dpr, dpr);
    return g;
  }

  /* Share of the rainfall area left visible, and whether map center survives the crop. */
  function measureCrop(g) {
    var dpr = 2, pixels = g.getImageData(0, 0, W * dpr, H * dpr).data;
    var covered = function (x, y) { return pixels[(Math.round(y * dpr) * W * dpr + Math.round(x * dpr)) * 4 + 3] > 128; };
    var probe = document.createElement("canvas").getContext("2d");
    var area = new Path2D(smoothPath(CONTOURS.marginal));
    var total = 0, visible = 0;
    for (var y = 2; y < H; y += 4) {
      for (var x = 2; x < W; x += 4) {
        if (probe.isPointInPath(area, x - W / 2, y - H / 2)) {
          total++;
          if (!covered(x, y)) visible++;
        }
      }
    }
    return { rainVisiblePct: Math.round(100 * visible / total), centerVisible: covered(W / 2, H / 2) ? "no" : "yes" };
  }

  function drawBasemap(stage, data, lat, lon, detail, zoom) {
    var cond = DETAIL[detail], world = 256 * Math.pow(2, zoom);
    var center = worldPixel(lat, lon, zoom);
    var L = Math.round(center.x - W / 2), T = Math.round(center.y - H / 2), pad = 2;
    var latOf = function (y) { return Math.atan(Math.sinh(Math.PI * (1 - 2 * y / world))) * 180 / Math.PI; };
    var west = L / world * 360 - 180 - pad, east = (L + W) / world * 360 - 180 + pad;
    var north = latOf(T) + pad, south = latOf(T + H) - pad;
    var g = layerCanvas(stage, 0);

    function seen(b) { return !(b[2] < west || b[0] > east || b[3] < south || b[1] > north); }
    function trace(flat) {
      for (var i = 0; i < flat.length; i += 2) {
        var q = worldPixel(flat[i + 1], flat[i], zoom), x = q.x - L, y = q.y - T;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
    }
    function fill(items, color, rule) {
      g.fillStyle = color;
      g.beginPath();
      items.forEach(function (o) {
        if (seen(o.b)) o.r.forEach(function (r) { trace(r); g.closePath(); });
      });
      g.fill(rule || "evenodd");
    }
    function coastline() {
      g.strokeStyle = "#333333";
      g.lineWidth = 0.7;
      g.beginPath();
      data.land.forEach(function (o) {
        if (seen(o.b)) o.r.forEach(function (r) { trace(r); g.closePath(); });
      });
      g.stroke();
    }
    function stroke(items, color, width, dash) {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.lineJoin = "round";
      g.lineCap = "round";
      g.setLineDash(dash || []);
      g.beginPath();
      items.forEach(function (o) { if (seen(o.b)) trace(o.p); });
      g.stroke();
      g.setLineDash([]);
    }

    g.fillStyle = "#b8c8de";
    g.fillRect(0, 0, W, H);
    fill(data.land, "#e0e0e0");
    fill(data.us, "#ffffff");
    fill(data.lakes, "#b8c8de", "nonzero");
    coastline();
    if (cond.roads) {
      stroke(data.roads, "#e2ddd0", 0.8);
      stroke(data.majorRoads, "#b9a57a", 1.6);
    }
    stroke(data.states, "#8a8a8a", 0.9);
    stroke(data.borders, "#555555", 1.1);

    /* This layer sits above the rainfall areas and repaints everything outside
       the US, plus lakes, which crops the rainfall at water and the border. */
    g = layerCanvas(stage, 2);
    g.save();
    g.beginPath();
    g.rect(0, 0, W, H);
    data.us.forEach(function (o) {
      if (seen(o.b)) o.r.forEach(function (r) { trace(r); g.closePath(); });
    });
    g.clip("evenodd");
    g.fillStyle = "#b8c8de";
    g.fillRect(0, 0, W, H);
    fill(data.land, "#e0e0e0");
    g.restore();
    fill(data.lakes, "#b8c8de", "nonzero");
    coastline();
    var cropStats = measureCrop(g);
    /* State lines are drawn above the rainfall areas so they stay prominent. */
    stroke(data.states, "#3a3a3a", 1.7);
    stroke(data.borders, "#3a3a3a", 1.9);

    /* Labels sit on their own layer above the rainfall areas so they stay readable. */
    g = layerCanvas(stage, 3);
    g.textBaseline = "middle";
    var taken = [], stats = { citiesLabeled: 0, nearestCityPx: null, routeMarkers: 0, rainVisiblePct: cropStats.rainVisiblePct, centerVisible: cropStats.centerVisible };
    function clash(b) {
      return taken.some(function (t) {
        return b[0] < t[0] + t[2] && b[0] + b[2] > t[0] && b[1] < t[1] + t[3] && b[1] + b[3] > t[1];
      });
    }

    if (cond.cities) {
      /* Same maximum everywhere. Largest places first, kept apart so labels spread out. */
      var chosen = [];
      data.places.forEach(function (p) {
        if (chosen.length >= MAX_CITIES) return;
        var q = worldPixel(p[2], p[1], zoom), x = q.x - L, y = q.y - T;
        if (x < 6 || x > W - 6 || y < 8 || y > H - 22) return;
        if (chosen.some(function (o) { return Math.hypot(o.x - x, o.y - y) < 70; })) return;
        var big = p[3] >= 500000;
        g.font = (big ? "700 13px" : "12px") + " Arial,Helvetica,sans-serif";
        var w = g.measureText(p[0]).width, left = x + 6 > W - w - 4 ? x - 6 - w : x + 6;
        var box = [Math.min(x - 4, left) - 3, y - 10, w + 14, 20];
        if (clash(box)) return;
        taken.push(box);
        chosen.push({ x: x, y: y });
        g.fillStyle = "#3e4c59";
        g.beginPath();
        g.arc(x, y, big ? 3 : 2.3, 0, 7);
        g.fill();
        g.lineWidth = 3;
        g.strokeStyle = "rgba(255,255,255,.9)";
        g.strokeText(p[0], left, y);
        g.fillStyle = "#29323c";
        g.fillText(p[0], left, y);
      });
      stats.citiesLabeled = chosen.length;
      chosen.forEach(function (o) {
        var d = Math.hypot(o.x - W / 2, o.y - H / 2);
        if (stats.nearestCityPx === null || d < stats.nearestCityPx) stats.nearestCityPx = d;
      });
    }

    if (cond.roads) {
      /* One marker per route, placed along the route rather than toward map center,
         so markers do not reveal the center. */
      var routes = {};
      data.majorRoads.concat(data.roads).forEach(function (o) {
        if (!o.l || !o.n || !seen(o.b)) return;
        var key = o.l + o.n, route = routes[key] || (routes[key] = { l: o.l, n: o.n, pts: [] });
        for (var i = 0; i < o.p.length; i += 2) {
          var q = worldPixel(o.p[i + 1], o.p[i], zoom), x = q.x - L, y = q.y - T;
          if (x >= 26 && x <= W - 26 && y >= 14 && y <= H - 26) route.pts.push([x, y]);
        }
      });
      var list = Object.keys(routes).map(function (k) { return routes[k]; }).filter(function (r) { return r.pts.length; });
      list.forEach(function (r) {
        var xs = r.pts.map(function (p) { return p[0]; }), ys = r.pts.map(function (p) { return p[1]; });
        var dx = Math.max.apply(null, xs) - Math.min.apply(null, xs), dy = Math.max.apply(null, ys) - Math.min.apply(null, ys);
        r.span = Math.hypot(dx, dy);
        var axis = dx > dy ? 0 : 1;
        r.pts.sort(function (a, b) { return a[axis] - b[axis]; });
      });
      list.sort(function (a, b) { return (a.l === "I" ? 0 : 1) - (b.l === "I" ? 0 : 1) || b.span - a.span; });
      var markers = [];
      g.font = "700 11px Arial,Helvetica,sans-serif";
      list.forEach(function (r) {
        if (markers.length >= MAX_ROUTE_MARKERS) return;
        var text = (r.l === "I" ? "I-" : "US ") + r.n, w = g.measureText(text).width + 10;
        var tries = [0.5, 0.35, 0.65, 0.2, 0.8];
        for (var t = 0; t < tries.length; t++) {
          var p = r.pts[Math.floor(tries[t] * (r.pts.length - 1))], x = p[0], y = p[1], b = [x - w / 2 - 2, y - 10, w + 4, 20];
          if (clash(b) || markers.some(function (o) { return Math.hypot(o[0] - x, o[1] - y) < 80; })) continue;
          taken.push(b);
          markers.push([x, y]);
          g.fillStyle = r.l === "I" ? "#1d4f91" : "#ffffff";
          g.strokeStyle = r.l === "I" ? "#ffffff" : "#29323c";
          g.lineWidth = 1.2;
          g.beginPath();
          g.rect(x - w / 2, y - 8, w, 16);
          g.fill();
          g.stroke();
          g.fillStyle = r.l === "I" ? "#ffffff" : "#29323c";
          g.textAlign = "center";
          g.fillText(text, x, y + 0.5);
          g.textAlign = "start";
          break;
        }
      });
      stats.routeMarkers = markers.length;
    }
    return stats;
  }

  function overlaySvg(markerLabel, showMarker) {
    var tx = W / 2, ty = H / 2;
    var contours = CATEGORIES.map(function (c) {
      return '<path data-category="' + c.id + '" d="' + smoothPath(CONTOURS[c.id]) + '" fill="' + c.fill + '"/>';
    }).join("");
    var outlines = CATEGORIES.map(function (c) {
      return '<path d="' + smoothPath(CONTOURS[c.id]) + '" fill="none" stroke="' + c.line + '" stroke-width="2" vector-effect="non-scaling-stroke"/>';
    }).join("");
    var label = String(markerLabel).replace(/[&<>"]/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch];
    });
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Map of a hypothetical rainfall outlook">' +
      '<g class="ero-contours" transform="translate(' + tx + " " + ty + ')"><g opacity="0.72">' + contours + "</g>" + outlines + "</g>" +
      (!showMarker ? "" : '<circle class="ero-safe" cx="' + W / 2 + '" cy="' + H / 2 + '" r="' + SAFE_RADIUS + '" fill="none" stroke="#111827" stroke-width="1.5" stroke-dasharray="5 4"/><circle class="ero-marker" cx="' + W / 2 + '" cy="' + H / 2 + '" r="7" fill="#111827" stroke="#fff" stroke-width="3"/>' +
      '<text x="' + W / 2 + '" y="' + (H / 2 - 14) + '" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="15" font-weight="700" fill="#111827" stroke="#fff" stroke-width="4" paint-order="stroke" stroke-linejoin="round">' + label + "</text>") + "</svg>";
  }

  function drawMap(root, place, opts, markerLabel) {
    root.innerHTML = "";
    var header = make("div", "ero-bar");
    header.appendChild(make("p", "ero-title", opts.title));
    root.appendChild(header);

    var frame = make("div", "ero-frame");
    var stage = make("div", "ero-stage");
    var attribution = make("div", "ero-attr", opts.attribution);
    frame.appendChild(stage);
    root.appendChild(frame);

    function fit() {
      var inner = frame.clientWidth || W;
      var scale = Math.min(1, inner / W);
      stage.style.transform = "scale(" + scale + ")";
      frame.style.height = H * scale + 2 + "px";
    }
    fit();
    if (window.ResizeObserver) new ResizeObserver(fit).observe(root);
    else window.addEventListener("resize", fit);

    var mapStage = loadBasemap(opts).then(function (data) {
      return { loaded: true, data: data, stats: drawBasemap(stage, data, place.lat, place.lon, opts.detail, ZOOM) };
    }, function () {
      return { loaded: false, stats: { citiesLabeled: 0, nearestCityPx: null, routeMarkers: 0, rainVisiblePct: "", centerVisible: "" } };
    });
    var layer = make("div");
    layer.innerHTML = overlaySvg(markerLabel, opts.showMarker);
    stage.appendChild(layer.firstChild);
    if (opts.attribution) frame.appendChild(attribution);

    /* Zoom-out controls. Rainfall areas scale with the map about its center. */
    if (opts.allowZoomOut) {
      var zoomNow = ZOOM, minUsed = ZOOM, clicks = 0;
      var controls = make("div", "ero-zoom");
      var outButton = make("button", null, "\u2212"), inButton = make("button", null, "+");
      outButton.type = inButton.type = "button";
      outButton.setAttribute("aria-label", "Zoom out");
      inButton.setAttribute("aria-label", "Zoom back in");
      inButton.disabled = true;
      controls.appendChild(inButton);
      controls.appendChild(outButton);
      frame.appendChild(controls);
      var setZoom = function (next) {
        zoomNow = next;
        clicks++;
        if (next < minUsed) minUsed = next;
        outButton.disabled = next <= ZOOM - opts.maxZoomOutSteps;
        inButton.disabled = next >= ZOOM;
        var k = Math.pow(2, next - ZOOM);
        var group = stage.querySelector(".ero-contours");
        group.setAttribute("transform", "translate(" + W / 2 + " " + H / 2 + ") scale(" + k + ")");
        var safe = stage.querySelector(".ero-safe");
        if (safe) safe.setAttribute("r", SAFE_RADIUS * k);
        mapStage.then(function (map) {
          if (!map.loaded) return;
          Array.prototype.slice.call(stage.querySelectorAll("canvas")).forEach(function (c) { c.parentNode.removeChild(c); });
          drawBasemap(stage, map.data, place.lat, place.lon, opts.detail, next);
        });
        if (typeof opts.onZoom === "function") {
          opts.onZoom({ zoomFinal: next, zoomMin: minUsed, zoomClicks: clicks, widthKm: Math.round(kmPerPixel(place.lat, next) * W) });
        }
      };
      outButton.addEventListener("click", function () { setZoom(zoomNow - 1); });
      inButton.addEventListener("click", function () { setZoom(zoomNow + 1); });
    }

    var legend = make("div", "ero-legend");
    legend.appendChild(make("p", "ero-legend-title", opts.legendTitle));
    var levels = make("ul", "ero-levels");
    CATEGORIES.forEach(function (c) {
      var item = make("li"), swatch = make("b", null, "Level " + c.level);
      swatch.style.background = c.fill;
      swatch.style.borderColor = c.line;
      swatch.style.color = c.text;
      item.appendChild(make("span", null, c.name));
      item.appendChild(swatch);
      levels.appendChild(item);
    });
    legend.appendChild(levels);
    root.appendChild(legend);
    return mapStage;
  }

  function askAgain(root, opts, badZip, onSubmit) {
    root.innerHTML = "";
    var form = make("form", "ero-form");
    var label = make("label", null, badZip
      ? "We could not find a map for ZIP code " + badZip + ". Please check it and enter your 5-digit ZIP code."
      : "Please enter your 5-digit ZIP code.");
    var input = make("input");
    input.type = "text";
    input.inputMode = "numeric";
    input.maxLength = 10;
    input.autocomplete = "off";
    input.setAttribute("aria-label", "ZIP code");
    var button = make("button", null, "Show map");
    button.type = "button";
    function submit() { onSubmit(input.value); }
    button.addEventListener("click", submit);
    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter") { event.preventDefault(); submit(); }
    });
    form.appendChild(label);
    form.appendChild(input);
    form.appendChild(button);
    root.appendChild(form);
    input.focus();
  }

  /* ---------- public entry point ---------- */

  function mount(container, options) {
    var opts = {};
    Object.keys(DEFAULTS).forEach(function (k) { opts[k] = DEFAULTS[k]; });
    Object.keys(options || {}).forEach(function (k) {
      if (options[k] !== undefined) opts[k] = options[k];
    });
    opts.detail = normalizeDetail(opts.detail);
    if (opts.baseUrl && !/\/$/.test(opts.baseUrl)) opts.baseUrl += "/";

    if (!document.getElementById("ero-map-styles")) {
      var style = make("style", null, CSS);
      style.id = "ero-map-styles";
      document.head.appendChild(style);
    }

    var root = make("div", "ero-root");
    container.innerHTML = "";
    container.appendChild(root);

    var retries = 0;

    function finish(place, zipStatus, zipUsed, markerLabel) {
      return drawMap(root, place, opts, markerLabel).then(function (map) {
        var kmPerPx = kmPerPixel(place.lat, ZOOM);
        var result = {
          zipStatus: zipStatus,
          zipUsed: zipUsed || "",
          lat: place.lat,
          lon: place.lon,
          kmPerPx: Number(kmPerPx.toFixed(3)),
          zipFits: place.fit || "",
          zipRadiusPx: place.radius || "",
          detail: opts.detail,
          citiesLabeled: map.stats.citiesLabeled,
          nearestCityKm: map.stats.nearestCityPx === null ? "" : Number((map.stats.nearestCityPx * kmPerPx).toFixed(1)),
          routeMarkers: map.stats.routeMarkers,
          rainVisiblePct: map.stats.rainVisiblePct,
          centerVisible: map.stats.centerVisible,
          renderStatus: map.loaded ? "ok" : "no_basemap"
        };
        if (typeof opts.onDone === "function") opts.onDone(result);
        return result;
      });
    }

    function attempt(zip) {
      root.innerHTML = "";
      root.appendChild(make("div", "ero-loading", "Loading map\u2026"));
      lookup(zip, opts).then(function (found) {
        if (found.status === "ok") {
          finish(found, retries ? "ok_after_retry" : "ok", found.zip, opts.markerLabel);
        } else if (found.status === "lookup_failed") {
          finish(opts.fallback, "fallback_lookup_failed", found.zip, opts.fallbackMarkerLabel);
        } else if (retries >= opts.maxRetries) {
          finish(opts.fallback, "fallback_not_found", found.zip || "", opts.fallbackMarkerLabel);
        } else {
          retries++;
          askAgain(root, opts, found.zip || String(zip || "").trim(), attempt);
        }
      });
    }

    attempt(opts.zip);
  }

  window.EROMap = {
    mount: mount,
    _basemap: function (raw) {
      basemapData = prepareBasemap(raw);
      basemapWaiters.forEach(function (resolve) { resolve(basemapData); });
      basemapWaiters = [];
    },
    _zips: function (digit, data) {
      shardCache[digit] = data;
      (shardWaiters[digit] || []).forEach(function (resolve) { resolve(data); });
      shardWaiters[digit] = [];
    },
    _internals: { worldPixel: worldPixel, kmPerPixel: kmPerPixel, SAFE_RADIUS: SAFE_RADIUS, CONTOURS: CONTOURS, W: W, H: H, ZOOM: ZOOM }
  };
})();
