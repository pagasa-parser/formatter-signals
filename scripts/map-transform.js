/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require("fs/promises");
const path = require("path");
const axios = require("axios").default;
const cheerio = require("cheerio");

const packageJson = require("../package.json");

const ASSET_DIR = path.resolve(__dirname, "..", "assets");
const MAP_PATH = path.resolve(ASSET_DIR, "map.svg");

// Source SVG from Wikimedia Commons.
const SOURCE_SVG = "https://upload.wikimedia.org/wikipedia/commons/9/9a/Municipalities_of_the_Philippines_%28simplified%29.svg";

// Colors
const WATER_COLOR = "#002174";
const LAND_COLOR  = "#74b474";

const USER_AGENT = `${packageJson.name}/${packageJson.version} (https://github.com/pagasa-parser/formatter-signals) axios/${axios.VERSION}`;

function progressBar(indent, width, progress, extraText = "") {
    const totalWidth = indent + width;
    const leftBracketIndex = indent;
    const rightBracketIndex = totalWidth - 1;
    const progressWidth = rightBracketIndex - leftBracketIndex;

    const progressUnknown = isNaN(progress) || progress === Infinity;

    const progressCharacters = progress
        ? progressWidth
        : Math.ceil(Math.min(Math.max(progress, 0), 1) * progressWidth);
    process.stdout.write(`\r${
        " ".repeat(indent)
    }[${
        "#".repeat(progressCharacters)
    }${
        " ".repeat(progressWidth - progressCharacters)
    }] ${
        progressUnknown ? "??" : (progress * 100).toFixed(2)
    }%${
        extraText.length > 0 ? ` (${extraText})` : ""
    }`);
}

/**
 * Downloads the SVG map from the internet, and applies one-time transformations
 * that are used when generating the map.
 */
(async () => {
    console.log(`[i] Path: ${MAP_PATH}`);

    if (await fs.access(MAP_PATH).catch(() => false)) {
        if (process.argv.includes("-f") || process.argv.includes("--force")) {
            console.log("[i] Removing existing map...");
            await fs.unlink(MAP_PATH);
        } else {
            console.log("[i] Map exists. Skipping...");
            return;
        }
    }

    console.log(`[i] Downloading map from ${SOURCE_SVG}...`);
    const request = await axios.get(SOURCE_SVG, {
        headers: {
            "User-Agent": USER_AGENT
        },
        responseType: "stream"
    });
    /** @type {NodeJS.ReadableStream} */
    const stream = request.data;

    const expectedLength = request.headers["content-length"] ?? 0;
    let actualLength = 0;
    let mapData = Buffer.alloc(0);

    stream.on("data", (data) => {
        mapData = Buffer.concat([mapData, data]);

        actualLength += data.length;
        progressBar(
            4,
            50,
            actualLength / expectedLength,
            `${(actualLength / 1000).toLocaleString()}${
                expectedLength > 0 ? `/${(expectedLength / 1000).toLocaleString()}` : ""
            } KB`
        );
    });

    await new Promise((res, rej) => {
        stream.on("error", () => { rej(); });
        stream.on("end", () => { res(); });
    });

    process.stdout.write("\n");
    console.log("[i] Performing transformations...");
    const $ = cheerio.load(mapData, { xmlMode: true });

    // Sets the background (water) color.
    const $svg = $("svg");
    const svgStyle = $svg.attr("style");
    $svg.attr(
        "style",
        svgStyle == null
            ? `background-color: ${WATER_COLOR}`
            : `${svgStyle}; background-color: ${WATER_COLOR}`
    );

    const $Provinces = $("#Provinces path");
    // Make provinces transparent.
    $Provinces.attr("fill", "rgba(0, 0, 0, 0)");
    // Make provinces unclickable.
    $Provinces.css("pointer-events", "none");

    const $Municipalities = $("#Municipalities path");
    // Fill municipalities with land color.
    $Municipalities.attr("fill", LAND_COLOR);

    // Ensure that provinces appear on top of municipalities to emphasize border.
    $("#Provinces").insertAfter("#Municipalities");

    console.log("[i] Writing map...");
    await fs.writeFile(MAP_PATH, $.xml());

    console.log(`[i] Map saved as ${MAP_PATH}`);

})();
