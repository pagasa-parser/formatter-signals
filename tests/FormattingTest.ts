import * as fs from "fs";
import * as path from "path";
import {Bulletin} from "pagasa-parser";
import PagasaParserFormatterSignals from "../src/PagasaParserFormatterSignals";

describe("Formatting tests", () => {

    if (!fs.existsSync(path.join(__dirname, "out"))) {
        fs.mkdirSync(path.join(__dirname, "out"));
    }

    const testFiles: [string, Bulletin][] = fs.readdirSync(path.join(__dirname, "data"))
        .filter(e => fs.lstatSync(path.join(__dirname, "data", e)).isFile() && e.endsWith(".json"))
        .map(e => [e, JSON.parse(fs.readFileSync(path.join(__dirname, "data", e)).toString())]);

    for (const [filename, testData] of testFiles) {
        test(filename, async () => {
            const formatData = await new PagasaParserFormatterSignals().format(testData);

            expect(formatData instanceof Buffer).toBeTruthy();
            fs.writeFileSync(
                path.join(__dirname, "out", filename.replace(/\.json$/g, ".svg")),
                formatData.toString("utf8")
            );
        });
    }

});
