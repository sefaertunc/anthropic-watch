import { XMLParser } from "fast-xml-parser";

export function validateRss(xmlString) {
  const errors = [];

  let parsed;
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      processEntities: true,
    });
    parsed = parser.parse(xmlString);
  } catch (err) {
    return {
      valid: false,
      errors: [`XML parse error: ${err.message}`],
      itemCount: 0,
    };
  }

  const rss = parsed?.rss;
  if (!rss) {
    errors.push("Missing <rss> root element");
    return { valid: false, errors, itemCount: 0 };
  }

  const version = rss["@_version"];
  if (version !== "2.0") {
    errors.push(`Expected rss version="2.0", got "${version}"`);
  }

  const channel = rss.channel;
  if (!channel) {
    errors.push("Missing <channel> element");
    return { valid: false, errors, itemCount: 0 };
  }

  if (!channel.title) errors.push("Missing <title> in channel");
  if (!channel.link) errors.push("Missing <link> in channel");
  if (!channel.description) errors.push("Missing <description> in channel");

  let items = channel.item || [];
  if (!Array.isArray(items)) items = [items];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.title && !item.description) {
      errors.push(`Item ${i}: missing both <title> and <description>`);
    }
    if (!item.guid) {
      errors.push(`Item ${i}: missing <guid>`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    itemCount: items.length,
  };
}
