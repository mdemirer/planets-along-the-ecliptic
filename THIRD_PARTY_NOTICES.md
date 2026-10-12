# Third-party notices

This project bundles the components below. Each keeps its own licence; the full texts are in this repository.

| Component | Used for | Licence | Copyright | Licence text |
|---|---|---|---|---|
| [Astronomy Engine](https://github.com/cosinekitty/astronomy) 2.1.19 | planet and Sun positions | MIT | © 2019–2023 Don Cross | [vendor/licenses/astronomy-engine-LICENSE.txt](vendor/licenses/astronomy-engine-LICENSE.txt), also at the top of `vendor/astronomy.browser.min.js` |
| [jsPDF](https://github.com/parallax/jsPDF) 4.2.1 | building the PDF files | MIT | © 2010–2025 James Hall; © 2015–2025 yWorks GmbH | [vendor/licenses/jsPDF-LICENSE.txt](vendor/licenses/jsPDF-LICENSE.txt) |
| [svg2pdf.js](https://github.com/yWorks/svg2pdf.js) 2.8.1 | converting the chart SVG to PDF | MIT | © 2015–2026 yWorks GmbH; © 2013–2015 Vitaly Puzrin | [vendor/licenses/svg2pdf.js-LICENSE.txt](vendor/licenses/svg2pdf.js-LICENSE.txt) |
| [Jost](https://github.com/indestructible-type/Jost) | typeface on the page and in the PDFs | SIL Open Font License 1.1 | © 2020 The Jost Project Authors | [fonts/OFL.txt](fonts/OFL.txt) |

Notes

- The vendored JavaScript files are the unmodified distribution builds from npm. The jsPDF build contains small third-party pieces under permissive licences; their notices are kept in the file's own comments.
- `fonts/Jost-Regular.ttf` and `fonts/Jost-SemiBold.ttf` are static instances (weights 400 and 600) made from the variable font `Jost[wght].ttf` published in the [Google Fonts repository](https://github.com/google/fonts/tree/main/ofl/jost). The font names are unchanged and the fonts are distributed under the same licence. The OFL allows the fonts to be embedded in the generated PDFs.
- The chart layout, planet symbols, colours and all other code are original to this project. No third-party images, logos or map data are included.
- The planetary theory behind Astronomy Engine (VSOP87, Bretagnon and Francou, 1988) is published science; no data files are distributed beyond the library itself.
