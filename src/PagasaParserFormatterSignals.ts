import {
    Area,
    areaIsMainland,
    areaIsPart,
    areaIsRestOf,
    areaIsWhole,
    Bulletin,
    PagasaParserFormatter
} from "pagasa-parser";
import {TCWSLevels} from "pagasa-parser/build/typedefs/Bulletin";
import cheerio from "cheerio";
import * as path from "path";
import * as fs from "fs";
import escapeForCss from "./util/escapeForCss";
import {makeAbsolute, parseSVG} from "svg-path-parser";
import svgpath from "svgpath";
import {hasOverlap2D} from "./util/hasOverlap";
import resizeToAspectRatio from "./util/resizeToAspectRatio";

interface PagasaParserFormatterSignalsOptions {
    colors: Partial<PagasaParserFormatterSignals["colors"]>;
}

export type Bounds = { x1: number, x2: number, y1: number, y2: number };

interface CompletePadding {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

interface BoundingBoxOptions {
    padding: CompletePadding | {
        vertical: number;
        horizontal: number;
    } | number;
}

export default class PagasaParserFormatterSignals extends PagasaParserFormatter<Buffer> {

    static readonly defaultPadding: CompletePadding = {
        top: 500, right: 500, bottom: 500, left: 500
    };

    public readonly colors: { [key in keyof TCWSLevels]: string } = {
        1: "#00aaff",
        2: "#fff200",
        3: "#ffaa00",
        4: "#ff0000",
        5: "#cd00cd"
    };

    static areaId(area: string, parentArea: string = null): string {
        if (parentArea == null)
            return area
                .replace(/ /g, "_");
        else
            return `${parentArea
                .replace(/ /g, "_")
            }+${area
                .replace(/ /g, "_")
            }`;
    }

    constructor(options: Partial<PagasaParserFormatterSignalsOptions> = {}) {
        super();

        if (options.colors) {
            Object.assign(this.colors, options.colors);
        }
    }

    async format(bulletin: Bulletin): Promise<Buffer> {
        const $ = cheerio.load(
            fs.readFileSync(path.resolve(__dirname, "..", "assets", "map.svg"))
                .toString("utf8"),
            { xmlMode: true }
        );

        this.colorAreas($, bulletin);
        this.cropToBox($, this.findBoundingBox($));

        return Buffer.from($.xml());
    }

    colorAreas($: cheerio.Root, bulletin: Bulletin): void {

        for (const [signal, data] of Object.entries(bulletin.signals)) {
            if (data == null) continue;
            for (const [, areas] of Object.entries(data.areas)) {
                for (const area of areas) {
                    this.processArea($, <keyof TCWSLevels><unknown>signal, area);
                }
            }
        }
    }

    processArea($: cheerio.Root, signal: keyof TCWSLevels, area: Area): void {
        const forMarking: cheerio.Cheerio[] = [];

        if (areaIsWhole(area) || areaIsMainland(area)) {
            forMarking.push($(`#${escapeForCss(PagasaParserFormatterSignals.areaId(area.name))}`));

            if (area.name.endsWith("Island"))
                forMarking.push($(`#${escapeForCss(PagasaParserFormatterSignals.areaId(area.name))}s`));
        } else if (areaIsPart(area) || areaIsRestOf(area)) {
            if (area.includes.objects != null) {
                for (const part of area.includes.objects) {
                    forMarking.push($(`#${escapeForCss(
                        PagasaParserFormatterSignals.areaId(part, area.name)
                    )}`));
                }
            } else {
                forMarking.push($(`#${escapeForCss(PagasaParserFormatterSignals.areaId(area.name))}`));
            }
        }

        for (const toMark of forMarking) {
            toMark.attr("fill", this.colors[signal]);
            toMark.attr("data-tcws-level", `${signal}`);
        }
    }

    findBoundingBox($: cheerio.Root, options: Partial<BoundingBoxOptions> = {}): Bounds {
        const $svg = $("svg");

        const height = +$svg.attr("height");
        const width = +$svg.attr("width");
        let x1: number, x2: number, y1: number, y2: number;

        const padding: { top: number, right: number, bottom: number, left: number } = Object.assign(
            {}, PagasaParserFormatterSignals.defaultPadding
        );
        if (options.padding) {
            padding.top = (options.padding as any).top
                ?? (options.padding as any).vertical
                ?? options.padding ?? padding.top;
            padding.bottom = (options.padding as any).bottom
                ?? (options.padding as any).vertical
                ?? options.padding ?? padding.bottom;
            padding.left = (options.padding as any).left
                ?? (options.padding as any).horizontal
                ?? options.padding ?? padding.left;
            padding.right = (options.padding as any).right
                ?? (options.padding as any).horizontal
                ?? options.padding ?? padding.right;
        }

        $("[data-tcws-level]").each((_, path) => {
            const $path = $(`#${escapeForCss((path as any).attribs.id)}`);
            const d = makeAbsolute(parseSVG($path.attr("d")));

            for (const command of d) {
                if (x1 == null || x1 > command.x) x1 = command.x;
                if (x2 == null || x2 < command.x) x2 = command.x;
                if (y1 == null || y1 > command.y) y1 = command.y;
                if (y2 == null || y2 < command.y) y2 = command.y;
            }
        });

        // Perform padding transforms and clamp to area within box.
        x1 = Math.max(0, x1 - padding.left);
        x2 = Math.min(width, x2 + padding.right);
        y1 = Math.max(0, y1 - padding.top);
        y2 = Math.min(height, y2 + padding.bottom);

        // Force 16:9 aspect ratio.
        const toResize = resizeToAspectRatio(16/9, { x1, x2, y1, y2 });
        console.log({ x1, x2, y1, y2, toResize });
        x1 -= toResize.x / 2;
        x2 += toResize.x / 2;
        y1 -= toResize.y / 2;
        y2 += toResize.y / 2;
        console.log({ x1, x2, y1, y2 });

        return { x1, x2, y1, y2 };
    }

    cropToBox($: cheerio.Root, bounds: Bounds): void {
        // Find all paths and translate position depending on x1 and y1.
        $("path").each((_, path) => {
            const $path = $(`#${escapeForCss((path as any).attribs.id)}`);

            let x1: number = null, x2: number = null, y1: number = null, y2: number = null;
            const d = makeAbsolute(parseSVG($path.attr("d")));

            for (const command of d) {
                if (x1 == null || x1 > command.x) x1 = command.x;
                if (x2 == null || x2 < command.x) x2 = command.x;
                if (y1 == null || y1 > command.y) y1 = command.y;
                if (y2 == null || y2 < command.y) y2 = command.y;
            }

            if (!hasOverlap2D(bounds, { x1, x2, y1, y2 })) {
                $path.remove();
                return;
            }

            $path.attr("d",
                svgpath($path.attr("d"))
                    .translate(-bounds.x1, -bounds.y1)
                    .round(2)
                    .toString()
            );
        });

        const $svg = $("svg");
        const newWidth = bounds.x2 - bounds.x1;
        const newHeight = bounds.y2 - bounds.y1;
        $svg.attr("width", `${newWidth.toFixed(2)}`);
        $svg.attr("height", `${newHeight.toFixed(2)}`);
        $svg.attr("viewBox", `0 0 ${newWidth.toFixed(2)} ${newHeight.toFixed(2)}`);
    }

}
