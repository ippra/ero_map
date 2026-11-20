ERO map - Spanish survey files
==============================

The Spanish survey works exactly like the English one. The only difference
is that it loads the Spanish map (ero-map-es.js), which has a Spanish title,
legend, level names and ZIP prompts. The map is hosted at:

  https://ippra.github.io/ero_map/ero-map-es.js

The ZIP code question must be the survey's first question (internal ID QID1),
and the survey flow must set the embedded data field ero_map_detail, as in
the English survey. The map code reads both.

Block B (first map page), Text / Graphic question:
  1. JavaScript: replace everything with block_b_javascript.js.
  2. Question text, HTML View: write the Spanish question text, then paste
     the line from block_b_question.html at the end. The map appears where
     that line is.

Block C (repeated map page), Text / Graphic question:
  1. JavaScript: replace everything with block_c_javascript.js.
  2. Question text, HTML View: Spanish question text, then the line from
     block_c_question.html.

Do not type the HTML into the regular text box; use HTML View, or it shows
up as plain text.

Embedded data fields are the same as in the English survey. In the Spanish
data, ero_map_version is "2026-11-20-es".
