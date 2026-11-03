# ERO Map Survey: Qualtrics Setup Guide

Nov 3, 2026 · Joe Ripberger

## Overview

These steps rebuild the draft survey by hand in about 30 to 45 minutes. A working draft already exists in OU Qualtrics as **ERO Map Comprehension (Draft)**. It is published at https://qualtrics.ou.edu/jfe/form/SV_3TPkKxLCYv3VvaS, but it needs consent and debrief text before respondents use it. The steps assume the map files are already live on GitHub Pages.

You need:

- A Qualtrics account that allows custom JavaScript. OU accounts sign in at [qualtrics.ou.edu](https://qualtrics.ou.edu).
- The map files published online. The current address is `https://ippra.github.io/ero_map/`.
- Your IRB-approved consent and debrief text.

The survey has this order: consent, ZIP code, recorded fields, random condition, first map with two questions, second map with up to three questions, debrief.

## Part 1: Create the project

1. At [qualtrics.ou.edu](https://qualtrics.ou.edu), click **Create a new project**, then **Survey**, then **Get started**.
2. Name it `ERO Map Comprehension (Draft)`. Leave **Create a blank survey project** selected, and click **Create project**.
3. Click the **Survey options** icon on the left. Under **General**, turn off **New Survey Taking Experience**, then click **Confirm**.

Do step 3 first. The draft was built and tested in the legacy experience, and Qualtrics warns that custom code may behave differently in the new one.

## Part 2: Build the blocks and questions

Build in this order so the ZIP question keeps the internal ID `QID1`, which the map code uses. The Builder has one starting block with one question, and **Add Block** creates each new block.

### Block A: ZIP code

1. Select the starting question. Change **Question type** to **Text entry** and **Text type** to **Single line**.
2. Set the question text to `On the next page, we’re going to show you an example forecast graphic from the National Weather Service. The graphic is called the Excessive Rainfall Outlook. It shows which areas of the country are at risk of rainfall that could cause flash flooding. To make sure the graphic shows the area where you live, please confirm your 5-digit ZIP code.`
3. Under **Response requirements**, turn on **Add requirements** and choose **Force response**.
4. Turn on **Add validation**. Choose **Content type**, then **Postal code**.
5. Below the ZIP question, add a **Meta info** question. It records browser, operating system and screen resolution without showing anything to the respondent. On phones the map and its labels scale down to roughly half size, so device is a likely moderator of the detail conditions.

The consent question is added to this block last, in the final step of this part.

### Block B: First map and first questions

1. Click **Add Block**, then **Add new question**, then **Text / Graphic**.
2. Click **JavaScript** in the left panel, replace everything with the code below, and click **Save**.

```javascript
Qualtrics.SurveyEngine.addOnReady(function () {
  var HOST = "https://ippra.github.io/ero_map/";
  // Change this whenever the files on GitHub change, so responses can be
  // matched to the map version they saw.
  var MAP_VERSION = "2026-11-03";

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
  script.src = HOST + "ero-map.js";
  script.onerror = function () {
    clearTimeout(failsafe);
    save("ero_render_status", "script_failed");
    root.textContent = "The map could not be loaded. Please continue.";
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
```

3. Click the question text, then **HTML View**. Replace everything with the code below and click **Save**. Do not type HTML into the regular text box, because it will appear as plain text.

```html
<p><strong>This is a hypothetical scenario created for research. It is not a real forecast.</strong></p>
This is an example of an Excessive Rainfall Outlook, which shows which areas of the country are at risk of rainfall that could cause flash flooding.
<div id="ero-map-root" data-zip="${q://QID1/ChoiceTextEntryValue}" data-detail="${e://Field/ero_map_detail}"></div>
```

4. Add two **Multiple choice** questions to this block. Click **Edit multiple** to paste the answer choices, one per line.

**Based on this map, what is the risk of flash flooding where you live?**

```text
Not in a risk area
Marginal (Level 1)
Slight (Level 2)
Enhanced (Level 3)
Moderate (Level 4)
High (Level 5)
Not sure
```

**How confident are you in your answer to the previous question?**

```text
Not at all confident
Slightly confident
Moderately confident
Very confident
Extremely confident
```

5. Add a **Timing** question to this block. Respondents don't see it, and it records how long they spent on the page with the map.

### Block C: Repeated map and location questions

1. Click **Add Block**, then add a **Text / Graphic** question.
2. Click **JavaScript**, replace everything with the code below, and click **Save**.

```javascript
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
  script.src = HOST + "ero-map.js";
  script.onerror = function () {
    clearTimeout(failsafe);
    save("ero2_render_status", "script_failed");
    root.textContent = "The map could not be loaded. Please continue.";
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
```

3. Click the question text, then **HTML View**. Replace everything with the code below and click **Save**.

```html
<p><strong>This is a hypothetical scenario created for research. It is not a real forecast.</strong></p>
This is the same forecast graphic you saw on the previous page.
<div id="ero-map-repeat" data-zip="${e://Field/ero_zip_used}" data-zip-status="${e://Field/ero_zip_status}" data-detail="${e://Field/ero_map_detail}"></div>
```

4. Add three **Multiple choice** questions to this block, with these answer choices.

**How easy or difficult was it to find where you live on this map?**

```text
Very difficult
Somewhat difficult
Neither easy nor difficult
Somewhat easy
Very easy
```

**Do you see the name of your city or town on the map?**

```text
Yes, my city or town
No, but I see a nearby city or town I know
No
```

**Do you see a highway you recognize near where you live?**

```text
Yes
No
Not sure
```

5. Add display logic to the city and highway questions. Select the question, click **Display logic**, and set the source to **Embedded Data**. Add a second condition with the green plus button, and change **And** to **Or**. Click into each box, select its text, type the value, and press Tab.

| Question | First condition | Second condition |
| --- | --- | --- |
| City or town | `ero_map_detail` Is Equal to `cities` | Or `ero_map_detail` Is Equal to `full` |
| Highway | `ero_map_detail` Is Equal to `roads` | Or `ero_map_detail` Is Equal to `full` |

6. Add a **Timing** question to this block, as in Block B.

### Block D: Debrief

Click **Add Block**, add a **Text / Graphic** question, and enter your IRB-approved debrief text.

### Consent

Return to Block A and select the ZIP question. Click the blue plus above it, and change the new question to **Text / Graphic**. Enter your IRB-approved consent text, then click **Add page break** between it and the ZIP question.

In the current published survey, this placeholder is in the Trash, so there is no consent page. The page described here is text only. An agree or decline choice would need its own question and logic to end the survey for people who decline.

## Part 3: Set up the survey flow

The fields and randomizer must sit after Block A and before Block B. Otherwise, the map cannot read its condition, and its data may not be saved.

1. Click the **Survey flow** icon on the left.
2. Under the block containing the ZIP question, click **Add Below**, then **Embedded Data**.
3. Type each field name below. Press Tab, then click **Add a New Field**. Leave all values blank.

```text
ero_zip_status
ero_zip_used
ero_lat
ero_lon
ero_km_per_px
ero_zip_fits
ero_zip_radius_px
ero_detail_shown
ero_cities_labeled
ero_nearest_city_km
ero_route_markers
ero_rain_visible_pct
ero_center_visible
ero_zoom_final
ero_zoom_min
ero_zoom_clicks
ero_render_status
ero_map_width_px
ero_map_version
ero2_zoom_final
ero2_zoom_min
ero2_zoom_clicks
ero2_render_status
```

4. Under that element, click **Add Below**, then **Randomizer**.
5. Under the randomizer, click **Add a New Element Here**, then **Embedded Data**.
6. Type `ero_map_detail`, press Tab, click **Set a Value Now**, and type `minimal`.
7. Click **Duplicate** three times, then change the three copies to `cities`, `roads`, and `full`.
8. Set the randomizer to present **1** element and check **Evenly Present Elements**. Each duplicate raises the count, so set the count after duplicating.
9. Confirm the order, then click **Apply**:
   1. Block with consent and ZIP
   2. Embedded Data, with 23 fields
   3. Randomizer, with 4 Embedded Data elements
   4. First map block
   5. Repeated map block
   6. Debrief block

### What each field does

Embedded Data fields are extra columns in your dataset. One field assigns the condition, and the rest record what the map did. Distances and sizes describe the map's starting view unless noted.

| Field | What it records | Why it matters |
| --- | --- | --- |
| `ero_map_detail` | Assigned condition: `minimal`, `cities`, `roads`, or `full` | The map uses it to decide what to draw, and it controls the city and highway questions. |
| `ero_zip_status` | ZIP result: `ok`, `ok_after_retry`, `fallback_not_found`, or `fallback_lookup_failed`; blank if they left before the map finished | A `fallback` respondent saw a default map, so their location answers aren't meaningful. Blank can happen when the 45-second failsafe shows **Next** while they are still re-entering a ZIP. |
| `ero_zip_used` | ZIP behind the map | It can differ from the first entry after a retry, and the repeated map uses it. |
| `ero_lat`, `ero_lon` | Latitude and longitude at map center | These link responses to geography. With ZIP, they can raise identifiability concerns. |
| `ero_km_per_px` | Kilometers per map pixel at that latitude | Scale varies by location, so this works as a control. |
| `ero_zip_fits` | `yes` if the whole ZIP is inside Slight, `no` if it is too large, `unknown` if it has no boundary data | It shows how confidently Slight is the correct answer. |
| `ero_zip_radius_px` | Size of a too-large ZIP in map pixels; otherwise blank | It shows how far a `no` ZIP extends past the safe area. |
| `ero_detail_shown` | Condition actually drawn | It should match `ero_map_detail`, so it checks the manipulation. |
| `ero_cities_labeled` | Number of city labels drawn | Rural maps can show fewer than the maximum of 14. |
| `ero_nearest_city_km` | Distance from map center to the nearest labeled city; blank if none | It is a control for how easy self-location was. |
| `ero_route_markers` | Number of highway markers drawn | The maximum is 10, and it is 0 without roads. |
| `ero_rain_visible_pct` | Percent of the rainfall area left after cropping | Coastal and border maps show less, so it is a control or exclusion measure. |
| `ero_center_visible` | `no` if map center falls on water or outside the US | That respondent has no risk color at center, so consider excluding them. |
| `ero_zoom_final` | Zoom when they left the page: 7 is the start, 6 and 5 are zoomed out | It shows the view they ended on. |
| `ero_zoom_min` | Farthest zoom reached | It shows whether they zoomed out, even if they returned. |
| `ero_zoom_clicks` | Number of zoom button clicks | It measures how much they used zoom. |
| `ero_render_status` | Map loading: `ok`, `no_basemap`, `timed_out`, `script_failed`, or `not_finished` | Anything but `ok` means they may not have seen the full map. |
| `ero_map_width_px` | Width the map was displayed at, in pixels | At 640 the map is full size. Narrower maps scale everything down, so city and route labels get small on phones. |
| `ero_map_version` | The `MAP_VERSION` set in the Block B code | It identifies which version of the GitHub files a respondent saw. |
| `ero2_zoom_final`, `ero2_zoom_min`, `ero2_zoom_clicks` | The same zoom measures for the repeated map | These keep the second map's zoom data separate from the first. |
| `ero2_render_status` | Whether the repeated map loaded | Anything but `ok` means they may not have seen it on page 2. |

For a first analysis, use `ero_map_detail` as the treatment. Then filter on `ero_zip_status`, `ero_render_status`, `ero_zip_fits`, and `ero_center_visible`.

## Part 4: Check options and test

Under **Survey options > Responses**, confirm that **Back button** is off. It was off by default in the draft.

Click **Preview**, and use **Restart Survey** until you have seen all four conditions.

- [ ] An invalid ZIP such as `abcde` is rejected, and a valid ZIP loads a map.
- [ ] Both map pages show the same location, and the warning appears above each.
- [ ] The − and + zoom buttons work, and the map stays centered. − zooms out to 6 and then 5; + returns toward 7, where it greys out.
- [ ] **Minimal:** no city names or highways, and no city or highway question.
- [ ] **Cities:** city names appear, and only the city question appears.
- [ ] **Roads:** highways appear, and only the highway question appears.
- [ ] **Full:** cities and highways appear, and both questions appear.
- [ ] `00000`: the map asks for the ZIP twice, then shows the default map, and `ero_zip_status` is `fallback_not_found`.
- [ ] `33139` (Miami Beach): the map center is over water, and `ero_center_visible` is `no`.
- [ ] `00501` (a ZIP with no boundary): `ero_zip_fits` is `unknown`.
- [ ] `89049` (rural Nevada): `ero_zip_fits` is `no`.
- [ ] Zoom out before the map finishes loading, then continue: the `ero_zoom_` fields keep the clicks.
- [ ] `ero_map_width_px`, `ero_map_version`, Meta Info and Timing all appear in the recorded response.

Confirmed so far: the Minimal and Roads conditions, the Full condition's map, and saved data from a recorded preview response. Still to check: the Cities map, the city and highway questions in the Cities and Full conditions, and the live link.

A completed preview can appear as a recorded response, so delete test responses before analysis. After publishing, submit a test response, confirm that the `ero_` fields appear in **Data & Analysis**, and delete it. Then try the live link on a real phone.

## If something goes wrong

| What you see | Likely cause | Fix |
| --- | --- | --- |
| HTML tags show as text | HTML was typed into the regular text box | Reenter it through **HTML View** |
| "The map could not be loaded" | `HOST` is wrong, or the site is down | Check `HOST`, and open `test.html` directly. It shows the same map as the survey, without the questions. |
| Map asks for the ZIP again | The ZIP question is not `QID1`, or the ZIP is unknown | Replace the `${q://...}` value using **Piped Text** |
| Every respondent sees Full | `ero_map_detail` is blank, or the randomizer is after the map | Fix the order in Part 3 |
| Flow fields show "Create New Field" | The names were entered too quickly | Click **Revert**, then enter them one at a time |
| Survey has the new look | The new experience is still on | Repeat Part 1, step 3 |
| No map appears on the first map page | Editing the question text removed the map container | In HTML View, restore the ero-map-root or ero-map-repeat div, then publish |

## Before publishing

- [ ] Replace the consent and debrief placeholders.
- [ ] Add an agree or decline choice if your IRB requires one.
- [ ] Decide whether the other questions should be required.
- [ ] Fix the phone legend, where "Enhanced" and "Moderate" run together. At 343 px they were tight but separate; narrower phones or Qualtrics margins may merge them.
- [ ] Decide how to handle phones. City and route labels render at about 6 px on a phone-width map, so the detail manipulation is weaker there. Options are restricting to desktop, enlarging labels on narrow maps, or analyzing by `ero_map_width_px`.
- [ ] Review the route labels for your main sample areas.
- [ ] Decide exclusion rules in advance for coastal and island ZIPs. Honolulu showed 2% of the rainfall area, and San Juan and Miami Beach had the center over water. A cutoff such as `ero_center_visible = yes` and `ero_rain_visible_pct >= 50` belongs in the analysis plan.
- [ ] If you use a panel, add ID capture and the end-of-survey redirect. Consider Qualtrics bot detection and duplicate prevention.
- [ ] Stop changing the GitHub files before data collection, because changes reach respondents right away. If you must change them, update `MAP_VERSION` in Block B at the same time.
