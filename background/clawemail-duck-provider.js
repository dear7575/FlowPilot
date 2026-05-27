(function clawEmailDuckProviderModule(root, factory) {
  root.MultiPageBackgroundClawEmailDuckProvider = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createClawEmailDuckProviderModule() {
  const CLAWEMAIL_DUCK_MIN_POLL_ATTEMPTS = 5;
  const CLAWEMAIL_DUCK_MIN_POLL_INTERVAL_MS = 5000;

  function createClawEmailDuckProvider(deps = {}) {
    const {
      addLog = async () => {},
      buildClawEmailHeaders,
      CLAWEMAIL_DUCK_GENERATOR = 'claw-duck',
      CLAWEMAIL_DUCK_PROVIDER = 'claw-duck',
      DEFAULT_MAIL_PAGE_SIZE = 50,
      fetchImpl = typeof fetch === 'function' ? fetch.bind(globalThis) : null,
      getClawEmailDuckAddressFromResponse,
      getState = async () => ({}),
      joinClawEmailUrl,
      normalizeClawEmailAddress,
      normalizeClawEmailAdminPassword,
      normalizeClawEmailBaseUrl,
      normalizeClawEmailDuckAccountId,
      normalizeClawEmailForwardingMailbox,
      normalizeClawEmailMessages,
      persistRegistrationEmailState = null,
      pickVerificationMessageWithTimeFallback,
      setEmailState = async () => {},
      sleepWithStop = async () => {},
      throwIfStopped = () => {},
    } = deps;

    async function persistResolvedEmailState(state = null, email, options = {}) {
      if (typeof persistRegistrationEmailState === 'function') {
        await persistRegistrationEmailState(state, email, options);
        return;
      }
      await setEmailState(email, options);
    }

    function getClawEmailDuckConfig(state = {}) {
      return {
        baseUrl: normalizeClawEmailBaseUrl(state.clawEmailBaseUrl),
        adminPassword: normalizeClawEmailAdminPassword(state.clawEmailAdminPassword),
        duckAccountId: normalizeClawEmailDuckAccountId(state.clawEmailDuckAccountId),
        forwardingMailbox: normalizeClawEmailForwardingMailbox(state.clawEmailForwardingMailbox),
      };
    }

    function ensureClawEmailDuckConfig(state = {}, options = {}) {
      const {
        requireAccountId = false,
        requireForwardingMailbox = false,
      } = options;
      const config = getClawEmailDuckConfig(state);
      if (!config.baseUrl) {
        throw new Error('ClawEmail 服务地址为空或格式无效。');
      }
      if (!config.adminPassword) {
        throw new Error('ClawEmail 管理密码为空，请先在侧边栏填写。');
      }
      if (requireAccountId && !config.duckAccountId) {
        throw new Error('ClawEmail Duck 账号 ID 为空，请先在 ClawEmail 中创建 Duck 账号并填写账号 ID。');
      }
      if (requireForwardingMailbox && !config.forwardingMailbox) {
        throw new Error('ClawEmail 转发收件邮箱为空，请填写用于接收 Duck 转发邮件的 Claw 子邮箱。');
      }
      return config;
    }

    async function requestClawEmailJson(config, path, options = {}) {
      if (!fetchImpl) {
        throw new Error('ClawEmail 当前运行环境不支持 fetch。');
      }
      const {
        method = 'GET',
        payload,
        searchParams,
        timeoutMs = 20000,
      } = options;
      const url = joinClawEmailUrl(config.baseUrl, path, searchParams);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
      let response;
      try {
        response = await fetchImpl(url, {
          method,
          headers: buildClawEmailHeaders(config, {
            json: payload !== undefined,
          }),
          body: payload !== undefined ? JSON.stringify(payload) : undefined,
          signal: controller.signal,
        });
      } catch (err) {
        const errorMessage = err?.name === 'AbortError'
          ? `ClawEmail 请求超时（${Math.round(timeoutMs / 1000)} 秒）`
          : `ClawEmail 请求失败：${err.message}`;
        throw new Error(errorMessage);
      } finally {
        clearTimeout(timeoutId);
      }

      const text = await response.text();
      let parsed;
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        parsed = text;
      }
      if (!response.ok) {
        const payloadError = parsed && typeof parsed === 'object'
          ? (parsed.error || parsed.detail || parsed.message || parsed.msg)
          : '';
        throw new Error(`ClawEmail 请求失败：${payloadError || text || `HTTP ${response.status}`}`);
      }
      if (parsed && typeof parsed === 'object' && parsed.success === false) {
        throw new Error(`ClawEmail 业务错误：${parsed.error || parsed.message || parsed.msg || 'unknown_error'}`);
      }
      return parsed;
    }

    async function fetchClawEmailDuckAddress(state, options = {}) {
      throwIfStopped();
      const latestState = state || await getState();
      const config = ensureClawEmailDuckConfig(latestState, {
        requireAccountId: true,
        requireForwardingMailbox: true,
      });
      const payload = {
        forwardingMailboxEmail: config.forwardingMailbox,
      };
      const note = String(options.note || options.localPart || options.name || '').trim();
      if (note) {
        payload.note = note.slice(0, 300);
      }

      await addLog(`ClawEmail Duck：正在通过 ${config.baseUrl} 生成 Duck 私有地址...`, 'info');
      const result = await requestClawEmailJson(
        config,
        `/api/duck/accounts/${encodeURIComponent(config.duckAccountId)}/addresses`,
        {
          method: 'POST',
          payload,
        }
      );
      const address = getClawEmailDuckAddressFromResponse(result);
      if (!address) {
        throw new Error('ClawEmail 未返回可用的 Duck 地址。');
      }

      await persistResolvedEmailState(latestState, address, {
        source: `generated:${CLAWEMAIL_DUCK_GENERATOR}`,
        preserveAccountIdentity: Boolean(options?.preserveAccountIdentity),
      });
      await addLog(`ClawEmail Duck：已生成 ${address}，转发到 ${config.forwardingMailbox}`, 'ok');
      return address;
    }

    function resolveClawEmailDuckPollMailbox(state = {}, pollPayload = {}, config = getClawEmailDuckConfig(state)) {
      return normalizeClawEmailForwardingMailbox(pollPayload.mailbox || pollPayload.receiveMailbox)
        || config.forwardingMailbox;
    }

    function resolveClawEmailDuckRegistrationEmail(state = {}, pollPayload = {}) {
      return normalizeClawEmailAddress(pollPayload.targetEmail)
        || normalizeClawEmailAddress(state.email);
    }

    async function listClawEmailDuckMessages(state, options = {}) {
      const latestState = state || await getState();
      const config = ensureClawEmailDuckConfig(latestState, {
        requireForwardingMailbox: true,
      });
      const mailbox = resolveClawEmailDuckPollMailbox(latestState, options, config);
      if (!mailbox) {
        throw new Error('ClawEmail Duck 缺少转发收件邮箱。');
      }
      const registrationEmail = normalizeClawEmailAddress(options.registrationEmail);
      const payload = await requestClawEmailJson(config, '/api/mails', {
        method: 'GET',
        searchParams: {
          connectionId: options.connectionId || latestState.clawEmailConnectionId || '',
          mailbox,
          sync: 'true',
          limit: Number(options.limit) || DEFAULT_MAIL_PAGE_SIZE,
          offset: Number(options.offset) || 0,
          keyword: registrationEmail || options.keyword || '',
        },
        timeoutMs: Number(options.timeoutMs) || 30000,
      });
      return {
        config,
        mailbox,
        messages: normalizeClawEmailMessages(payload),
      };
    }

    function summarizeClawEmailDuckMessagesForLog(messages) {
      return (messages || [])
        .slice()
        .sort((left, right) => {
          const leftTime = Date.parse(left.receivedDateTime || '') || 0;
          const rightTime = Date.parse(right.receivedDateTime || '') || 0;
          return rightTime - leftTime;
        })
        .slice(0, 3)
        .map((message) => {
          const receivedAt = message?.receivedDateTime || '未知时间';
          const sender = message?.from?.emailAddress?.address || '未知发件人';
          const subject = message?.subject || '（无主题）';
          const preview = String(message?.bodyPreview || '').replace(/\s+/g, ' ').trim().slice(0, 80);
          return `${receivedAt} | ${sender} | ${subject} | ${preview}`;
        })
        .join(' || ');
    }

    async function pollClawEmailDuckVerificationCode(step, state, pollPayload = {}) {
      const latestState = state || await getState();
      const config = ensureClawEmailDuckConfig(latestState, {
        requireForwardingMailbox: true,
      });
      const registrationEmail = resolveClawEmailDuckRegistrationEmail(latestState, pollPayload);
      const mailbox = resolveClawEmailDuckPollMailbox(latestState, pollPayload, config);
      if (!registrationEmail) {
        throw new Error('ClawEmail Duck 轮询前缺少注册 Duck 邮箱地址。');
      }
      if (!mailbox) {
        throw new Error('ClawEmail Duck 轮询前缺少转发收件邮箱。');
      }

      await addLog(`步骤 ${step}：正在轮询 ClawEmail 收件邮箱（${mailbox}），注册邮箱为 ${registrationEmail}...`, 'info');
      const maxAttempts = Math.max(
        CLAWEMAIL_DUCK_MIN_POLL_ATTEMPTS,
        Math.floor(Number(pollPayload.maxAttempts) || 0)
      );
      const intervalMs = Math.max(
        CLAWEMAIL_DUCK_MIN_POLL_INTERVAL_MS,
        Math.floor(Number(pollPayload.intervalMs) || 0)
      );
      let lastError = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        throwIfStopped();
        try {
          const { messages } = await listClawEmailDuckMessages(latestState, {
            mailbox,
            registrationEmail,
            connectionId: pollPayload.connectionId,
            limit: pollPayload.limit || DEFAULT_MAIL_PAGE_SIZE,
            offset: pollPayload.offset || 0,
          });
          const matchResult = pickVerificationMessageWithTimeFallback(messages, {
            afterTimestamp: pollPayload.filterAfterTimestamp || 0,
            senderFilters: pollPayload.senderFilters || [],
            subjectFilters: pollPayload.subjectFilters || [],
            requiredKeywords: pollPayload.requiredKeywords || [],
            codePatterns: pollPayload.codePatterns || [],
            excludeCodes: pollPayload.excludeCodes || [],
          });
          const match = matchResult.match;
          if (match?.code) {
            if (matchResult.usedRelaxedFilters || matchResult.usedTimeFallback) {
              const fallbackLabel = matchResult.usedTimeFallback ? '时间回退' : '宽松匹配';
              await addLog(`步骤 ${step}：严格规则未命中，已改用 ${fallbackLabel} 并命中 ClawEmail Duck 验证码。`, 'warn');
            }
            return {
              ok: true,
              code: match.code,
              emailTimestamp: match.receivedAt || Date.now(),
              mailId: match.message?.id || '',
            };
          }

          lastError = new Error(`步骤 ${step}：暂未在 ClawEmail Duck 邮件中找到匹配验证码（${attempt}/${maxAttempts}）。`);
          await addLog(lastError.message, attempt === maxAttempts ? 'warn' : 'info');
          const sample = summarizeClawEmailDuckMessagesForLog(messages);
          if (sample) {
            await addLog(`步骤 ${step}：最近邮件样本：${sample}`, 'info');
          }
        } catch (err) {
          lastError = err;
          await addLog(`步骤 ${step}：ClawEmail Duck 轮询失败：${err.message}`, 'warn');
        }

        if (attempt < maxAttempts) {
          await sleepWithStop(intervalMs);
        }
      }

      throw lastError || new Error(`步骤 ${step}：未在 ClawEmail Duck 中找到新的匹配验证码。`);
    }

    return {
      ensureClawEmailDuckConfig,
      fetchClawEmailDuckAddress,
      getClawEmailDuckConfig,
      listClawEmailDuckMessages,
      pollClawEmailDuckVerificationCode,
      requestClawEmailJson,
      resolveClawEmailDuckPollMailbox,
      resolveClawEmailDuckRegistrationEmail,
    };
  }

  return {
    createClawEmailDuckProvider,
  };
});
