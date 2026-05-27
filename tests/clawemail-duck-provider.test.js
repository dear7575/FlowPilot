const test = require('node:test');
const assert = require('node:assert/strict');

require('../background/clawemail-duck-provider.js');
const utils = require('../clawemail-utils.js');

function createProviderApi(options = {}) {
  const {
    addressResponse = { address: 'fresh-duck@duck.com' },
    mailResponse = {
      items: [{
        id: 1,
        source: 'noreply@tm.openai.com',
        address: 'fresh-duck@duck.com',
        subject: 'OpenAI verification code',
        text: 'Your verification code is 123456.',
        received_at: '2026-05-26T10:00:00Z',
      }],
    },
    mailResponses = null,
  } = options;
  const logs = [];
  const requests = [];
  const persistCalls = [];
  const sleeps = [];
  let mailResponseIndex = 0;
  const fetchImpl = async (url, request = {}) => {
    requests.push({
      url: String(url),
      method: request.method,
      headers: request.headers,
      body: request.body ? JSON.parse(request.body) : null,
    });
    const isAddressRequest = String(url).includes('/api/duck/accounts/');
    const body = isAddressRequest
      ? addressResponse
      : (Array.isArray(mailResponses)
        ? (mailResponses[Math.min(mailResponseIndex++, mailResponses.length - 1)] || {})
        : mailResponse);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(body),
    };
  };

  const api = globalThis.MultiPageBackgroundClawEmailDuckProvider.createClawEmailDuckProvider({
    addLog: async (message, level) => logs.push({ message, level }),
    buildClawEmailHeaders: utils.buildClawEmailHeaders,
    CLAWEMAIL_DUCK_GENERATOR: utils.CLAWEMAIL_DUCK_GENERATOR,
    CLAWEMAIL_DUCK_PROVIDER: utils.CLAWEMAIL_DUCK_PROVIDER,
    DEFAULT_MAIL_PAGE_SIZE: 50,
    fetchImpl,
    getClawEmailDuckAddressFromResponse: utils.getClawEmailDuckAddressFromResponse,
    getState: async () => ({}),
    joinClawEmailUrl: utils.joinClawEmailUrl,
    normalizeClawEmailAddress: utils.normalizeClawEmailAddress,
    normalizeClawEmailAdminPassword: utils.normalizeClawEmailAdminPassword,
    normalizeClawEmailBaseUrl: utils.normalizeClawEmailBaseUrl,
    normalizeClawEmailDuckAccountId: utils.normalizeClawEmailDuckAccountId,
    normalizeClawEmailForwardingMailbox: utils.normalizeClawEmailForwardingMailbox,
    normalizeClawEmailMessages: utils.normalizeClawEmailMessages,
    persistRegistrationEmailState: async (state, email, persistOptions) => {
      persistCalls.push({ state, email, options: persistOptions });
    },
    pickVerificationMessageWithTimeFallback: (messages) => ({
      match: messages[0]
        ? {
            code: String(messages[0].bodyPreview).match(/(\d{6})/)[1],
            receivedAt: Date.parse(messages[0].receivedDateTime),
            message: messages[0],
          }
        : null,
      usedRelaxedFilters: false,
      usedTimeFallback: false,
    }),
    setEmailState: async () => {},
    sleepWithStop: async (ms) => {
      sleeps.push(ms);
    },
    throwIfStopped: () => {},
  });

  return {
    ...api,
    snapshot() {
      return { logs, requests, persistCalls, sleeps };
    },
  };
}

test('fetchClawEmailDuckAddress creates Duck address through ClawEmail API', async () => {
  const api = createProviderApi();
  const state = {
    clawEmailBaseUrl: 'http://127.0.0.1:8000',
    clawEmailAdminPassword: 'admin@123456',
    clawEmailDuckAccountId: 'duck:account',
    clawEmailForwardingMailbox: 'forward@claw.163.com',
  };

  const email = await api.fetchClawEmailDuckAddress(state, {
    preserveAccountIdentity: true,
  });
  const snapshot = api.snapshot();

  assert.equal(email, 'fresh-duck@duck.com');
  assert.equal(snapshot.requests[0].method, 'POST');
  assert.match(snapshot.requests[0].url, /\/api\/duck\/accounts\/duck%3Aaccount\/addresses$/);
  assert.equal(snapshot.requests[0].headers['x-admin-password'], 'admin@123456');
  assert.deepEqual(snapshot.requests[0].body, {
    forwardingMailboxEmail: 'forward@claw.163.com',
  });
  assert.deepEqual(snapshot.persistCalls, [{
    state,
    email: 'fresh-duck@duck.com',
    options: {
      source: 'generated:claw-duck',
      preserveAccountIdentity: true,
    },
  }]);
});

test('pollClawEmailDuckVerificationCode syncs forwarding mailbox and returns code', async () => {
  const api = createProviderApi();
  const result = await api.pollClawEmailDuckVerificationCode(4, {
    email: 'fresh-duck@duck.com',
    mailProvider: 'claw-duck',
    clawEmailBaseUrl: 'http://127.0.0.1:8000',
    clawEmailAdminPassword: 'admin@123456',
    clawEmailForwardingMailbox: 'forward@claw.163.com',
  }, {
    targetEmail: 'fresh-duck@duck.com',
    maxAttempts: 1,
    intervalMs: 1,
  });
  const pollRequest = api.snapshot().requests.find((request) => request.url.includes('/api/mails'));
  const pollUrl = new URL(pollRequest.url);

  assert.equal(result.code, '123456');
  assert.equal(pollUrl.searchParams.get('mailbox'), 'forward@claw.163.com');
  assert.equal(pollUrl.searchParams.get('sync'), 'true');
  assert.equal(pollUrl.searchParams.get('keyword'), 'fresh-duck@duck.com');
  assert.equal(pollRequest.headers['x-admin-password'], 'admin@123456');
});

test('pollClawEmailDuckVerificationCode keeps a minimum five-attempt polling window', async () => {
  const emptyResponse = { items: [] };
  const hitResponse = {
    items: [{
      id: 5,
      source: 'noreply@tm.openai.com',
      address: 'fresh-duck@duck.com',
      subject: 'OpenAI verification code',
      text: 'Your verification code is 654321.',
      received_at: '2026-05-26T10:00:20Z',
    }],
  };
  const api = createProviderApi({
    mailResponses: [
      emptyResponse,
      emptyResponse,
      emptyResponse,
      emptyResponse,
      hitResponse,
    ],
  });

  const result = await api.pollClawEmailDuckVerificationCode(8, {
    email: 'fresh-duck@duck.com',
    mailProvider: 'claw-duck',
    clawEmailBaseUrl: 'http://127.0.0.1:8000',
    clawEmailAdminPassword: 'admin@123456',
    clawEmailForwardingMailbox: 'forward@claw.163.com',
  }, {
    targetEmail: 'fresh-duck@duck.com',
    maxAttempts: 1,
    intervalMs: 1,
  });
  const snapshot = api.snapshot();
  const mailRequests = snapshot.requests.filter((request) => request.url.includes('/api/mails'));

  assert.equal(result.code, '654321');
  assert.equal(mailRequests.length, 5);
  assert.deepEqual(snapshot.sleeps, [5000, 5000, 5000, 5000]);
  assert.equal(
    snapshot.logs.some((entry) => entry.message.includes('（4/5）')),
    true
  );
});
