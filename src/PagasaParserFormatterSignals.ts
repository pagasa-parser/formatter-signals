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
import {scale} from "scale-that-svg";
import zeroPad from "./util/zeroPad";
import capitalize from "./util/capitalize";

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

    public readonly waterColor = "#002174";
    public readonly colors: { [key in keyof TCWSLevels]: string } = {
        1: "#00aaff",
        2: "#fff200",
        3: "#ffaa00",
        4: "#ff0000",
        5: "#cd00cd"
    };
    public readonly size: number = 4096;
    /**
     * A change in the aspect ratio will require a change in the overlay.
     * @private
     */
    private readonly aspectRatio: number = 16 / 9;

    static areaId(area: string, parentArea: string = null): string {
        if (parentArea === "Davao de Oro")
            parentArea = "Compostela Valley";

        if (parentArea == null)
            return area
                .replace(/ /g, "_");
        else
            return `${parentArea
                .replace(/ /g, "_")
            }+${area
                .replace(/^City of (.+)$/gi, "$1 City")
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
        let $ = cheerio.load(
            fs.readFileSync(path.resolve(__dirname, "..", "assets", "map.svg"))
                .toString("utf8"),
            { xmlMode: true }
        );

        // Color TCWS-affected areas.
        this.processAreas($, bulletin);
        // Crop to include only TCWS-affected areas.
        this.cropToBox($, this.findBoundingBox($));
        // Add mask to remove extra areas.
        this.addClip($);
        // Add blue background for water.
        this.addBackground($);
        // Rescale the SVG.
        $ = cheerio.load(await this.rescale($), { xmlMode: true });
        // Add the overlay
        await this.addOverlay($, bulletin);

        return Buffer.from($.xml());
    }

    processAreas($: cheerio.Root, bulletin: Bulletin): void {
        for (const [signal, data] of Object.entries(bulletin.signals).sort(
            (a, b) => +a[0] - +b[0]
        )) {
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

            // Remove all municipalities for this area (conserves space).
            $(`#Municipalities [data-province="${
                escapeForCss(area.name)
            }"]`)
                .remove();
        } else if (areaIsPart(area) || areaIsRestOf(area)) {
            if (area.includes.objects != null) {
                for (const part of area.includes.objects) {
                    forMarking.push($(`#${escapeForCss(
                        PagasaParserFormatterSignals.areaId(part, area.name)
                    )}`));
                }
            } else {
                forMarking.push($(`[data-province="${
                    escapeForCss(area.name)
                }"][data-municipality]`));
            }
        }

        for (const toMark of forMarking) {
            toMark.attr("fill", this.colors[signal]);
            toMark.attr("data-tcws-level", `${signal}`);
        }
    }

    findBoundingBox($: cheerio.Root, options: Partial<BoundingBoxOptions> = {}): Bounds {
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
        x1 = x1 - padding.left;
        x2 = x2 + padding.right;
        y1 = y1 - padding.top;
        y2 = y2 + padding.bottom;

        // Force 16:9 aspect ratio.
        const toResize = resizeToAspectRatio(this.aspectRatio, { x1, x2, y1, y2 });
        x1 -= toResize.x / 2;
        x2 += toResize.x / 2;
        y1 -= toResize.y / 2;
        y2 += toResize.y / 2;

        return { x1, x2, y1, y2 };
    }

    cropToBox($: cheerio.Root, newBounds: Bounds): void {
        // Update the SVG height and width.
        const $svg = $("svg");
        const newWidth = newBounds.x2 - newBounds.x1;
        const newHeight = newBounds.y2 - newBounds.y1;
        $svg.attr("width", `${newWidth.toFixed(2)}`);
        $svg.attr("height", `${newHeight.toFixed(2)}`);
        $svg.attr("viewBox", `0 0 ${newWidth.toFixed(2)} ${newHeight.toFixed(2)}`);

        // Update each path.
        $("path").each((_, path) => {
            // Find all paths and translate position depending on x1 and y1.
            const $path = $(`#${escapeForCss((path as any).attribs.id)}`);

            let x1: number = null, x2: number = null, y1: number = null, y2: number = null;
            const d = makeAbsolute(parseSVG($path.attr("d")));

            for (const command of d) {
                if (x1 == null || x1 > command.x) x1 = command.x;
                if (x2 == null || x2 < command.x) x2 = command.x;
                if (y1 == null || y1 > command.y) y1 = command.y;
                if (y2 == null || y2 < command.y) y2 = command.y;
            }

            if (!hasOverlap2D(newBounds, { x1, x2, y1, y2 })) {
                $path.remove();
                return;
            }

            $path.attr("d",
                svgpath($path.attr("d"))
                    .translate(-newBounds.x1, -newBounds.y1)
                    .round(2)
                    .toString()
            );

            // Thicker path lines.
            const vmax = Math.max(newHeight, newWidth);
            const provinceLineThickness = vmax * 0.0005;
            const municipalityLineThickness = vmax * 0.0001;

            if ($path.attr("id").includes("+")) {
                $path.attr("stroke-width", `${municipalityLineThickness}`);
            } else {
                $path.attr("stroke-width", `${provinceLineThickness}`);
            }
        });
    }

    addClip($: cheerio.Root): void {
        const $svg = $("svg");
        const width = $svg.attr("width");
        const height = $svg.attr("height");

        $svg.prepend(
            `<clipPath id="clip">
                <rect x="0" y="0" width="${width}" height="${height}" />
            </clipPath>`
        );
        $("#Provinces").attr("clip-path", "url(#clip)");
        $("#Municipalities").attr("clip-path", "url(#clip)");
    }

    addBackground($: cheerio.Root): void {
        const $svg = $("svg");
        const width = $svg.attr("width");
        const height = $svg.attr("height");

        $svg.prepend(
            `<rect id="Water" x="0" y="0" width="${width}" height="${height}" fill="${this.waterColor}" />`
        );
    }

    async rescale($: cheerio.Root): Promise<string> {
        const svgText = $.xml();
        const $svg = $("svg");

        const dim = +(this.aspectRatio >= 1 ? $svg.attr("width") : $svg.attr("height"));
        const scaleFactor = this.size / dim;

        return await scale(svgText, { scale: scaleFactor });
    }

    async addOverlay($: cheerio.Root, bulletin: Bulletin): Promise<void> {
        const $o = cheerio.load(
            fs.readFileSync(path.resolve(__dirname, "..", "assets", "overlay.svg"))
                .toString("utf8"),
            { xmlMode: true }
        );

        const name = `${capitalize(bulletin.cyclone.category ?? "")} ${ 
            bulletin.cyclone.internationalName && bulletin.cyclone.name
                ? `${
                    capitalize(bulletin.cyclone.internationalName)
                } (${
                    capitalize(bulletin.cyclone.name)
                })`
                : (`${capitalize(bulletin.cyclone.internationalName || bulletin.cyclone.name)}`)
        }`.trim();

        $o("#name").text(name);
        $o("#bulletinCount").text(`${bulletin.info.count}`);
        $o("#bulletinIssued").text(`${(() => {
            // By performing all calculations by translating UTC to Philippine Time,
            // we avoid the complications of compensating for the timezone of a device
            // from a non-UTC+8 timezone.
            
            const phTime = new Date(bulletin.info.issued.getTime());
            phTime.setUTCHours(phTime.getUTCHours() + 8);
            // phTime now uses UTC+8 as the UTC timezone.
            
            return `${
                zeroPad(phTime.getUTCHours())
            }:${
                zeroPad(phTime.getUTCMinutes())
            }, ${
                phTime.getUTCDate()
            } ${
                [
                    "Jan", "Feb", "Mar",
                    "Apr", "May", "Jun",
                    "Jul", "Aug", "Sep",
                    "Oct", "Nov", "Dec"
                ][phTime.getUTCMonth()]
            } ${
                phTime.getUTCFullYear()
            }`;
        })()}`);

        for (const [level, areas] of Object.entries(bulletin.signals)) {
            if (areas !== null) {
                $o("#TCWS" + level).attr("opacity", "1");
            } else {
                $o("#TCWS" + level).attr("opacity", "0.2");
            }
        }

        const overlaySVGML = $o.xml($o("#Overlay"));
        if (this.size !== 4096) {
            const $osvg = $o("svg");
            const dim = +(this.aspectRatio >= 1 ? $osvg.attr("width") : $osvg.attr("height"));
            const scaleFactor = this.size / dim;

            $("svg").append(await scale(overlaySVGML, { scale: scaleFactor }));
        } else {
            $("svg").append(overlaySVGML);
        }
    }
}
