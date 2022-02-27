# @pagasa-parser/formatter-signals
[![npm version](https://img.shields.io/npm/v/@pagasa-parser/formatter-signals.svg?style=flat-square)](https://www.npmjs.org/package/@pagasa-parser/formatter-signals)
[![npm downloads](https://img.shields.io/npm/dm/@pagasa-parser/formatter-signals.svg?style=flat-square)](http://npm-stat.com/charts.html?package=@pagasa-parser/formatter-signals)

This plugin for [pagasa-parser](https://github.com/pagasa-parser/pagasa-parser) allows for the
creation of colored SVG maps with appropriate legends including a province's current Tropical
Cyclone Warning System level. It is aimed to be a faithful recreation of the PAGASA-provided
signal maps, albeit with a higher (vectorized) quality and configurability.

Some processing is done in different stages of execution:
* Pre-runtime:
  * Initializing static features of the map, such as changing its background color.
  * Building the package for use.
* Runtime:
  * Actual execution and processing of the Bulletin object.
  * Changing the colors of each province on the map to their respective TCWS levels.
  * Cropping the map only to include parts which have raised signals, with extra space for legends.
  * Changing the stroke width for municipalities and provinces for clarity on smaller scales.
  * Adding the legends and province names.
  * Rendering the image, if creating a raster file.
