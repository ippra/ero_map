Qualtrics.SurveyEngine.addOnReady(function () {
  var HOST = "https://ippra.github.io/ero_map/";
  // Change this whenever the files on GitHub change, so responses can be
  // matched to the map version they saw.
  var MAP_VERSION = "2026-11-20-es";

  var question = this;
  var root = document.getElementById("ero-map-root");
  var released = false;

  function save(name, value) {
    Qualtrics.SurveyEngine.setEmbeddedData(name, String(value));
  }

  function release() {
    if (released) return;
    released = true;
    question.showNextButton();
  }

  question.hideNextButton();
  save("ero_render_status", "not_finished");
  save("ero_map_version", MAP_VERSION);
  // Zoom defaults are set here, not in onDone. The zoom buttons work before
  // the basemap finishes loading, and onDone would overwrite early clicks.
  save("ero_zoom_final", 7);
  save("ero_zoom_min", 7);
  save("ero_zoom_clicks", 0);

  // Never leave a respondent stuck, even if the map cannot finish loading.
  var failsafe = setTimeout(function () {
    save("ero_render_status", "timed_out");
    release();
  }, 45000);

  var script = document.createElement("script");
  script.src = HOST + "ero-map-es.js";
  script.onerror = function () {
    clearTimeout(failsafe);
    save("ero_render_status", "script_failed");
    root.textContent = "No se pudo cargar el mapa. Contin\u00fae con la encuesta.";
    release();
  };
  script.onload = function () {
    window.EROMap.mount(root, {
      zip: root.getAttribute("data-zip"),
      baseUrl: HOST,
      detail: root.getAttribute("data-detail"),
      onZoom: function (z) {
        save("ero_zoom_final", z.zoomFinal);
        save("ero_zoom_min", z.zoomMin);
        save("ero_zoom_clicks", z.zoomClicks);
      },
      onDone: function (r) {
        clearTimeout(failsafe);
        save("ero_zip_status", r.zipStatus);
        save("ero_zip_used", r.zipUsed);
        save("ero_lat", r.lat);
        save("ero_lon", r.lon);
        save("ero_km_per_px", r.kmPerPx);
        save("ero_zip_fits", r.zipFits);
        save("ero_zip_radius_px", r.zipRadiusPx);
        save("ero_detail_shown", r.detail);
        save("ero_cities_labeled", r.citiesLabeled);
        save("ero_nearest_city_km", r.nearestCityKm);
        save("ero_route_markers", r.routeMarkers);
        save("ero_rain_visible_pct", r.rainVisiblePct);
        save("ero_center_visible", r.centerVisible);
        // Displayed width; below 640 the whole map, labels included, shrinks.
        save("ero_map_width_px", root.clientWidth);
        save("ero_render_status", r.renderStatus);
        release();
      }
    });
  };
  document.head.appendChild(script);
});
