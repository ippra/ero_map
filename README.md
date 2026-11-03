# ero-map

Map code and public data for a survey experiment on Excessive Rainfall Outlook map comprehension. All scenarios are hypothetical research stimuli, not real forecasts.

## Files

| File | What it is |
| --- | --- |
| `ero-map.js` | The map widget the survey loads. `EROMap.mount(container, options)`; no dependencies. |
| `basemap.js`, `zips/` | Basemap geometry and the ZIP code lookup, loaded by the widget. |
| `test.html` | Preview of the map as it appears in the survey. Enter a ZIP code and pick a condition. |
| `ERO_Map_Qualtrics_Setup_Guide.md` | How to build the survey in Qualtrics, the recorded fields, and the test checklist. |
| `01_example_maps.R` | Renders `01_example_maps.png`: the map for 32 ZIP codes on one page. |
| `02_orientation_clipping.R`, `.js` | Measures how much of the outlook coasts and borders crop under 16 orientations, weighted by 2020 population. Writes `02_orientation_summary.csv`. |

The R scripts need R, Google Chrome, and a `CENSUS_API_KEY` in `~/.Renviron` (for `02`). Changes pushed to `ero-map.js`, `basemap.js` or `zips/` reach survey respondents immediately through GitHub Pages.

## Sources

Map data: Natural Earth (public domain). ZIP boundaries: 2010 Census ZCTAs via OpenDataDE/State-zip-code-GeoJSON. ZIP list and coordinates: seanpianka/zipcodes (MIT), drawing on GeoNames (CC BY 4.0), USPS, and unitedstateszipcodes.org. Population weights: 2020 Decennial Census DHC, table P1, by ZCTA.
