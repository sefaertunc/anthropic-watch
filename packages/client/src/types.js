// JSDoc typedefs only. No runtime code. Other modules reference these via
// `{import('./types.js').Item}` syntax; `tsc --emitDeclarationOnly` emits
// them into dist/types.d.ts. src/index.js re-exports via `export *` so the
// typedefs surface to TypeScript consumers through dist/index.d.ts.

/**
 * @typedef {Object} Item
 * @property {string} id
 * @property {string} [uniqueKey] - Composite key `${id}|${source}`. Present in feeds v1.2.0+; absent in archived older feeds.
 * @property {string} title
 * @property {string | null} date - ISO 8601 or null.
 * @property {string} url
 * @property {string} snippet - Up to 300 chars.
 * @property {string} source
 * @property {'core' | 'extended' | 'community'} sourceCategory
 * @property {string} sourceName
 */

/**
 * @typedef {Object} FeedEnvelope
 * @property {string} version
 * @property {string} title
 * @property {string} description
 * @property {string} home_page_url
 * @property {string} generator
 * @property {number} ttl
 * @property {string} generated
 * @property {number} itemCount
 * @property {Item[]} items
 */

/**
 * @typedef {Object} RunReport
 * @property {string} version
 * @property {string} runId
 * @property {string} timestamp
 * @property {number} duration_ms
 * @property {RunReportSummary} summary
 * @property {SourceResult[]} sources
 */

/**
 * @typedef {Object} RunReportSummary
 * @property {number} totalNewItems
 * @property {number} sourcesChecked
 * @property {number} sourcesWithErrors
 * @property {number} healthySources
 */

/**
 * @typedef {Object} SourceResult
 * @property {string} key
 * @property {string} name
 * @property {'core' | 'extended' | 'community'} category
 * @property {'ok' | 'error'} status
 * @property {number} newItemCount
 * @property {number} durationMs
 * @property {string | null} error
 */

/**
 * @typedef {'ok' | 'warning' | 'fired'} IndicatorState
 */

/**
 * @typedef {Object} RunHistoryDepthIndicator
 * @property {IndicatorState} state
 * @property {number} current
 * @property {number} expected
 * @property {number | null} previous
 * @property {{ warning: string, fired: string }} threshold
 * @property {string} summary
 */

/**
 * @typedef {Object} AllJsonItemCountIndicator
 * @property {IndicatorState} state
 * @property {number} current
 * @property {number} expected
 * @property {number | null} previous
 * @property {{ warning: string, fired: string }} threshold
 * @property {string} summary
 */

/**
 * @typedef {Object} PerSourceContinuityDetail
 * @property {string} source
 * @property {string} reason
 */

/**
 * @typedef {Object} PerSourceFeedContinuityIndicator
 * @property {IndicatorState} state
 * @property {number} sourcesChecked
 * @property {number} sourcesShrinkingUnexpectedly
 * @property {{ warning: string, fired: string }} threshold
 * @property {string} summary
 * @property {PerSourceContinuityDetail[]} details
 */

/**
 * @typedef {Object} CronFreshnessIndicator
 * @property {string} lastCronAttemptedAt - ISO 8601. No `state` field — computed at read time.
 * @property {{ warning: number, fired: number }} thresholdHours
 * @property {string} summary
 */

/**
 * @typedef {Object} FeedHealthIndicators
 * @property {RunHistoryDepthIndicator} runHistoryDepth
 * @property {AllJsonItemCountIndicator} allJsonItemCount
 * @property {PerSourceFeedContinuityIndicator} perSourceFeedContinuity
 * @property {CronFreshnessIndicator} cronFreshness
 */

/**
 * @typedef {Object} FeedHealthSummary
 * @property {IndicatorState} serverOverall - Excludes cronFreshness; server-side only.
 * @property {Record<string, number>} byState - Open map: only states with count > 0 are present.
 */

/**
 * @typedef {Object} FeedHealth
 * @property {string} schemaVersion
 * @property {string} generatedAt - ISO 8601.
 * @property {string} lastCronAttemptedAt - ISO 8601.
 * @property {FeedHealthIndicators} indicators
 * @property {FeedHealthSummary} summary
 * @property {string} [error] - Present only on degenerate error envelope.
 */

export {};
