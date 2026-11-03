/* Measures, for every lower-48 ZIP in one lookup shard, how much of the
   rainfall outlook survives clipping under 16 candidate orientations.
   Run by 02_orientation_clipping.R, which defines CONTOURS and CLIP_LAKE_KM2
   (copied from ero-map.js), SHARD_ZIPS and BASEMAP before this file loads.

   Clipping follows the widget: rainfall is visible where the screen is inside
   the US outline (even-odd rule) and outside lakes larger than CLIP_LAKE_KM2
   (the Great Lakes). Contour area pushed off the 640 x 480 frame by a
   rotation also counts as not visible. */
(function () {
  "use strict";

  var W = 640, H = 480, ZOOM = 7;
  var world = 256 * Math.pow(2, ZOOM);

  function worldPixel(lat, lon) {
    var s = Math.sin(lat * Math.PI / 180);
    return {
      x: (lon + 180) / 360 * world,
      y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * world
    };
  }

  /* Same curve as ero-map.js smoothPath(). */
  function smoothPath(points) {
    var n = points.length, d = "M" + points[0][0] + " " + points[0][1];
    for (var i = 0; i < n; i++) {
      var p0 = points[(i - 1 + n) % n], p1 = points[i];
      var p2 = points[(i + 1) % n], p3 = points[(i + 2) % n];
      d += "C" + [
        p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
        p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6,
        p2[0], p2[1]
      ].join(" ");
    }
    return d + "Z";
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

  /* Grid points inside a contour, relative to map center. Step 4 matches the
     widget's own measureCrop(); the small top level uses step 2. */
  var probe = document.createElement("canvas").getContext("2d");
  function samplePoints(points, step) {
    var path = new Path2D(smoothPath(points)), out = [];
    for (var y = -300; y <= 300; y += step) {
      for (var x = -360; x <= 360; x += step) {
        if (probe.isPointInPath(path, x, y)) out.push([x, y]);
      }
    }
    return out;
  }

  var areas = {
    total: samplePoints(CONTOURS.marginal, 4),
    top: samplePoints(CONTOURS.high || CONTOURS.moderate, 2)
  };

  /* Orientation index = mirror * 8 + k, rotation k * 45 degrees clockwise on
     screen, mirror flipping left-right before rotating. Index 0 is the
     current design. Each becomes a list of pixel indices, -1 if off-frame. */
  var orientations = [];
  for (var mirror = 0; mirror < 2; mirror++) {
    for (var k = 0; k < 8; k++) {
      var t = k * Math.PI / 4, c = Math.cos(t), s = Math.sin(t), o = {};
      Object.keys(areas).forEach(function (name) {
        o[name] = Int32Array.from(areas[name], function (p) {
          var x = mirror ? -p[0] : p[0], y = p[1];
          var sx = Math.round(x * c - y * s + W / 2);
          var sy = Math.round(x * s + y * c + H / 2);
          return sx < 0 || sx >= W || sy < 0 || sy >= H ? -1 : sy * W + sx;
        });
      });
      orientations.push(o);
    }
  }

  var us = BASEMAP.us.map(function (r) { return { r: r, b: bounds(r[0]) }; });
  /* Same area rule as prepareBasemap() in ero-map.js. */
  var ringKm2 = function (ring) {
    var lat = 0, n = ring.length / 2, sum = 0;
    for (var i = 1; i < ring.length; i += 2) lat += ring[i] / n;
    var kx = 111.32 * Math.cos(lat * Math.PI / 180), ky = 110.57;
    for (var j = 0; j < ring.length; j += 2) {
      var k = (j + ring.length - 2) % ring.length;
      sum += ring[j] * kx * ring[k + 1] * ky - ring[k] * kx * ring[j + 1] * ky;
    }
    return Math.abs(sum) / 2;
  };
  var lakes = BASEMAP.lakes.filter(function (r) {
    var km2 = ringKm2(r[0]);
    for (var h = 1; h < r.length; h++) km2 -= ringKm2(r[h]);
    return km2 > CLIP_LAKE_KM2;
  }).map(function (r) {
    return { r: r, b: bounds(r[0]) };
  });

  var canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  var g = canvas.getContext("2d", { willReadFrequently: true });

  function measure(lat, lon) {
    var center = worldPixel(lat, lon), pad = 2;
    var L = Math.round(center.x - W / 2), T = Math.round(center.y - H / 2);
    var latOf = function (y) {
      return Math.atan(Math.sinh(Math.PI * (1 - 2 * y / world))) * 180 / Math.PI;
    };
    var west = L / world * 360 - 180 - pad;
    var east = (L + W) / world * 360 - 180 + pad;
    var north = latOf(T) + pad, south = latOf(T + H) - pad;
    var seen = function (b) {
      return !(b[2] < west || b[0] > east || b[3] < south || b[1] > north);
    };
    var fill = function (items, colour, rule) {
      g.fillStyle = colour;
      g.beginPath();
      items.forEach(function (item) {
        if (!seen(item.b)) return;
        item.r.forEach(function (ring) {
          for (var i = 0; i < ring.length; i += 2) {
            var q = worldPixel(ring[i + 1], ring[i]);
            if (i) g.lineTo(q.x - L, q.y - T); else g.moveTo(q.x - L, q.y - T);
          }
          g.closePath();
        });
      });
      g.fill(rule);
    };

    g.fillStyle = "#000";
    g.fillRect(0, 0, W, H);
    fill(us, "#fff", "evenodd");
    fill(lakes, "#000", "nonzero");
    var px = g.getImageData(0, 0, W, H).data;

    var total = [], top = [];
    orientations.forEach(function (o) {
      ["total", "top"].forEach(function (name) {
        var idx = o[name], hit = 0;
        for (var i = 0; i < idx.length; i++) {
          if (idx[i] >= 0 && px[idx[i] * 4] > 128) hit++;
        }
        (name === "total" ? total : top).push(Math.round(100 * hit / idx.length));
      });
    });
    return total.concat(top);
  }

  /* Lower 48 only; ZIPs sharing a centroid are measured once. */
  var cache = {}, rows = [];
  Object.keys(SHARD_ZIPS).forEach(function (zip) {
    var lat = SHARD_ZIPS[zip][0], lon = SHARD_ZIPS[zip][1];
    if (lat < 24 || lat > 49.5 || lon < -125 || lon > -66.5) return;
    var key = lat + "," + lon;
    if (!cache[key]) cache[key] = measure(lat, lon);
    rows.push([zip, lat, lon].concat(cache[key]).join(","));
  });

  document.getElementById("out").textContent =
    "RESULT_START\n" + rows.join("\n") + "\nRESULT_END";
})();
