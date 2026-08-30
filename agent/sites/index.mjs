/**
 * Site registry.
 *
 * The flow — read a list back, act on one item, stop for approval — is the same
 * whichever site it runs against. Which site that is comes from TARGET_SITE, so
 * switching targets is a config change rather than a code change.
 */
import * as linkedin from './linkedin.mjs';
import * as naukri from './naukri.mjs';

const SITES = new Map([
  [linkedin.NAME, linkedin],
  [naukri.NAME, naukri],
]);

export const SITE_NAMES = [...SITES.keys()];

/**
 * Resolve a site module by name.
 *
 * @param {string} [name]  defaults to TARGET_SITE, then 'naukri'
 */
export function resolveSite(name = process.env.TARGET_SITE || 'naukri') {
  const site = SITES.get(name.trim().toLowerCase());
  if (!site) {
    throw new Error(
      `Unknown TARGET_SITE "${name}". Known sites: ${SITE_NAMES.join(', ')}.`,
    );
  }
  return site;
}
