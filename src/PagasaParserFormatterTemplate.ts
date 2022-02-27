import { Bulletin, PagasaParserSource } from "pagasa-parser";

export default class PagasaParserTemplate extends PagasaParserFormatter<string> {

    async format(bulletin: Bulletin): Promise<string> {
        // Format the given bulletin.
    }

}
