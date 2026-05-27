const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const backgroundSource = fs.readFileSync('background.js', 'utf8');
const pollingSource = fs.readFileSync('background/flow-mail-polling.js', 'utf8');

function extractFunction(source, name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers
    .map((marker) => source.indexOf(marker))
    .find((index) => index >= 0);
  if (start < 0) {
    throw new Error(`missing function ${name}`);
  }

  let parenDepth = 0;
  let signatureEnded = false;
  let braceStart = -1;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '(') {
      parenDepth += 1;
    } else if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        signatureEnded = true;
      }
    } else if (ch === '{' && signatureEnded) {
      braceStart = i;
      break;
    }
  }
  if (braceStart < 0) {
    throw new Error(`missing body for function ${name}`);
  }

  let depth = 0;
  let end = braceStart;
  for (; end < source.length; end += 1) {
    const ch = source[end];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }

  return source.slice(start, end);
}

test('normalizeEmailGenerator accepts ClawEmail Duck generator', () => {
  const api = new Function(`
const CUSTOM_EMAIL_POOL_GENERATOR = 'custom-pool';
const GMAIL_ALIAS_GENERATOR = 'gmail-alias';
const YYDS_MAIL_GENERATOR = 'yyds-mail';
const CLOUDFLARE_TEMP_EMAIL_GENERATOR = 'cloudflare-temp-email';
const CLAWEMAIL_DUCK_GENERATOR = 'claw-duck';
${extractFunction(backgroundSource, 'normalizeEmailGenerator')}
return { normalizeEmailGenerator };
  `)();

  assert.equal(api.normalizeEmailGenerator('claw-duck'), 'claw-duck');
  assert.equal(api.normalizeEmailGenerator('unknown'), 'duck');
});

test('normalizeMailProvider accepts ClawEmail Duck provider', () => {
  const api = new Function(`
const ICLOUD_PROVIDER = 'icloud';
const GMAIL_PROVIDER = 'gmail';
const HOTMAIL_PROVIDER = 'hotmail-api';
const LUCKMAIL_PROVIDER = 'luckmail-api';
const CLOUDFLARE_TEMP_EMAIL_PROVIDER = 'cloudflare-temp-email';
const CLOUD_MAIL_PROVIDER = 'cloudmail';
const CLAWEMAIL_DUCK_PROVIDER = 'claw-duck';
const YYDS_MAIL_PROVIDER = 'yyds-mail';
const PERSISTED_SETTING_DEFAULTS = { mailProvider: '163' };
${extractFunction(backgroundSource, 'normalizeMailProvider')}
return { normalizeMailProvider };
  `)();

  assert.equal(api.normalizeMailProvider('claw-duck'), 'claw-duck');
  assert.equal(api.normalizeMailProvider('bad-provider'), '163');
});

test('flow mail polling registers ClawEmail Duck as API provider', async () => {
  const scope = {};
  const api = new Function('self', `${pollingSource}; return self.MultiPageBackgroundFlowMailPolling;`)(scope);
  const calls = [];
  const service = api.createFlowMailPollingService({
    addLog: async () => {},
    buildVerificationPollPayloadForNode: () => ({
      step: 4,
      targetEmail: 'fresh@duck.com',
      maxAttempts: 1,
      intervalMs: 1,
    }),
    CLAWEMAIL_DUCK_PROVIDER: 'claw-duck',
    getMailConfig: () => ({ provider: 'claw-duck', label: 'ClawEmail Duck' }),
    pollClawEmailDuckVerificationCode: async (step, state, payload) => {
      calls.push({ step, state, payload });
      return { code: '123456' };
    },
    throwIfStopped: () => {},
  });

  const result = await service.pollFlowVerificationCode({
    nodeId: 'fetch-signup-code',
    state: { email: 'fresh@duck.com' },
    step: 4,
  });

  assert.equal(result.code, '123456');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.targetEmail, 'fresh@duck.com');
});

test('flow mail polling keeps ClawEmail Duck on API path for legacy state shape', async () => {
  const scope = {};
  const api = new Function('self', `${pollingSource}; return self.MultiPageBackgroundFlowMailPolling;`)(scope);
  const calls = {
    openedTabs: [],
    contentScripts: 0,
    clawPolls: [],
  };
  const service = api.createFlowMailPollingService({
    addLog: async () => {},
    buildVerificationPollPayloadForNode: () => ({
      step: 10,
      targetEmail: 'catcher-runt-yoga@duck.com',
      maxAttempts: 1,
      intervalMs: 1,
    }),
    CLAWEMAIL_DUCK_PROVIDER: 'claw-duck',
    getMailConfig: () => ({
      label: 'ClawEmail Duck',
      source: 'clawemail-duck',
      url: 'https://example.invalid/mail',
    }),
    pollClawEmailDuckVerificationCode: async (step, state, payload) => {
      calls.clawPolls.push({ step, state, payload });
      return { code: '654321' };
    },
    reuseOrCreateTab: async (source) => {
      calls.openedTabs.push(source);
      return 1;
    },
    sendToMailContentScriptResilient: async () => {
      calls.contentScripts += 1;
      throw new Error('unexpected content script path');
    },
    throwIfStopped: () => {},
  });

  const result = await service.pollFlowVerificationCode({
    nodeId: 'fetch-bind-email-code',
    state: {
      email: 'catcher-runt-yoga@duck.com',
      emailGenerator: 'claw-duck',
      mailProvider: 'qq',
    },
    step: 10,
  });

  assert.equal(result.code, '654321');
  assert.equal(calls.clawPolls.length, 1);
  assert.deepStrictEqual(calls.openedTabs, []);
  assert.equal(calls.contentScripts, 0);
});

test('ensureAutoEmailReady uses ClawEmail Duck provider before legacy Duck generator', async () => {
  const api = new Function(`
const CLAWEMAIL_DUCK_PROVIDER = 'claw-duck';
const calls = [];
async function getState() {
  return {
    mailProvider: 'claw-duck',
    emailGenerator: 'duck',
  };
}
function isHotmailProvider() { return false; }
function isLuckmailProvider() { return false; }
function isYydsMailProvider() { return false; }
function isGeneratedAliasProvider() { return false; }
function isReusableGeneratedAliasEmail() { return false; }
function shouldUseCustomRegistrationEmail() { return false; }
function isCustomEmailPoolGenerator() { return false; }
async function fetchClawEmailDuckAddress(state, options) {
  calls.push({ state, options });
  return 'fresh@duck.com';
}
async function addLog() {}
${extractFunction(backgroundSource, 'ensureAutoEmailReady')}
return { ensureAutoEmailReady, calls };
  `)();

  const email = await api.ensureAutoEmailReady(1, 2, 1);

  assert.equal(email, 'fresh@duck.com');
  assert.equal(api.calls.length, 1);
  assert.equal(api.calls[0].state.mailProvider, 'claw-duck');
});

test('fetchGeneratedEmail uses ClawEmail Duck when provider is selected even if generator is legacy Duck', async () => {
  const api = new Function(`
const CLAWEMAIL_DUCK_GENERATOR = 'claw-duck';
const CLAWEMAIL_DUCK_PROVIDER = 'claw-duck';
const CLOUD_MAIL_GENERATOR = 'cloudmail';
const calls = [];
async function getState() {
  return {
    mailProvider: 'claw-duck',
    emailGenerator: 'duck',
  };
}
function normalizeMailProvider(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || '163';
}
function normalizeEmailGenerator(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'claw-duck' ? 'claw-duck' : 'duck';
}
async function fetchYydsMailAddress() {
  throw new Error('unexpected yyds path');
}
async function fetchCloudMailAddress() {
  throw new Error('unexpected cloudmail path');
}
async function fetchClawEmailDuckAddress(state, options) {
  calls.push({ state, options });
  return 'fresh@duck.com';
}
const generatedEmailHelpers = {
  async fetchGeneratedEmail() {
    throw new Error('unexpected legacy duck path');
  },
};
${extractFunction(backgroundSource, 'fetchGeneratedEmail')}
return { fetchGeneratedEmail, calls };
  `)();

  const email = await api.fetchGeneratedEmail({
    mailProvider: 'claw-duck',
    emailGenerator: 'duck',
  }, {
    generateNew: true,
    preserveAccountIdentity: true,
  });

  assert.equal(email, 'fresh@duck.com');
  assert.equal(api.calls.length, 1);
  assert.equal(api.calls[0].options.generator, 'claw-duck');
  assert.equal(api.calls[0].options.mailProvider, 'claw-duck');
});
