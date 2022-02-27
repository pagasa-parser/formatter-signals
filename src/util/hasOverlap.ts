import {Bounds} from "../PagasaParserFormatterSignals";

export function hasOverlap1D(
    xmin1: number,
    xmax1: number,
    xmin2: number,
    xmax2: number
): boolean {
    return xmax1 >= xmin2 && xmax2 >= xmin1;
}

export function hasOverlap2D(box1: Bounds, box2: Bounds): boolean {
    return hasOverlap1D(box1.x1, box1.x2, box2.x1, box2.x2)
        && hasOverlap1D(box1.y1, box1.y2, box2.y1, box2.y2);
}
