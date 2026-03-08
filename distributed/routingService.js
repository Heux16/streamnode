/**
 * Routing Service
 *
 * Thin helpers that sit on top of the index aggregator and let the client
 * (or another server module) figure out WHERE a file lives and build a
 * streaming URL for it without caring which device owns it.
 */

export { resolveFile } from './indexAggregator.js';

/**
 * Build the stream URL for a file entry returned by getGlobalIndex().
 *
 * @param {object} fileEntry  – one entry from getGlobalIndex()
 * @returns {string}          – absolute URL to the stream endpoint
 */
export function buildStreamUrl(fileEntry) {
  const { deviceUrl, path: filePath, name } = fileEntry;
  const dir = filePath.substring(0, filePath.lastIndexOf('/'));
  const params = new URLSearchParams({ path: dir });
  return `${deviceUrl}/stream/${encodeURIComponent(name)}?${params}`;
}
