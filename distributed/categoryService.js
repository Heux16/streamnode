/**
 * categoryService.js
 * Pure functions to categorise files by extension.
 * No network calls; no side-effects.
 */

export const CATEGORY_EXTS = {
  Videos:    new Set(['mp4','mkv','avi','mov','webm','m4v','3gp','ts','m2ts']),
  Music:     new Set(['mp3','flac','wav','aac','ogg','m4a','opus','wma']),
  Photos:    new Set(['jpg','jpeg','png','gif','webp','bmp','heic','tiff','svg']),
  Documents: new Set(['pdf','docx','doc','xlsx','xls','pptx','ppt','txt','md','csv','json','xml']),
};

/**
 * Return the category name for a file object/ext string.
 * @param {string} ext – with or without leading dot, lower-case already preferred
 */
export function getCategory(ext = '') {
  const clean = ext.replace(/^\./, '').toLowerCase();
  for (const [cat, exts] of Object.entries(CATEGORY_EXTS)) {
    if (exts.has(clean)) return cat;
  }
  return 'Other';
}

/**
 * Organise a flat array of file objects into category buckets.
 * @param {Array} files
 * @returns {{ Videos, Music, Photos, Documents, Other }}
 */
export function categorize(files) {
  const result = { Videos: [], Music: [], Photos: [], Documents: [], Other: [] };
  for (const f of files) {
    const cat = getCategory(f.ext ?? f.name?.split('.').pop() ?? '');
    result[cat].push(f);
  }
  return result;
}
