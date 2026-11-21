import { useRef, useEffect } from 'react';
import {
  Clapperboard,
  BookOpen,
  MessageCircle,
  ArrowUp,
  ArrowRight,
  Sparkles,
  LockKeyhole,
  Check,
  AlertCircle,
} from 'lucide-react';
import { CreationKind, Discussion, Locale } from '../types';
import { getBriefProgress, SAMPLE_IDEAS } from '../data/schema';
import { fieldLabel, t } from '../data/i18n';

interface ChatPanelProps {
  locale: Locale;
  discussion: Discussion;
  inputValue: string;
  onInputChange: (val: string) => void;
  onSelectKind: (kind: CreationKind) => void;
  onSend: () => void;
  busy: boolean;
  streamingText: string;
  errorText: string | null;
  onSwitchToBrief: () => void;
  onStartStudio: () => void;
}

const CREATION_TYPES: { id: CreationKind; icon: typeof Clapperboard }[] = [
  { id: 'film', icon: Clapperboard },
  { id: 'text', icon: BookOpen },
  { id: 'character', icon: MessageCircle },
];

export function ChatPanel({
  locale,
  discussion,
  inputValue,
  onInputChange,
  onSelectKind,
  onSend,
  busy,
  streamingText,
  errorText,
  onSwitchToBrief,
  onStartStudio,
}: ChatPanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const convRef = useRef<HTMLDivElement>(null);

  const hasMessages = discussion.messages.length > 0;
  const progress = getBriefProgress(discussion.brief, discussion.kind);
  const lockedTypeMeta = CREATION_TYPES.find((c) => c.id === discussion.kind)!;
  const LockedIcon = lockedTypeMeta.icon;

  useEffect(() => {
    if (convRef.current) {
      convRef.current.scrollTop = convRef.current.scrollHeight;
    }
  }, [discussion.messages.length, busy, streamingText]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [inputValue]);

  const introCopy =
    discussion.kind === 'film'
      ? t(locale, 'assistantIntroFilm')
      : discussion.kind === 'text'
        ? t(locale, 'assistantIntroText')
        : t(locale, 'assistantIntroCharacter');

  const suggestions = hasMessages
    ? discussion.suggestedReplies
    : discussion.kindSelected
      ? SAMPLE_IDEAS[discussion.kind][locale]
      : [];

  const canSubmit = discussion.kindSelected && inputValue.trim().length > 0 && !busy;

  return (
    <>
      {!hasMessages && <h1 className="df-hero-title">{t(locale, 'startTitle')}</h1>}

      {hasMessages && (
        <div className="df-conversation" ref={convRef} aria-live="polite">
          <div className="df-message" data-role="assistant">
            <span className="df-assistant-avatar">
              <Sparkles size={16} />
            </span>
            <p className="df-message-bubble">{introCopy}</p>
          </div>

          {discussion.messages.map((msg) => (
            <div key={msg.id} className="df-message" data-role={msg.role}>
              {msg.role === 'assistant' && (
                <span className="df-assistant-avatar">
                  <Sparkles size={16} />
                </span>
              )}
              <div style={{ maxWidth: '85%' }}>
                <p className="df-message-bubble" style={{ maxWidth: '100%' }}>
                  {msg.content}
                </p>
                {msg.updatedFields && msg.updatedFields.length > 0 && (
                  <div className="df-message-tags">
                    {msg.updatedFields.map((fk) => (
                      <span key={fk} className="df-field-badge">
                        <Check size={11} />
                        {fieldLabel(locale, discussion.kind, fk)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {busy && (
            <div className="df-message" data-role="assistant">
              <span className="df-assistant-avatar">
                <Sparkles size={16} />
              </span>
              <p className="df-message-bubble" style={{ color: streamingText ? '#d9d5e0' : '#9e95ae' }}>
                {streamingText || t(locale, 'thinkingStatus')}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="df-input-dock">
        <form
          className="df-composer"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) onSend();
          }}
        >
          <textarea
            ref={textareaRef}
            id="workspace-agent-idea"
            rows={1}
            maxLength={2000}
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (canSubmit) onSend();
              }
            }}
            placeholder={t(locale, 'composerPlaceholder')}
            aria-label="Describe your idea"
          />

          <div className="df-composer-footer">
            <div className="df-type-selector" role="group" aria-label="Creation type">
              {discussion.kindLocked ? (
                <span className="df-type-locked" title={t(locale, 'typeLockedTooltip')}>
                  <LockedIcon size={15} />
                  <span>{t(locale, discussion.kind)}</span>
                  <LockKeyhole size={12} />
                </span>
              ) : (
                CREATION_TYPES.map(({ id, icon: Icon }) => {
                  const selected = discussion.kindSelected && discussion.kind === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      className="df-type-pill"
                      aria-pressed={selected}
                      data-selected={selected || undefined}
                      disabled={busy}
                      onClick={() => onSelectKind(id)}
                    >
                      <Icon size={15} />
                      <span>{t(locale, id)}</span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="df-composer-right">
              <span className="df-fee-label">{t(locale, 'creditsPerUse')}</span>
              <button
                type="submit"
                className="df-submit-btn"
                aria-label={t(locale, 'send')}
                disabled={!canSubmit}
              >
                {busy ? (
                  <span className="df-thinking-dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : (
                  <ArrowUp size={19} />
                )}
              </button>
            </div>
          </div>
        </form>

        {errorText && (
          <div
            role="alert"
            style={{
              marginTop: 10,
              padding: '9px 14px',
              borderRadius: 10,
              background: 'rgba(239, 175, 165, 0.1)',
              border: '1px solid #6e3b36',
              color: '#efafa5',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <AlertCircle size={15} />
            <span>{errorText}</span>
          </div>
        )}

        {/* Hint + Suggestions */}
        <div
          className="df-suggestions"
          aria-label={hasMessages ? t(locale, 'suggestedReplies') : t(locale, 'ideasToTry')}
        >
          {!discussion.kindLocked && (
            <span className="df-type-hint">
              {discussion.kindSelected ? t(locale, 'typeSelectedHint') : t(locale, 'chooseTypeHint')}
            </span>
          )}

          {suggestions.map((text, idx) => (
            <button
              key={`${idx}-${text.slice(0, 16)}`}
              type="button"
              className="df-suggestion-btn"
              disabled={busy}
              onClick={() => {
                onInputChange(text);
                textareaRef.current?.focus();
              }}
            >
              {hasMessages ? (
                <ArrowRight size={16} />
              ) : idx === 0 ? (
                <LockedIcon size={17} />
              ) : idx === 1 ? (
                <Sparkles size={17} />
              ) : (
                <MessageCircle size={17} />
              )}
              <span>{text}</span>
            </button>
          ))}
        </div>

        {/* Readiness status bar when chatting */}
        {hasMessages && (
          <div className="df-chat-readiness" data-ready={progress.complete || undefined}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              {progress.complete && <Check size={14} />}
              {progress.complete
                ? `${t(locale, 'readyToCreate')} (${progress.confirmed}/${progress.total})`
                : t(locale, 'stillToConfirm', {
                    fields: progress.missingKeys
                      .map((k) => fieldLabel(locale, discussion.kind, k))
                      .join(' / '),
                  })}
            </span>
            <div className="df-chat-readiness-actions">
              <button
                type="button"
                className="df-btn-secondary"
                style={{ minHeight: 34, padding: '0 12px', fontSize: 12 }}
                onClick={onSwitchToBrief}
              >
                {t(locale, 'briefTab')}
              </button>
              {progress.complete && (
                <button
                  type="button"
                  className="df-btn-primary"
                  style={{ minHeight: 34, padding: '0 14px', fontSize: 12 }}
                  onClick={onStartStudio}
                >
                  <span>
                    {discussion.kind === 'film'
                      ? t(locale, 'startFilm')
                      : discussion.kind === 'text'
                        ? t(locale, 'startText')
                        : t(locale, 'startCharacter')}
                  </span>
                  <ArrowRight size={14} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
