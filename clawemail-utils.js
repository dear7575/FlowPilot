(function clawEmailUtilsModule(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }

  root.ClawEmailUtils = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createClawEmailUtils() {
  const CLAWEMAIL_DUCK_PROVIDER = 'claw-duck';
  const CLAWEMAIL_DUCK_GENERATOR = 'claw-duck';
  const DEFAULT_CLAWEMAIL_BASE_URL = 'http://127.0.0.1:8000';
  const DEFAULT_MAIL_PAGE_SIZE = 50;

  function firstNonEmptyString(values) {
    for (const value of values) {
      if (value === undefined || value === null) continue;
      if (typeof value === 'object') continue;
      const normalized = String(value).trim();
      if (normalized) return normalized;
    }
    return '';
  }

  function normalizeClawEmailBaseUrl(rawValue = '') {
    const value = String(rawValue || '').trim() || DEFAULT_CLAWEMAIL_BASE_URL;
    const candidate = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value) ? value : `http://${value}`;
    try {
      const parsed = new URL(candidate);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return DEFAULT_CLAWEMAIL_BASE_URL;
      }
      parsed.hash = '';
      parsed.search = '';
      const pathname = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
      return `${parsed.origin}${pathname}` || DEFAULT_CLAWEMAIL_BASE_URL;
    } catch {
      return DEFAULT_CLAWEMAIL_BASE_URL;
    }
  }

  function joinClawEmailUrl(baseUrl, path, searchParams = {}) {
    const normalizedBase = normalizeClawEmailBaseUrl(baseUrl);
    const normalizedPath = String(path || '').trim();
    const url = new URL(`${normalizedBase}${normalizedPath.startsWith('/') ? '' : '/'}${normalizedPath || ''}`);
    for (const [key, value] of Object.entries(searchParams || {})) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  function normalizeClawEmailAdminPassword(value = '') {
    return String(value || '').trim();
  }

  function normalizeClawEmailDuckAccountId(value = '') {
    return String(value || '').trim();
  }

  function normalizeClawEmailAddress(value = '') {
    const source = String(value || '').trim();
    if (!source) return '';
    const bracketMatch = source.match(/<\s*([^<>\s]+@[^<>\s]+)\s*>/);
    const directMatch = source.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    return String(bracketMatch?.[1] || directMatch?.[0] || source).trim().toLowerCase();
  }

  function normalizeClawEmailDuckAddress(value = '') {
    const source = String(value || '').trim().toLowerCase();
    if (!source) return '';
    const email = normalizeClawEmailAddress(source);
    if (/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?@duck\.com$/i.test(email)) {
      return email;
    }
    const localPart = source.replace(/@duck\.com$/i, '');
    return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(localPart)
      ? `${localPart}@duck.com`
      : '';
  }

  function normalizeClawEmailForwardingMailbox(value = '') {
    const email = normalizeClawEmailAddress(value);
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
  }

  function buildClawEmailHeaders(config = {}, options = {}) {
    const headers = {};
    const adminPassword = normalizeClawEmailAdminPassword(config.adminPassword || options.adminPassword);
    if (adminPassword) {
      headers['x-admin-password'] = adminPassword;
    }
    if (options.json) {
      headers['Content-Type'] = 'application/json';
    }
    if (options.acceptJson !== false) {
      headers.Accept = 'application/json';
    }
    return headers;
  }

  function getClawEmailDuckAddressFromResponse(payload = {}) {
    return normalizeClawEmailDuckAddress(firstNonEmptyString([
      payload.address,
      payload.email,
      payload?.data?.address,
      payload?.data?.email,
      payload?.item?.address,
    ]));
  }

  function parseClawEmailDate(value) {
    if (value === undefined || value === null || value === '') return '';
    if (typeof value === 'number' && Number.isFinite(value)) {
      return new Date(value).toISOString();
    }
    const source = String(value).trim();
    if (!source) return '';
    const parsed = Date.parse(source);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : source;
  }

  function stripHtmlTags(value = '') {
    return String(value || '')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getClawEmailMailRows(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    const candidates = [
      payload.items,
      payload.data,
      payload.list,
      payload.rows,
      payload.records,
      payload?.data?.items,
      payload?.data?.list,
      payload?.data?.records,
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }
    return [];
  }

  function normalizeClawEmailMessage(row = {}) {
    if (!row || typeof row !== 'object') return null;

    const textContent = firstNonEmptyString([row.text, row.body, row.content, row.plainText]);
    const htmlContent = firstNonEmptyString([row.html, row.htmlContent]);
    const bodyPreview = firstNonEmptyString([
      row.bodyPreview,
      row.preview,
      textContent,
      stripHtmlTags(htmlContent),
    ]);
    const fromAddress = firstNonEmptyString([
      row.source,
      row.from,
      row.sender,
      row.mailFrom,
      row?.from?.emailAddress?.address,
    ]);
    const address = normalizeClawEmailAddress(firstNonEmptyString([
      row.address,
      row.to,
      row.recipient,
      row.mailbox_email,
      row.mailboxEmail,
    ]));

    return {
      id: firstNonEmptyString([row.id, row.mailId, row.mail_id, row.provider_mail_id, row.providerMailId]),
      address,
      subject: firstNonEmptyString([row.subject, row.title]),
      from: {
        emailAddress: {
          address: fromAddress,
        },
      },
      bodyPreview,
      raw: htmlContent || textContent || row.raw_json || row.rawJson || '',
      receivedDateTime: parseClawEmailDate(firstNonEmptyString([
        row.received_at,
        row.receivedAt,
        row.created_at,
        row.createdAt,
        row.date,
      ])),
    };
  }

  function normalizeClawEmailMessages(payload) {
    return getClawEmailMailRows(payload)
      .map((row) => normalizeClawEmailMessage(row))
      .filter(Boolean);
  }

  return {
    CLAWEMAIL_DUCK_GENERATOR,
    CLAWEMAIL_DUCK_PROVIDER,
    DEFAULT_CLAWEMAIL_BASE_URL,
    DEFAULT_MAIL_PAGE_SIZE,
    buildClawEmailHeaders,
    getClawEmailDuckAddressFromResponse,
    joinClawEmailUrl,
    normalizeClawEmailAddress,
    normalizeClawEmailAdminPassword,
    normalizeClawEmailBaseUrl,
    normalizeClawEmailDuckAccountId,
    normalizeClawEmailDuckAddress,
    normalizeClawEmailForwardingMailbox,
    normalizeClawEmailMessage,
    normalizeClawEmailMessages,
  };
});
