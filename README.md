# Laser-cut SVG checker

Find open contours, repeated cut segments and physical-size discrepancies in an SVG drawing. This free browser tool works offline and processes files on your device.

## Run locally

Download the repository as a ZIP, extract it and open `index.html` in a modern browser. No build step, account or API key is required.

## Try the example

The example contains a 100 × 50 mm drawing, two open contours and one repeated straight cut. Enter 110 mm as the expected width to see the size discrepancy. Upload a different SVG to inspect your own drawing.

## How it works

The parser expands absolute and relative paths, subpaths, shorthand curves and standard affine transforms. It detects matching whole segments in either direction after rounding transformed coordinates to six decimals. It compares declared physical units using 96 CSS pixels per inch. Partial overlaps, equivalent curves encoded differently, clipping, text and referenced geometry need separate review. The report identifies coverage limits and caps the displayed findings at 120.

For related examples and project guidance, see the [Tint & Screen laser-cut screen guide](https://tintandscreen.co.za/architectural-screens/laser-cut-aluminium-screens/).

## License

The code and original sample geometry are available under the [MIT License](LICENSE). The Tint & Screen name and logo identify the publisher and are outside the code license. Artwork and photos you load keep their own rights.
