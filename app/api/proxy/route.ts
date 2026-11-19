import { NextRequest, NextResponse } from 'next/server';
import { isSafeExternalUrl } from '@/lib/urlUtils';

const MAX_HTML_BYTES = 4 * 1024 * 1024; // 4 MB cap for proxied web pages

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function extractTitle(html: string, fallback: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return fallback;
  return match[1].replace(/\s+/g, ' ').trim() || fallback;
}

function injectNavigationBridge(html: string, baseUrl: string): string {
  const safeBase = escapeHtml(baseUrl);
  const bridgeScript = `
<base href="${safeBase}" target="_self" />
<script>
(function() {
  document.addEventListener('click', function(e) {
    var el = e.target;
    while (el && el.tagName !== 'A') {
      el = el.parentElement;
    }
    if (!el) return;
    var href = el.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) {
      return;
    }
    e.preventDefault();
    try {
      var resolved = new URL(href, ${JSON.stringify(baseUrl)}).href;
      window.parent.postMessage({ type: 'folio:navigate', url: resolved }, '*');
    } catch (err) {}
  }, true);

  document.addEventListener('submit', function(e) {
    var form = e.target;
    if (!form || !form.action) return;
    var method = (form.method || 'GET').toUpperCase();
    if (method === 'GET') {
      e.preventDefault();
      try {
        var url = new URL(form.action, ${JSON.stringify(baseUrl)});
        var data = new FormData(form);
        data.forEach(function(val, key) {
          url.searchParams.set(key, String(val));
        });
        window.parent.postMessage({ type: 'folio:navigate', url: url.href }, '*');
      } catch (err) {}
    }
  }, true);
})();
</script>`;

  // Strip strict CSP meta tags inside proxied HTML so our base/bridge works inside sandboxed iframe
  let cleaned = html
    .replace(/<meta[^>]+http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '')
    .replace(/<meta[^>]+http-equiv=["']?X-Frame-Options["']?[^>]*>/gi, '');

  if (/<head[^>]*>/i.test(cleaned)) {
    cleaned = cleaned.replace(/<head[^>]*>/i, (m) => `${m}\n${bridgeScript}`);
  } else {
    cleaned = `${bridgeScript}\n${cleaned}`;
  }
  return cleaned;
}

export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get('url');
  const mode = req.nextUrl.searchParams.get('mode') || 'meta';

  if (!rawUrl) {
    return NextResponse.json({ error: 'Missing url parameter.' }, { status: 400 });
  }

  const check = isSafeExternalUrl(rawUrl);
  if (!check.safe || !check.parsed) {
    return NextResponse.json({ error: check.reason || 'Blocked URL.' }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(check.parsed.href, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    clearTimeout(timer);

    const finalUrl = response.url || check.parsed.href;
    const finalCheck = isSafeExternalUrl(finalUrl);
    if (!finalCheck.safe) {
      return NextResponse.json({ error: 'Redirect target is not permitted.' }, { status: 403 });
    }

    const contentType = response.headers.get('content-type') || 'text/html';

    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      return NextResponse.json({
        ok: response.ok,
        status: response.status,
        finalUrl,
        contentType,
        title: finalUrl.split('/').pop() || finalUrl,
        isBinaryOrNonHtml: true,
        html: `<div style="font-family:system-ui;padding:32px;color:#e5e7eb;background:#18181b;min-height:100vh;">
          <h2 style="margin:0 0 8px;">Non-HTML Resource (${escapeHtml(contentType)})</h2>
          <p style="color:#9ca3af;">URL: ${escapeHtml(finalUrl)}</p>
        </div>`,
      });
    }

    const arrayBuf = await response.arrayBuffer();
    const sliced = arrayBuf.byteLength > MAX_HTML_BYTES ? arrayBuf.slice(0, MAX_HTML_BYTES) : arrayBuf;
    const rawHtml = new TextDecoder('utf-8', { fatal: false }).decode(sliced);
    const title = extractTitle(rawHtml, new URL(finalUrl).hostname);
    const proxiedHtml = injectNavigationBridge(rawHtml, finalUrl);

    if (mode === 'raw') {
      return new NextResponse(proxiedHtml, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    }

    return NextResponse.json({
      ok: response.ok,
      status: response.status,
      finalUrl,
      contentType,
      title,
      html: proxiedHtml,
    });
  } catch (err) {
    const message =
      err instanceof Error && err.name === 'AbortError'
        ? 'Request timed out after 12 seconds.'
        : err instanceof Error
          ? err.message
          : 'Failed to load remote page.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
