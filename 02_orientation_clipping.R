# Would a different single orientation of the outlook be clipped less?
#
# Every respondent sees the same graphic, rotated or mirrored the same way, so
# the question is which one fixed orientation keeps the most rainfall visible
# across lower-48 ZIPs once clipping at water and borders is applied.
# 02_orientation_clipping.js does the measuring in headless Chrome, using the
# widget's own contours and basemap; this script runs it and summarises.
#
# Results are reported two ways: each ZIP counted once, and each ZIP weighted
# by its 2020 Census population, which is closer to how respondents are spread.
#
# Population source: 2020 Decennial Census DHC, table P1 (P1_001N), by ZIP
# code tabulation area, from
# https://api.census.gov/data/2020/dec/dhc?get=P1_001N&for=zip%20code%20tabulation%20area:*
# ZCTAs are matched to lookup ZIPs on the 5-digit code. PO-box and
# single-building ZIPs have no ZCTA, so they get zero weight; their residents
# are counted in the surrounding ZCTA.
#
# Output: 02_orientation_summary.csv in the project folder.

library(dplyr)
library(tidyr)
library(readr)
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
work_dir <- file.path(tempdir(), "ero_orientation")
dir.create(work_dir, showWarnings = FALSE)

compass_points <- c("E", "NE", "N", "NW", "W", "SW", "S", "SE")

# Contours From The Widget -----------------------------------------------------

# Copied out of ero-map.js at run time so the measurement cannot drift from the
# graphic respondents see.
widget_lines <- readLines(file.path(project_dir, "ero-map.js"), warn = FALSE)
contour_start <- grep("var CONTOURS = \\{", widget_lines)
contour_end <- contour_start +
  grep("^  \\};", widget_lines[contour_start:length(widget_lines)])[1] - 1

if (length(contour_start) != 1 || is.na(contour_end)) {
  stop("CONTOURS block not found in ero-map.js.")
}

contour_js <- widget_lines[contour_start:contour_end]

# The lake-size threshold for clipping comes from the widget for the same
# reason.
lake_js <- grep("^\\s*var CLIP_LAKE_KM2 = ", widget_lines, value = TRUE)

if (length(lake_js) != 1) {
  stop("CLIP_LAKE_KM2 not found in ero-map.js.")
}

# Run Measurement --------------------------------------------------------------

# One page per lookup shard, all ten run in parallel.
for (digit in 0:9) {
  writeLines(
    c(
      "<!doctype html><html><head><meta charset=\"utf-8\"></head><body>",
      "<pre id=\"out\"></pre><script>",
      contour_js,
      lake_js,
      "var BASEMAP, SHARD_ZIPS;",
      "window.EROMap = {",
      "  _basemap: function (r) { BASEMAP = r; },",
      "  _zips: function (d, z) { SHARD_ZIPS = z; }",
      "};",
      "</script>",
      paste0("<script src=\"file://", project_dir, "/basemap.js\"></script>"),
      paste0(
        "<script src=\"file://", project_dir, "/zips/", digit,
        ".js\"></script>"
      ),
      paste0(
        "<script src=\"file://", project_dir,
        "/02_orientation_clipping.js\"></script>"
      ),
      "</body></html>"
    ),
    file.path(work_dir, paste0("shard_", digit, ".html"))
  )

  system2(
    chrome_path,
    c(
      "--headless=new", "--disable-gpu", "--allow-file-access-from-files",
      paste0(
        "--user-data-dir=",
        file.path(work_dir, paste0("profile_", digit))
      ),
      "--dump-dom",
      shQuote(paste0("file://", work_dir, "/shard_", digit, ".html"))
    ),
    stdout = file.path(work_dir, paste0("shard_", digit, ".txt")),
    stderr = FALSE,
    wait = FALSE
  )
}

# Wait for every shard to write its closing marker, up to five minutes.
for (attempt in 1:300) {
  finished <- sapply(0:9, function(digit) {
    path <- file.path(work_dir, paste0("shard_", digit, ".txt"))
    file.exists(path) &&
      any(grepl("RESULT_END", readLines(path, warn = FALSE)))
  })
  if (all(finished)) break
  Sys.sleep(1)
}

if (!all(finished)) {
  unfinished <- paste(which(!finished) - 1, collapse = ", ")
  stop("Shards ", unfinished, " did not finish.")
}

# Read Results -----------------------------------------------------------------

# Orientation index = mirror * 8 + k: rotation k * 45 degrees clockwise, mirror
# a left-right flip applied first. Index 0 is the current design.
orientation_ids <- 0:15
measure_names <- c(
  paste0("total_", orientation_ids),
  paste0("top_", orientation_ids)
)

zip_data <- tibble()

for (digit in 0:9) {
  shard_lines <- readLines(
    file.path(work_dir, paste0("shard_", digit, ".txt")),
    warn = FALSE
  )
  first_row <- grep("RESULT_START", shard_lines) + 1
  last_row <- grep("RESULT_END", shard_lines) - 1
  rows <- shard_lines[first_row:last_row]

  zip_data <- zip_data |>
    bind_rows(
      read_csv(
        I(rows),
        col_names = c("zip", "lat", "lon", measure_names),
        col_types = cols(zip = col_character(), .default = col_double())
      )
    )
}

message(
  "Measured ", nrow(zip_data), " lower-48 ZIPs; ",
  sum(is.na(zip_data)), " missing values"
)

if (anyNA(zip_data) || anyDuplicated(zip_data$zip) > 0) {
  stop("Missing or duplicated ZIPs in the measurement output.")
}

# Population Weights -----------------------------------------------------------

census_key <- Sys.getenv("CENSUS_API_KEY")

if (census_key == "") {
  stop("Set CENSUS_API_KEY in ~/.Renviron, then restart R.")
}

census_raw <- fromJSON(paste0(
  "https://api.census.gov/data/2020/dec/dhc",
  "?get=P1_001N&for=zip%20code%20tabulation%20area:*&key=", census_key
))

# The first row of the API response is the header.
pop_data <- tibble(
  zip = census_raw[-1, 2],
  pop = as.numeric(census_raw[-1, 1])
)

# Every ZIP in the lookup, any location, to find ZCTAs the lookup lacks.
lookup_zips <- character(0)

for (digit in 0:9) {
  shard_text <- readLines(
    file.path(project_dir, "zips", paste0(digit, ".js")),
    warn = FALSE
  )
  shard_json <- sub("^[^{]*", "", paste(shard_text, collapse = ""))
  shard_json <- sub("\\);?\\s*$", "", shard_json)
  lookup_zips <- c(lookup_zips, names(fromJSON(shard_json)))
}

unmatched_data <- pop_data |>
  filter(!zip %in% lookup_zips)

unmatched_share <- 100 * sum(unmatched_data$pop) / sum(pop_data$pop)

message(
  "Population: ", nrow(unmatched_data), " of ", nrow(pop_data),
  " ZCTAs are missing from the ZIP lookup, holding ",
  round(unmatched_share, 2), "% of US population"
)

# Above 1% the weights would understate some places noticeably.
if (unmatched_share > 1) {
  print(unmatched_data |> arrange(desc(pop)), n = 20)
  stop("ZCTAs above have no ZIP in the lookup - their people would drop out.")
}

zip_data <- zip_data |>
  left_join(pop_data, by = "zip") |>
  mutate(pop = coalesce(pop, 0))

message(
  "Lower-48 ZIPs carry ", format(sum(zip_data$pop), big.mark = ","),
  " people; ", sum(zip_data$pop == 0), " ZIPs have no ZCTA (weight 0)"
)

# Describe Orientations --------------------------------------------------------

# The direction of the core (the highest level drawn) from the map center,
# after each transform, names the orientation. Screen y points down, so it is
# negated for compass bearings.
top_lines <- grep("^\\s*(high|moderate):", contour_js, value = TRUE) |>
  tail(1)
top_numbers <- regmatches(top_lines, gregexpr("-?\\d+", top_lines))[[1]] |>
  as.numeric()
top_x <- mean(top_numbers[c(TRUE, FALSE)])
top_y <- mean(top_numbers[c(FALSE, TRUE)])

orientation_data <- tibble(id = orientation_ids) |>
  mutate(
    mirror = id >= 8,
    rotation = (id %% 8) * 45,
    start_x = if_else(mirror, -top_x, top_x),
    core_x = start_x * cos(rotation * pi / 180) -
      top_y * sin(rotation * pi / 180),
    core_y = start_x * sin(rotation * pi / 180) +
      top_y * cos(rotation * pi / 180),
    bearing = (atan2(-core_y, core_x) * 180 / pi) %% 360,
    core_direction = compass_points[round(bearing / 45) %% 8 + 1],
    orientation = paste0(
      if_else(id == 0, "Current: ", ""),
      "core ", core_direction,
      if_else(mirror, " (mirrored)", "")
    )
  )

# Summarise --------------------------------------------------------------------

long_data <- zip_data |>
  pivot_longer(
    all_of(measure_names),
    names_to = c("area", "id"),
    names_sep = "_",
    names_transform = list(id = as.integer)
  ) |>
  pivot_wider(names_from = area, values_from = value)

# zip_ columns count each ZIP once; pop_ columns weight by 2020 population.
summary_data <- long_data |>
  group_by(id) |>
  summarise(
    frame_max = max(total),
    zip_mean_visible = mean(total),
    zip_pct_80 = 100 * mean(total >= 80),
    zip_pct_under_50 = 100 * mean(total < 50),
    zip_pct_top_50 = 100 * mean(top >= 50),
    pop_mean_visible = weighted.mean(total, pop),
    pop_pct_80 = 100 * sum(pop[total >= 80]) / sum(pop),
    pop_pct_under_50 = 100 * sum(pop[total < 50]) / sum(pop),
    pop_pct_top_50 = 100 * sum(pop[top >= 50]) / sum(pop),
    .groups = "drop"
  ) |>
  left_join(orientation_data |> select(id, orientation), by = "id") |>
  relocate(orientation, .after = id) |>
  arrange(desc(pop_mean_visible))

summary_data |>
  mutate(across(where(is.double), \(x) round(x, 1))) |>
  print(n = Inf, width = Inf)

# By Region --------------------------------------------------------------------

# Coarse bands, enough to show where each orientation wins and loses. Shown
# for the current design, core NW (id 2), and the top three by population.
region_ids <- union(c(0, 2), summary_data$id[1:3])

region_data <- long_data |>
  mutate(
    region = case_when(
      lon < -114             ~ "West Coast and Great Basin",
      lon < -100             ~ "Mountain and High Plains",
      lat < 31.5 & lon > -98 ~ "Gulf Coast and Florida",
      lon < -85              ~ "Central",
      TRUE                   ~ "East"
    )
  ) |>
  filter(id %in% region_ids) |>
  group_by(region, id) |>
  summarise(
    pop_millions = sum(pop) / 1e6,
    pop_mean_visible = weighted.mean(total, pop),
    pop_pct_80 = 100 * sum(pop[total >= 80]) / sum(pop),
    pop_pct_under_50 = 100 * sum(pop[total < 50]) / sum(pop),
    pop_top_visible = weighted.mean(top, pop),
    .groups = "drop"
  ) |>
  left_join(orientation_data |> select(id, orientation), by = "id")

region_data |>
  mutate(across(where(is.double), \(x) round(x, 1))) |>
  select(
    region, pop_millions, orientation, pop_mean_visible, pop_pct_80,
    pop_pct_under_50, pop_top_visible
  ) |>
  arrange(region, desc(pop_mean_visible)) |>
  print(n = Inf, width = Inf)

write_csv(summary_data, file.path(project_dir, "02_orientation_summary.csv"))
