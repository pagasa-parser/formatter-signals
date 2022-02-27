import * as fs from "fs-jetpack";
import * as path from "path";
import {Bulletin} from "pagasa-parser";
import PagasaParserFormatterSignals from "../src/PagasaParserFormatterSignals";

describe("Formatting tests", () => {

    if (fs.exists(path.join(__dirname, "out")) !== "dir") {
        fs.dir(path.join(__dirname, "out"));
    }

    const testFiles: [string, Bulletin][] = fs.list(path.join(__dirname, "data"))
        .filter(e => fs.exists(path.join(__dirname, "data", e)) === "file" && e.endsWith(".json"))
        .map(e => [e, fs.read(path.join(__dirname, "data", e), "jsonWithDates")]);

    for (const [filename, testData] of testFiles) {
        test(filename, async () => {
            const formatData = await new PagasaParserFormatterSignals().format(testData);

            expect(formatData instanceof Buffer).toBeTruthy();
            fs.write(
                path.join(__dirname, "out", filename.replace(/\.json$/g, ".svg")),
                formatData.toString("utf8")
            );
        });
    }

});
