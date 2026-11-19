import type { SearchEngine } from '../types/workspace';

export interface ResolvedAddress {
  url: string;
  isSearch: boolean;
  isHttps: boolean;
  displayLabel: string;
}

const SEARCH_TEMPLATES: Record<Exclude<SearchEngine, 'custom'>, string> = {
  duckduckgo: 'https://duckduckgo.com/?q=',
  google: 'https://www.google.com/search?q=',
  bing: 'https://www.bing.com/search?q=',
};

/**
 * Resolves raw address bar input into either a normalized URL or a search engine URL.
 */
export function resolveAddressInput(
  rawInput: string,
  searchEngine: SearchEngine = 'duckduckgo',
  customSearchUrl = 'https://duckduckgo.com/?q={query}'
): ResolvedAddress {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      url: 'about:blank',
      isSearch: false,
      isHttps: false,
      displayLabel: 'New Tab',
    };
  }

  // Explicit protocol
  if (/^https?:\/\//i.test(trimmed)) {
    const isHttps = /^https:\/\//i.test(trimmed);
    return {
      url: trimmed,
      isSearch: false,
      isHttps,
      displayLabel: extractDomain(trimmed),
    };
  }

  // Localhost or IP address with optional port/path
  if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(trimmed)) {
    const url = `http://${trimmed}`;
    return {
      url,
      isSearch: false,
      isHttps: false,
      displayLabel: extractDomain(url),
    };
  }

  // Domain-like pattern (no spaces, contains dot with valid TLD >= 2 chars)
  if (!/\s/.test(trimmed) && /^[a-z0-9-]+(\.[a-z0-9-]+)+(:[0-9]+)?(\/.*)?$/i.test(trimmed)) {
    const url = `https://${trimmed}`;
    return {
      url,
      isSearch: false,
      isHttps: true,
      displayLabel: extractDomain(url),
    };
  }

  // Otherwise treat as search query
  const encoded = encodeURIComponent(trimmed);
  let searchUrl: string;
  if (searchEngine === 'custom' && customSearchUrl.trim()) {
    if (customSearchUrl.includes('{query}')) {
      searchUrl = customSearchUrl.replace('{query}', encoded);
    } else {
      searchUrl = `${customSearchUrl}${encoded}`;
    }
  } else {
    const template = SEARCH_TEMPLATES[searchEngine === 'custom' ? 'duckduckgo' : searchEngine];
    searchUrl = `${template}${encoded}`;
  }

  return {
    url: searchUrl,
    isSearch: true,
    isHttps: searchUrl.startsWith('https://'),
    displayLabel: `${trimmed} — Search`,
  };
}

export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '') || url;
  } catch {
    return url;
  }
}

/**
 * Checks whether a URL uses safe http/https protocols and does not target private/loopback networks.
 */
export function isSafeExternalUrl(rawUrl: string): { safe: boolean; reason?: string; parsed?: URL } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { safe: false, reason: 'Invalid URL syntax.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, reason: `Unsupported protocol: ${parsed.protocol}` };
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local') ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
  ) {
    return { safe: false, reason: 'Private or loopback network addresses are blocked.' };
  }

  return { safe: true, parsed };
}

export function urlMatchesHost(url: string, targetHost: string): boolean {
  if (!targetHost) return false;
  const normalizedTarget = targetHost.toLowerCase().replace(/^www\./, '');
  const extracted = extractDomain(url).toLowerCase();
  return extracted === normalizedTarget || extracted.endsWith(`.${normalizedTarget}`);
}

export interface SiteConnectionInfo {
  status: 'secure' | 'insecure' | 'local';
  headline: string;
  subline: string;
  host: string;
  protocolLabel: string;
  isolationLabel: string;
  cookiePolicyLabel: string;
}

export function getSiteConnectionInfo(
  url?: string,
  tabType?: string
): SiteConnectionInfo {
  if (tabType === 'browser' && url && /^https:\/\//i.test(url)) {
    const host = extractDomain(url);
    return {
      status: 'secure',
      headline: 'Connection is secure',
      subline: `Traffic to ${host} is encrypted over HTTPS (TLS) via Folio server proxy.`,
      host,
      protocolLabel: 'HTTPS (TLS encrypted upstream)',
      isolationLabel: 'Sandboxed frame (allow-scripts, allow-forms)',
      cookiePolicyLabel: 'Opaque frame origin (3rd-party cookies isolated)',
    };
  }

  if (tabType === 'browser' && url && /^http:\/\//i.test(url)) {
    const host = extractDomain(url);
    return {
      status: 'insecure',
      headline: 'Connection is not secure',
      subline: `Traffic to ${host} uses unencrypted HTTP without TLS.`,
      host,
      protocolLabel: 'HTTP (Plaintext upstream)',
      isolationLabel: 'Sandboxed frame (allow-scripts, allow-forms)',
      cookiePolicyLabel: 'Opaque frame origin (3rd-party cookies isolated)',
    };
  }

  return {
    status: 'local',
    headline: 'Local workspace document',
    subline: 'Stored locally in your browser workspace without external network requests.',
    host: 'folio.local',
    protocolLabel: 'Local IndexedDB / File System Access',
    isolationLabel: tabType === 'browser' ? 'Sandboxed local HTML frame' : 'Workspace native viewer',
    cookiePolicyLabel: 'No external cookies',
  };
}
