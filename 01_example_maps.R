# Example ERO maps for 32 respondent ZIP codes, on one page.
#
# The maps are rendered by the survey widget itself (ero-map.js in headless
# Chrome) rather than redrawn in R, so the panels are exactly what a respondent
# in the full-detail condition sees. R only lays them out and marks the ZIP
# centroid, which respondents never see.
#
# Output: 01_example_maps.png in the project folder.

library(dplyr)
library(tibble)
library(ggplot2)
library(png)
library(jsonlite)

# Settings ---------------------------------------------------------------------

chrome_path <- Sys.getenv(
  "CHROME_PATH",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
)

if (!file.exists(chrome_path)) {
  stop("Chrome not found. Set CHROME_PATH in ~/.Renviron, then restart R.")
}

project_dir <- here::here()
detail <- "full"

# Spread across regions and settlement types: large metros, a suburb, small
# cities and rural towns, interior, coastal, Great Lakes and border. Listed
# roughly east to west, which is the panel order.
zip_data <- tribble(
  ~zip,    ~place,
  "04101", "Portland, ME",
  "02108", "Boston, MA",
  "10001", "New York, NY",
  "20001", "Washington, DC",
  "15222", "Pittsburgh, PA",
  "29401", "Charleston, SC",
  "32801", "Orlando, FL",
  "25301", "Charleston, WV",
  "33602", "Tampa, FL",
  "48226", "Detroit, MI",
  "30067", "Marietta, GA",
  "37203", "Nashville, TN",
  "60601", "Chicago, IL",
  "38103", "Memphis, TN",
  "70112", "New Orleans, LA",
  "63101", "St. Louis, MO",
  "55401", "Minneapolis, MN",
  "77002", "Houston, TX",
  "75201", "Dallas, TX",
  "73019", "Norman, OK",
  "68847", "Kearney, NE",
  "57701", "Rapid City, SD",
  "80202", "Denver, CO",
  "87102", "Albuquerque, NM",
  "84101", "Salt Lake City, UT",
  "85004", "Phoenix, AZ",
  "59801", "Missoula, MT",
  "89101", "Las Vegas, NV",
  "83702", "Boise, ID",
  "90012", "Los Angeles, CA",
  "94103", "San Francisco, CA",
  "98101", "Seattle, WA"
)

# Widget legend colours, at full strength as in the on-screen legend.
risk_colours <- c(
  "Marginal (Level 1)" = "#a0c587",
  "Slight (Level 2)"   = "#f9e070",
  "Enhanced (Level 3)" = "#f19c38",
  "Moderate (Level 4)" = "#d9453c",
  "High (Level 5)"     = "#c826e8"
)

# Check ZIPs Exist -------------------------------------------------------------

# Each shard is a JS call wrapping a JSON object: EROMap._zips("0",{...}).
# A ZIP missing here would render the Kansas fallback map without an error.
shard_digits <- unique(substr(zip_data$zip, 1, 1))
known_zips <- character(0)

for (digit in shard_digits) {
  shard_text <- readLines(
    file.path(project_dir, "zips", paste0(digit, ".js")),
    warn = FALSE
  )
  shard_json <- sub("^[^{]*", "", paste(shard_text, collapse = ""))
  shard_json <- sub("\\);?\\s*$", "", shard_json)
  known_zips <- c(known_zips, names(fromJSON(shard_json)))
}

missing_data <- zip_data |>
  filter(!zip %in% known_zips)

if (nrow(missing_data) > 0) {
  print(missing_data)
  stop("ZIPs above are not in the lookup - they would show the fallback map.")
}

# Render Maps ------------------------------------------------------------------

# One page mounts the widget for the ZIP in the URL hash. The title bar and
# legend are hidden so the screenshot is the map frame alone (642 x 482 px,
# a 640 x 480 map plus a 1 px border). onDone writes the widget's result into
# the page so a second, DOM-dumping run can confirm the render.
widget_url <- paste0("file://", project_dir, "/")
page_path <- file.path(tempdir(), "ero_example.html")

writeLines(
  c(
    "<!doctype html><html><head><meta charset=\"utf-8\">",
    "<style>body{margin:0;background:#fff}",
    ".ero-root{padding:0!important}.ero-frame{margin:0!important}",
    ".ero-bar,.ero-legend{display:none!important}</style></head><body>",
    "<div id=\"map\"></div><pre id=\"out\"></pre>",
    paste0("<script src=\"", widget_url, "ero-map.js\"></script>"),
    "<script>",
    "EROMap.mount(document.getElementById('map'), {",
    "  zip: location.hash.slice(1),",
    paste0("  detail: '", detail, "', baseUrl: '", widget_url, "',"),
    "  maxRetries: 0, allowZoomOut: true,",
    "  onDone: function (r) {",
    "    document.getElementById('out').textContent =",
    "      'RESULT ' + JSON.stringify(r);",
    "  }",
    "});",
    "</script></body></html>"
  ),
  page_path
)

shot_dir <- file.path(tempdir(), "ero_shots")
dir.create(shot_dir, showWarnings = FALSE)
chrome_flags <- c(
  "--headless=new", "--disable-gpu", "--hide-scrollbars",
  "--allow-file-access-from-files", "--virtual-time-budget=15000"
)

result_data <- tibble()

for (i in seq_len(nrow(zip_data))) {
  zip <- zip_data$zip[i]
  cat("Rendering", zip, "\n")
  page_url <- shQuote(paste0("file://", page_path, "#", zip))
  shot_path <- file.path(shot_dir, paste0(zip, ".png"))

  system2(
    chrome_path,
    c(
      chrome_flags,
      "--window-size=642,482",
      paste0("--screenshot=", shot_path),
      page_url
    ),
    stdout = FALSE,
    stderr = FALSE
  )

  dom <- system2(
    chrome_path,
    c(chrome_flags, "--dump-dom", page_url),
    stdout = TRUE,
    stderr = FALSE
  )
  dom <- paste(dom, collapse = "")

  if (!grepl("RESULT \\{", dom)) {
    stop("Widget did not finish rendering for ZIP ", zip, ".")
  }

  result <- fromJSON(sub(".*RESULT (\\{[^<]*\\}).*", "\\1", dom))
  result_data <- result_data |>
    bind_rows(as_tibble(result[c("zipUsed", "zipStatus", "renderStatus")]))
}

message(
  "Render: ", sum(result_data$renderStatus == "ok"), " of ",
  nrow(result_data), " maps drew the basemap; ",
  sum(result_data$zipStatus == "ok"), " found their ZIP"
)

failed_data <- result_data |>
  filter(renderStatus != "ok" | zipStatus != "ok")

if (nrow(failed_data) > 0) {
  print(failed_data)
  stop("Maps above did not render as a respondent would see them.")
}

# Read Screenshots -------------------------------------------------------------

# Each screenshot becomes one row per pixel so the panels can be faceted.
# readPNG() returns rows x columns x channels; as.vector() runs down rows
# first, which sets the order of the x and y columns below.
pixel_data <- tibble()

for (i in seq_len(nrow(zip_data))) {
  image <- readPNG(file.path(shot_dir, paste0(zip_data$zip[i], ".png")))
  height <- dim(image)[1]
  width <- dim(image)[2]

  pixel_data <- pixel_data |>
    bind_rows(
      tibble(
        zip = zip_data$zip[i],
        x = rep(seq_len(width), each = height),
        y = rep(seq_len(height), times = width),
        fill = rgb(
          as.vector(image[, , 1]),
          as.vector(image[, , 2]),
          as.vector(image[, , 3])
        )
      )
    )
}

image_sizes <- pixel_data |>
  count(zip, name = "pixels")

if (n_distinct(image_sizes$pixels) != 1) {
  print(image_sizes)
  stop("Screenshots differ in size - the centroid mark would be misplaced.")
}

# Every map is centered on its ZIP centroid, so the centroid is the middle
# pixel of each screenshot.
panel_levels <- paste0(zip_data$zip, " · ", zip_data$place)

pixel_data <- pixel_data |>
  left_join(zip_data, by = "zip") |>
  mutate(panel = factor(paste0(zip, " · ", place), levels = panel_levels))

centroid_data <- zip_data |>
  mutate(
    panel = factor(paste0(zip, " · ", place), levels = panel_levels),
    x = (max(pixel_data$x) + 1) / 2,
    y = (max(pixel_data$y) + 1) / 2
  )

# The legend is drawn from an empty layer: NA positions are dropped from the
# panels but still train the colour scale, so the key appears once below.
legend_data <- tibble(
  category = factor(names(risk_colours), levels = names(risk_colours)),
  x = NA_real_,
  y = NA_real_
)

# Figure -----------------------------------------------------------------------

example_plot <- pixel_data |>
  ggplot(aes(x = x, y = y)) +
  geom_raster(aes(fill = fill)) +
  geom_point(
    data = centroid_data,
    shape = 21,
    size = 2.6,
    stroke = 0.9,
    fill = "#000000",
    colour = "#ffffff"
  ) +
  geom_point(
    data = legend_data,
    aes(colour = category),
    shape = 15,
    na.rm = TRUE
  ) +
  scale_fill_identity() +
  scale_colour_manual(
    values = risk_colours,
    name = "Risk of flash flooding",
    drop = FALSE
  ) +
  scale_y_reverse() +
  coord_fixed(expand = FALSE) +
  facet_wrap(~ panel, ncol = 8) +
  guides(colour = guide_legend(override.aes = list(size = 10), nrow = 1)) +
  labs(
    title = "What respondents see: example Excessive Rainfall Outlook maps",
    subtitle = paste(
      "Full-detail condition (city names and highways). Hypothetical",
      "scenario created for research, not a real forecast."
    ),
    caption = paste(
      "Black dot marks the ZIP code centroid at the map center. It is shown",
      "here for reference only; respondents do not see it.\nEach map is",
      "centered on the respondent's ZIP, so the centroid falls in the Slight",
      "(Level 2) area unless it lies on water, where rainfall is clipped.",
      "Zoom buttons are part of the survey map."
    )
  ) +
  theme_void(base_size = 20) +
  theme(
    plot.title = element_text(face = "bold", size = 28),
    plot.subtitle = element_text(margin = margin(4, 0, 10, 0)),
    plot.caption = element_text(hjust = 0, margin = margin(10, 0, 0, 0)),
    plot.margin = margin(16, 16, 16, 16),
    plot.background = element_rect(fill = "#ffffff", colour = NA),
    strip.text = element_text(face = "bold", margin = margin(6, 0, 4, 0)),
    panel.spacing = unit(10, "pt"),
    legend.position = "bottom",
    legend.title = element_text(face = "bold")
  )

ggsave(
  file.path(project_dir, "01_example_maps.png"),
  example_plot,
  width = 30,
  height = 14.6,
  dpi = 160
)
