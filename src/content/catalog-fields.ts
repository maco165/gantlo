// 目録 (content/catalog.ts) に残すレッスンの欄。vite.config.ts の lessonCatalog も読むので、依存の無い小さなファイルに置く
export const CATALOG_FIELDS = ['id', 'title', 'shortTitle', 'course', 'stage'] as const;
