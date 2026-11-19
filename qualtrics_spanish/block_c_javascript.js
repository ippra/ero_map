Qualtrics.SurveyEngine.addOnReady(function () {
  var HOST = "https://ippra.github.io/ero_map/";

  var question = this;
  var root = document.getElementById("ero-map-repeat");
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
  save("ero2_render_status", "not_finished");
  save("ero2_zoom_final", 7);
  save("ero2_zoom_min", 7);
  save("ero2_zoom_clicks", 0);

  var failsafe = setTimeout(function () {
    save("ero2_render_status", "timed_out");
    release();
  }, 45000);

  var script = document.createElement("script");
  script.src = HOST + "ero-map-es.js";
  script.onerror = function () {
    clearTimeout(failsafe);
    save("ero2_render_status", "script_failed");
    root.textContent = "No se pudo cargar el mapa. Contin\u00fae con la encuesta.";
    release();
  };
  script.onload = function () {
    // Reuses the ZIP from the first map and never asks for it again.
    var usedFallback = root.getAttribute("data-zip-status").indexOf("fallback") === 0;
    window.EROMap.mount(root, {
      zip: usedFallback ? "" : root.getAttribute("data-zip"),
      maxRetries: 0,
      detail: root.getAttribute("data-detail"),
      baseUrl: HOST,
      onZoom: function (z) {
        save("ero2_zoom_final", z.zoomFinal);
        save("ero2_zoom_min", z.zoomMin);
        save("ero2_zoom_clicks", z.zoomClicks);
      },
      onDone: function (r) {
        clearTimeout(failsafe);
        save("ero2_render_status", r.renderStatus);
        release();
      }
    });
  };
  document.head.appendChild(script);
});
