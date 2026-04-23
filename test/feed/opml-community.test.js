import { describe, it, expect } from "vitest";
import { XMLParser } from "fast-xml-parser";
import { generateOpml } from "../../src/feed/opml.js";

describe("OPML generation — community group", () => {
  const fakeSources = [
    {
      key: "core-a",
      name: "Core A",
      url: "https://example.com/a",
      category: "core",
    },
    {
      key: "ext-a",
      name: "Extended A",
      url: "https://example.com/b",
      category: "extended",
    },
    {
      key: "community-a",
      name: "Community A",
      url: "https://example.com/c",
      category: "community",
    },
  ];

  it("should emit three outline groups when sources span all three categories", () => {
    const xml = generateOpml(fakeSources);
    const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);
    const groups = parsed.opml.body.outline;
    expect(groups).toHaveLength(3);
    expect(groups.map((g) => g["@_text"])).toEqual([
      "Core",
      "Extended",
      "Community",
    ]);
    for (const group of groups) {
      const children = Array.isArray(group.outline)
        ? group.outline
        : [group.outline];
      expect(children).toHaveLength(1);
    }
  });

  it("should preserve source URLs inside the Community group", () => {
    const xml = generateOpml(fakeSources);
    const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);
    const community = parsed.opml.body.outline.find(
      (g) => g["@_text"] === "Community",
    );
    const child = Array.isArray(community.outline)
      ? community.outline[0]
      : community.outline;
    expect(child["@_text"]).toBe("Community A");
    expect(child["@_htmlUrl"]).toBe("https://example.com/c");
    expect(child["@_xmlUrl"]).toContain("/community-a.xml");
  });

  it("should emit empty Community outline when no community sources exist", () => {
    const onlyCoreExtended = fakeSources.filter(
      (s) => s.category !== "community",
    );
    const xml = generateOpml(onlyCoreExtended);
    const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);
    const groups = parsed.opml.body.outline;
    expect(groups).toHaveLength(3);
    const community = groups.find((g) => g["@_text"] === "Community");
    expect(community).toBeTruthy();
  });
});
