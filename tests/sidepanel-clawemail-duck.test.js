const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('sidepanel/sidepanel.js', 'utf8');

function extractFunction(name) {
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

function createRow(display = 'none') {
  return { style: { display } };
}

function createApi() {
  const bundle = extractFunction('updateMailProviderUI');

  return new Function('createRow', `
let latestState = {};
let cloudflareDomainEditMode = false;
let cloudflareTempEmailDomainEditMode = false;
const GMAIL_PROVIDER = 'gmail';
const LUCKMAIL_PROVIDER = 'luckmail-api';
const HOTMAIL_SERVICE_MODE_REMOTE = 'remote';
const HOTMAIL_SERVICE_MODE_LOCAL = 'local';
const rowMail2925Mode = createRow();
const rowMail2925PoolSettings = createRow();
const rowEmailPrefix = createRow();
const rowCustomMailProviderPool = createRow();
const rowInbucketHost = createRow();
const rowInbucketMailbox = createRow();
const rowEmailGenerator = createRow();
const rowCfDomain = createRow();
const rowTempEmailBaseUrl = createRow();
const rowTempEmailAdminAuth = createRow();
const rowTempEmailCustomAuth = createRow();
const rowTempEmailLookupMode = createRow();
const rowTempEmailReceiveMailbox = createRow();
const rowTempEmailRandomSubdomainToggle = createRow();
const rowTempEmailDomain = createRow();
const cloudflareTempEmailSection = createRow();
const cloudMailSection = createRow();
const clawEmailDuckSection = createRow();
const hotmailSection = createRow();
const mail2925Section = createRow();
const luckmailSection = createRow();
const icloudSection = createRow();
const yydsMailSection = createRow();
const rowCloudMailBaseUrl = createRow();
const rowCloudMailAdminEmail = createRow();
const rowCloudMailAdminPassword = createRow();
const rowCloudMailReceiveMailbox = createRow();
const rowCloudMailDomain = createRow();
const rowClawEmailBaseUrl = createRow();
const rowClawEmailAdminPassword = createRow();
const rowClawEmailDuckAccountId = createRow();
const rowClawEmailForwardingMailbox = createRow();
const rowClawEmailConnectionId = createRow();
const labelEmailPrefix = { textContent: '' };
const inputEmailPrefix = { placeholder: '', style: { display: '' }, readOnly: false };
const labelMail2925UseAccountPool = createRow();
const selectMail2925PoolAccount = { style: { display: 'none' }, disabled: false };
const btnFetchEmail = { hidden: false, disabled: false, textContent: '' };
const btnMailLogin = { disabled: false, textContent: '', title: '' };
const inputEmail = { readOnly: false, placeholder: '', value: '' };
const autoHintText = { textContent: '' };
const rowHotmailServiceMode = createRow();
const rowHotmailRemoteBaseUrl = createRow();
const rowHotmailLocalBaseUrl = createRow();
const inputMail2925UseAccountPool = { checked: false };
const selectMailProvider = { value: 'claw-duck', options: [] };
const selectEmailGenerator = { value: 'duck', disabled: false, options: [] };
const inputTempEmailUseRandomSubdomain = { checked: false };
const inputRunCount = { disabled: false };
const currentAutoRun = { autoRunning: false };
function normalizeIcloudHost(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'icloud.com' || normalized === 'icloud.com.cn' ? normalized : '';
}
function normalizeIcloudTargetMailboxType(value) {
  return String(value || '').trim().toLowerCase() === 'forward-mailbox' ? 'forward-mailbox' : 'icloud-inbox';
}
function isLuckmailProvider() { return false; }
function isCustomMailProvider() { return false; }
function isIcloudMailProvider() { return false; }
function usesGeneratedAliasMailProvider() { return false; }
function getSelectedMail2925Mode() { return 'provide'; }
function getCurrentRegistrationEmailUiCopy() {
  return {
    buttonLabel: '获取邮箱',
    placeholder: '点击获取邮箱，或手动粘贴邮箱',
    label: '邮箱',
  };
}
function updateMailLoginButtonState() {}
function getSelectedHotmailServiceMode() { return 'local'; }
function getCloudflareDomainsFromState() { return { domains: [], activeDomain: '' }; }
function setCloudflareDomainEditMode() {}
function getCloudflareTempEmailDomainsFromState() { return { domains: [], activeDomain: '' }; }
function setCloudflareTempEmailDomainEditMode() {}
function queueIcloudAliasRefresh() {}
function hideIcloudLoginHelp() {}
function syncMail2925PoolAccountOptions() {}
function getMail2925Accounts() { return []; }
function renderHotmailAccounts() {}
function renderMail2925Accounts() {}
function renderLuckmailPurchases() {}
function getSelectedEmailGenerator() { return String(selectEmailGenerator.value || '').trim().toLowerCase(); }
function isAutoRunLockedPhase() { return false; }
function shouldLockRunCountToEmailPool() { return false; }
function getCurrentHotmailEmail() { return ''; }
function getCurrentLuckmailEmail() { return ''; }
${bundle}
return {
  updateMailProviderUI,
  selectMailProvider,
  selectEmailGenerator,
  rowEmailGenerator,
  clawEmailDuckSection,
  rowClawEmailBaseUrl,
  rowClawEmailAdminPassword,
  rowClawEmailDuckAccountId,
  rowClawEmailForwardingMailbox,
  rowClawEmailConnectionId,
};
`)(createRow);
}

test('updateMailProviderUI shows required ClawEmail Duck rows in provider mode', () => {
  const api = createApi();

  api.updateMailProviderUI();

  assert.equal(api.rowEmailGenerator.style.display, 'none');
  assert.equal(api.clawEmailDuckSection.style.display, '');
  assert.equal(api.rowClawEmailBaseUrl.style.display, '');
  assert.equal(api.rowClawEmailAdminPassword.style.display, '');
  assert.equal(api.rowClawEmailDuckAccountId.style.display, '');
  assert.equal(api.rowClawEmailForwardingMailbox.style.display, '');
  assert.equal(api.rowClawEmailConnectionId.style.display, '');
});

test('updateMailProviderUI shows required ClawEmail Duck rows in generator mode', () => {
  const api = createApi();
  api.selectMailProvider.value = '163';
  api.selectEmailGenerator.value = 'claw-duck';

  api.updateMailProviderUI();

  assert.equal(api.rowEmailGenerator.style.display, '');
  assert.equal(api.clawEmailDuckSection.style.display, '');
  assert.equal(api.rowClawEmailDuckAccountId.style.display, '');
});
