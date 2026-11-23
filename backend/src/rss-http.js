import { lookup } from 'node:dns';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { Agent, fetch } from 'undici';

const redirects = new Set([301, 302, 303, 307, 308]);

export function normalizeRssUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Enter an HTTP or HTTPS RSS URL without credentials');
  }
  url.hash = '';
  return url;
}

function isPublic(address) {
  const ip = ipaddr.process(address);
  return ip.range() === 'unicast' && (ip.kind() === 'ipv4' || ip.match(ipaddr.parse('2000::'), 3));
}

/** Use the same, filtered DNS results when opening the connection. */
const publicAgent = new Agent({
  connect: {
    lookup(hostname, options, callback) {
      lookup(hostname, { ...options, all: true }, (error, answers) => {
        if (error) return callback(error);
        const publicAnswers = answers.filter(({ address }) => isPublic(address));
        if (!publicAnswers.length) return callback(new Error('RSS host has no public network address'));
        if (options.all) return callback(null, publicAnswers);
        const [{ address, family }] = publicAnswers;
        return callback(null, address, family);
      });
    },
  },
});

/** Fetch a public RSS URL, applying the same checks to every redirect. */
export async function fetchPublicRss(value, options, request = fetch) {
  let url = normalizeRssUrl(value);
  for (let hop = 0; hop <= 5; hop += 1) {
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (isIP(host) && !isPublic(host)) throw new Error('RSS URL must use a public network address');
    const response = await request(url, { ...options, redirect: 'manual', dispatcher: publicAgent });
    if (!redirects.has(response.status)) return response;
    const location = response.headers.get('location');
    await response.body?.cancel();
    if (!location) throw new Error('RSS redirect has no destination');
    url = normalizeRssUrl(new URL(location, url));
  }
  throw new Error('RSS URL exceeded the redirect limit');
}
