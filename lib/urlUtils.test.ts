import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveAddressInput,
  extractDomain,
  isSafeExternalUrl,
  urlMatchesHost,
  getSiteConnectionInfo,
} from './urlUtils';

test('resolveAddressInput handles full HTTPS URLs', () => {
  const res = resolveAddressInput('https://developer.mozilla.org/en-US/');
  assert.equal(res.url, 'https://developer.mozilla.org/en-US/');
  assert.equal(res.isSearch, false);
  assert.equal(res.isHttps, true);
  assert.equal(res.displayLabel, 'developer.mozilla.org');
});

test('resolveAddressInput upgrades bare domain names to HTTPS', () => {
  const res = resolveAddressInput('wikipedia.org/wiki/Markdown');
  assert.equal(res.url, 'https://wikipedia.org/wiki/Markdown');
  assert.equal(res.isSearch, false);
  assert.equal(res.isHttps, true);
});

test('resolveAddressInput converts search queries using selected engine', () => {
  const res = resolveAddressInput('pdfjs canvas rendering', 'duckduckgo');
  assert.equal(res.isSearch, true);
  assert.equal(res.url, 'https://duckduckgo.com/?q=pdfjs%20canvas%20rendering');

  const custom = resolveAddressInput('tauri webview', 'custom', 'https://kagi.com/search?q={query}');
  assert.equal(custom.url, 'https://kagi.com/search?q=tauri%20webview');
});

test('extractDomain strips www prefix cleanly', () => {
  assert.equal(extractDomain('https://www.example.com/docs'), 'example.com');
});

test('isSafeExternalUrl blocks loopback and private IPs while permitting public https', () => {
  assert.equal(isSafeExternalUrl('https://example.com').safe, true);
  assert.equal(isSafeExternalUrl('http://127.0.0.1:3000').safe, false);
  assert.equal(isSafeExternalUrl('http://192.168.1.10').safe, false);
  assert.equal(isSafeExternalUrl('javascript:alert(1)').safe, false);
});

test('urlMatchesHost matches exact domains and subdomains cleanly', () => {
  assert.equal(urlMatchesHost('https://docs.example.com/guide', 'example.com'), true);
  assert.equal(urlMatchesHost('https://www.example.com', 'example.com'), true);
  assert.equal(urlMatchesHost('https://notexample.com', 'example.com'), false);
});

test('getSiteConnectionInfo distinguishes HTTPS, HTTP, and local modes', () => {
  const httpsInfo = getSiteConnectionInfo('https://example.com/page', 'browser');
  assert.equal(httpsInfo.status, 'secure');
  assert.equal(httpsInfo.host, 'example.com');

  const httpInfo = getSiteConnectionInfo('http://example.com/page', 'browser');
  assert.equal(httpInfo.status, 'insecure');

  const localInfo = getSiteConnectionInfo('local://demo.html', 'browser');
  assert.equal(localInfo.status, 'local');
});
