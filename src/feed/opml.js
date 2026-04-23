import { XMLBuilder } from "fast-xml-parser";
import { sources as defaultSources } from "../sources.js";

const BASE_URL = "https://sefaertunc.github.io/anthropic-watch/feeds";

export function generateOpml(sources = defaultSources) {
  const core = sources.filter((s) => s.category === "core");
  const extended = sources.filter((s) => s.category === "extended");
  const community = sources.filter((s) => s.category === "community");

  function makeOutlines(list) {
    return list.map((s) => ({
      "@_text": s.name,
      "@_type": "rss",
      "@_xmlUrl": `${BASE_URL}/${s.key}.xml`,
      "@_htmlUrl": s.url,
    }));
  }

  const opmlObj = {
    "?xml": { "@_version": "1.0", "@_encoding": "UTF-8" },
    opml: {
      "@_version": "2.0",
      head: {
        title: "anthropic-watch feeds",
        dateCreated: new Date().toUTCString(),
      },
      body: {
        outline: [
          {
            "@_text": "Core",
            outline: makeOutlines(core),
          },
          {
            "@_text": "Extended",
            outline: makeOutlines(extended),
          },
          {
            "@_text": "Community",
            outline: makeOutlines(community),
          },
        ],
      },
    },
  };

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    processEntities: true,
    format: true,
    suppressEmptyNode: true,
  });

  return builder.build(opmlObj);
}
