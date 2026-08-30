/**
 * Site registry.
 *
 * The flow — read a list back, act on one item, stop for approval — is the same
 * whichever site it runs against. Which site that is comes from TARGET_SITE, so
 * switching targets is a config change rather than a code change.
 */
/**
 * Prefix the agent uses when it could not read the list.
 *
 * "I couldn't see any jobs" and "here are three jobs" are both just prose, and
 * a script cannot tell them apart. Without a marker, a read that found nothing
 * still looks like a pass — which is exactly what happened the first time
 * naukri served a page the agent could not parse.
 */
export const NO_RESULTS_PREFIX = 'NO_RESULTS:';

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
