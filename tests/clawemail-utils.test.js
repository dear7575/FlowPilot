const test = require('node:test');
const assert = require('node:assert/strict');

const utils = require('../clawemail-utils.js');

test('ClawEmail utils normalize base URL and auth headers', () => {
  assert.equal(utils.normalizeClawEmailBaseUrl('127.0.0.1:8000/api'), 'http://127.0.0.1:8000/api');
  assert.equal(utils.normalizeClawEmailBaseUrl('https://mail.example.com/'), 'https://mail.example.com');
  assert.deepEqual(utils.buildClawEmailHeaders({ adminPassword: ' secret ' }, { json: true }), {
    'x-admin-password': 'secret',
    'Content-Type': 'application/json',
    Accept: 'application/json',
  });
});

test('ClawEmail utils normalize Duck address response', () => {
  assert.equal(utils.getClawEmailDuckAddressFromResponse({ address: 'Private-Address@duck.com' }), 'private-address@duck.com');
  assert.equal(utils.getClawEmailDuckAddressFromResponse({ data: { address: 'Private-Address' } }), 'private-address@duck.com');
  assert.equal(utils.getClawEmailDuckAddressFromResponse({ address: 'bad@example.com' }), '');
});

test('ClawEmail utils normalize mail rows into verification messages', () => {
  const messages = utils.normalizeClawEmailMessages({
    items: [{
      id: 12,
      source: 'noreply@tm.openai.com',
      address: 'fresh@duck.com',
      subject: 'Verify your email',
      text: 'Your code is 123456.',
      received_at: '2026-05-26T10:00:00Z',
    }],
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0].id, '12');
  assert.equal(messages[0].address, 'fresh@duck.com');
  assert.equal(messages[0].from.emailAddress.address, 'noreply@tm.openai.com');
  assert.match(messages[0].bodyPreview, /123456/);
});
