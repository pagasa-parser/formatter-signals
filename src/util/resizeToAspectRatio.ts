import {Bounds} from "../PagasaParserFormatterSignals";

/**
 * Resize a box to fit a certain ratio.
 * @param ratio The ratio to follow.
 * @param box The box to resize.
 * @returns The X and Y that should be added/substracted to the box to fit a given ratio.
 */
export default function(ratio: number, box: Bounds): { x: number, y: number } {
    const width = box.x2 - box.x1;
    const height = box.y2 - box.y1;
    const currentRatio = width / height;

    if (ratio >= 1) {
        // Landscape mode.
        if (currentRatio < 1) {
            // Portrait, need to increase width.
            return {
                x: (height * ratio) - width,
                y: 0,
            };
        } else if (currentRatio > ratio) {
            // Landscape, need to increase height.
            return {
                x: 0,
                y: (width / ratio) - height,
            };
        } else {
            // Landscape, need to increase height.
            return {
                x: 0,
                y: (width / ratio) - height,
            };
        }
    } else {
        // Portrait mode.
        if (currentRatio > 1) {
            // Landscape, need to increase height.
            return {
                x: 0,
                y: (width * ratio) - height,
            };
        } else if (currentRatio < ratio) {
            // Portrait, need to increase width.
            return {
                x: (height / ratio) - width,
                y: 0,
            };
        } else {
            // Portrait, need to increase height.
            return {
                x: 0,
                y: (width / ratio) - height,
            };
        }
    }
}
