import { useState } from 'react';
import { X, Zap, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { LLMConfig, LLMProvider, Locale } from '../types';
import { testLLMConnection } from '../api/client';
import { t } from '../data/i18n';

interface SettingsModalProps {
  locale: Locale;
  config: LLMConfig;
  onSave: (next: LLMConfig) => Promise<void>;
  onClose: () => void;
}

const PROVIDER_PRESETS: Record<
  LLMProvider,
  { label: string; baseUrl: string; model: string }
> = {
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'anthropic/claude-3.5-sonnet',
  },
  qwen: {
    label: '通义千问 Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
  },
  siliconflow: {
    label: '硅基流动 SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'deepseek-ai/DeepSeek-V3',
  },
  ollama: {
    label: '本地 Ollama',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'qwen2.5:7b',
  },
  custom: {
    label: 'Custom OpenAI-Compatible',
    baseUrl: '',
    model: '',
  },
};

export function SettingsModal({ locale, config, onSave, onClose }: SettingsModalProps) {
  const [draft, setDraft] = useState<LLMConfig>({
    ...config,
    apiKey: '',
  });
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const handleSelectProvider = (provider: LLMProvider) => {
    const preset = PROVIDER_PRESETS[provider];
    setDraft((prev) => ({
      ...prev,
      provider,
      baseUrl: preset.baseUrl || prev.baseUrl,
      model: preset.model || prev.model,
      enabled: true,
    }));
    setTestResult(null);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testLLMConnection(draft);
      if (res.ok) {
        setTestResult({
          ok: true,
          message:
            locale === 'zh'
              ? `连接成功（${res.latencyMs}ms）：${res.reply}`
              : `Connected (${res.latencyMs}ms): ${res.reply}`,
        });
      } else {
        setTestResult({ ok: false, message: res.error || 'Connection failed' });
      }
    } catch (e) {
      setTestResult({
        ok: false,
        message: e instanceof Error ? e.message : 'Network error',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="df-modal-backdrop" onClick={onClose}>
      <div className="df-modal" style={{ width: 'min(520px, 100%)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3>{t(locale, 'accountSettings')}</h3>
          <button type="button" className="df-icon-btn" onClick={onClose} aria-label="Close">
            <X size={17} />
          </button>
        </div>

        <p style={{ margin: '6px 0 0', fontSize: 12.5, color: '#9c93aa', lineHeight: 1.6 }}>
          {locale === 'zh'
            ? '配置将安全保存在本地后端（data/config.json），所有大模型请求由本地 Node 服务代理并支持 SSE 实时流式输出。'
            : 'Saved securely on the local Node backend (data/config.json). All LLM calls are proxied server-side with SSE streaming.'}
        </p>

        <div className="df-modal-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <input
            id="llm-enabled"
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
            style={{ width: 16, height: 16 }}
          />
          <label htmlFor="llm-enabled" style={{ color: '#e6dff0', fontSize: 13, fontWeight: 500 }}>
            {locale === 'zh' ? '启用真实大模型（全链路生效：Chat / Brief / Studio / 试玩）' : 'Enable Live LLM (Chat, Brief, Studio & Play)'}
          </label>
        </div>

        <div className="df-modal-field">
          <label>{locale === 'zh' ? '模型服务商预设' : 'Provider preset'}</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(Object.keys(PROVIDER_PRESETS) as LLMProvider[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handleSelectProvider(p)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 8,
                  border: draft.provider === p ? '1px solid #cba5ef' : '1px solid #302a3d',
                  background: draft.provider === p ? '#2b203b' : '#12101a',
                  color: draft.provider === p ? '#f4f0f7' : '#aba2b8',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                {PROVIDER_PRESETS[p].label}
              </button>
            ))}
          </div>
        </div>

        <div className="df-modal-field">
          <label>API Base URL</label>
          <input
            type="text"
            placeholder="https://api.openai.com/v1"
            value={draft.baseUrl}
            onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
          />
        </div>

        <div className="df-modal-field">
          <label>
            API Key{' '}
            {config.hasApiKey && (
              <span style={{ color: '#91d2ad', marginLeft: 6 }}>
                ({locale === 'zh' ? '已保存' : 'Saved'}: {config.apiKeyMasked})
              </span>
            )}
          </label>
          <input
            type="password"
            placeholder={
              config.hasApiKey
                ? locale === 'zh'
                  ? '留空则保留当前已保存的 Key'
                  : 'Leave blank to keep saved key'
                : 'sk-...'
            }
            value={draft.apiKey}
            onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
          />
        </div>

        <div className="df-modal-field">
          <label>Model</label>
          <input
            type="text"
            placeholder="gpt-4o-mini / deepseek-chat / qwen-plus"
            value={draft.model}
            onChange={(e) => setDraft({ ...draft, model: e.target.value })}
          />
        </div>

        {testResult && (
          <div
            style={{
              marginTop: 14,
              padding: '10px 12px',
              borderRadius: 10,
              fontSize: 12,
              lineHeight: 1.5,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              background: testResult.ok ? 'rgba(145, 210, 173, 0.1)' : 'rgba(239, 175, 165, 0.1)',
              border: `1px solid ${testResult.ok ? '#38634d' : '#6e3b36'}`,
              color: testResult.ok ? '#a8dfc0' : '#efafa5',
            }}
          >
            {testResult.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            <span>{testResult.message}</span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 22 }}>
          <button
            type="button"
            className="df-btn-secondary"
            style={{ minHeight: 38 }}
            disabled={testing}
            onClick={handleTest}
          >
            {testing ? <Loader2 size={14} /> : <Zap size={14} />}
            <span>{locale === 'zh' ? '测试连接' : 'Test connection'}</span>
          </button>

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="df-btn-secondary" style={{ minHeight: 38 }} onClick={onClose}>
              {t(locale, 'cancel')}
            </button>
            <button
              type="button"
              className="df-btn-primary"
              style={{ minHeight: 38 }}
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? <Loader2 size={14} /> : null}
              <span>{t(locale, 'save')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
