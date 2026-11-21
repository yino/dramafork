import { useState } from 'react';
import {
  RotateCcw,
  ChevronDown,
  MessageCircle,
  ArrowRight,
  Check,
  Sparkles,
} from 'lucide-react';
import { Discussion, Locale } from '../types';
import {
  KIND_SCHEMAS,
  getBriefFieldValue,
  getBriefProgress,
} from '../data/schema';
import { DictKey, fieldLabel, t } from '../data/i18n';

interface BriefPanelProps {
  locale: Locale;
  discussion: Discussion;
  busy: boolean;
  onUpdateTitle: (title: string) => void;
  onUpdateField: (key: string, value: string) => void;
  onAutoComplete: () => void;
  onReset: () => void;
  onRefineInChat: () => void;
  onStartStudio: () => void;
}

export function BriefPanel({
  locale,
  discussion,
  busy,
  onUpdateTitle,
  onUpdateField,
  onAutoComplete,
  onReset,
  onRefineInChat,
  onStartStudio,
}: BriefPanelProps) {
  const { kind, brief } = discussion;
  const schema = KIND_SCHEMAS[kind];
  const progress = getBriefProgress(brief, kind);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftVal, setDraftVal] = useState('');

  const cap = kind === 'film' ? 'Film' : kind === 'text' ? 'Text' : 'Character';
  const untitled = t(locale, `untitled${cap}` as DictKey);
  const eyebrow = t(locale, `brief${cap}` as DictKey);
  const extrasTitle = t(locale, `extras${cap}` as DictKey);
  const startLabel = discussion.studioCreated
    ? t(locale, 'openStudio')
    : t(locale, `start${cap}` as DictKey);

  const progressText = t(locale, kind === 'character' ? 'preparedProgress' : 'progress', {
    done: progress.confirmed,
    total: progress.total,
  });

  const startEdit = (key: string) => {
    setEditingKey(key);
    setDraftVal(getBriefFieldValue(brief, kind, key));
  };

  const commitEdit = (key: string) => {
    onUpdateField(key, draftVal.trim());
    setEditingKey(null);
  };

  const renderField = (key: string) => {
    const def = schema.fields[key];
    if (!def) return null;
    const value = getBriefFieldValue(brief, kind, key);
    const isSuggested = brief.suggestedFields.includes(key);
    const isEditing = editingKey === key;
    const tokens =
      def.isTokens && value
        ? value
            .split(/[,，、\n]/)
            .map((s) => s.trim())
            .filter(Boolean)
        : null;

    return (
      <div
        key={key}
        className={`df-brief-field${def.fullWidth ? ' df-full-width' : ''}`}
        data-brief-field={key}
      >
        <dt>
          <span>{fieldLabel(locale, kind, key)}</span>
          {isSuggested && <small className="df-suggested-badge">{t(locale, 'aiSuggested')}</small>}
          {!value && def.required && (
            <span className="df-pending-dot" title={t(locale, 'pending')} />
          )}
        </dt>

        {isEditing ? (
          <dd>
            <textarea
              className="df-inline-edit"
              rows={key === 'summary' ? 3 : 2}
              value={draftVal}
              autoFocus
              onChange={(e) => setDraftVal(e.target.value)}
              onBlur={() => commitEdit(key)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setEditingKey(null);
                } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  commitEdit(key);
                }
              }}
            />
          </dd>
        ) : (
          <dd
            data-empty={!value || undefined}
            title={t(locale, 'clickToEdit')}
            onClick={() => startEdit(key)}
          >
            {tokens && tokens.length > 0 ? (
              <span className="df-tokens">
                {tokens.map((tok, i) => (
                  <span key={`${i}-${tok}`} className="df-token">
                    {tok}
                  </span>
                ))}
              </span>
            ) : value ? (
              value
            ) : def.required ? (
              t(locale, 'pending')
            ) : (
              t(locale, 'notProvided')
            )}
          </dd>
        )}
      </div>
    );
  };

  return (
    <section
      id="agent-brief-panel"
      role="tabpanel"
      className="df-brief-panel"
      data-template={schema.templateId}
      data-brief-kind={kind}
    >
      <header className="df-brief-header">
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="df-brief-eyebrow">{eyebrow}</p>
          <input
            type="text"
            className="df-brief-title-input"
            value={brief.title}
            placeholder={untitled}
            onChange={(e) => onUpdateTitle(e.target.value)}
            aria-label="Project title"
          />
        </div>
        <div className="df-brief-header-actions">
          {!progress.complete && (
            <button
              type="button"
              className="df-brief-autofill-btn"
              onClick={onAutoComplete}
              disabled={busy}
            >
              <Sparkles size={15} />
              <span>{t(locale, 'autoCompleteBrief')}</span>
            </button>
          )}
          <button
            type="button"
            className="df-brief-reset-btn"
            disabled={busy}
            onClick={onReset}
            aria-label={t(locale, 'resetDiscussion')}
            title={t(locale, 'resetDiscussion')}
          >
            <RotateCcw size={18} />
          </button>
        </div>
      </header>

      <div className="df-brief-progress" aria-label={progressText}>
        <span>{progressText}</span>
        <div className="df-progress-track" aria-hidden="true">
          {Array.from({ length: progress.total }, (_, idx) => (
            <i key={idx} data-confirmed={idx < progress.confirmed || undefined} />
          ))}
        </div>
      </div>

      {kind === 'character' && brief.suggestedFields.length > 0 && (
        <p style={{ color: '#a99ab8', fontSize: 12, margin: '0 0 18px', lineHeight: 1.7 }}>
          {t(locale, 'suggestionNote')}
        </p>
      )}

      <dl className="df-brief-premise">{renderField(schema.summaryKey)}</dl>

      <div className="df-brief-groups">
        {schema.groups.map((grp, idx) => (
          <section key={grp.id} className="df-brief-group" aria-label={t(locale, grp.titleKey as DictKey)}>
            <h3>
              <span className="df-section-index">0{idx + 1}</span>
              <span>{t(locale, grp.titleKey as DictKey)}</span>
            </h3>
            <dl>{grp.fields.map((fk) => renderField(fk))}</dl>
          </section>
        ))}
      </div>

      <details className="df-brief-extras" open={progress.extraCount > 0 || undefined}>
        <summary>
          <span>
            {extrasTitle}
            <small>
              {t(locale, 'optional')} · {t(locale, 'extraCount', { done: progress.extraCount })}
            </small>
          </span>
          <ChevronDown size={17} color="#bda7cd" />
        </summary>
        <dl>{schema.extras.map((fk) => renderField(fk))}</dl>
      </details>

      <footer className="df-brief-footer">
        <div className="df-readiness-info">
          <p className="df-readiness-status" data-ready={progress.complete || undefined}>
            {progress.complete && <Check size={15} style={{ marginTop: 2, flexShrink: 0 }} />}
            <span>
              {progress.complete
                ? t(locale, 'readyToCreate')
                : t(locale, 'stillToConfirm', {
                    fields: progress.missingKeys
                      .map((k) => fieldLabel(locale, kind, k))
                      .join(' / '),
                  })}
            </span>
          </p>
          <small className="df-readiness-sub">{t(locale, 'editableInStudio')}</small>
        </div>

        <div className="df-brief-actions">
          <button type="button" className="df-btn-secondary" disabled={busy} onClick={onRefineInChat}>
            <MessageCircle size={16} />
            <span>{t(locale, 'refineInChat')}</span>
          </button>
          <button
            type="button"
            className="df-btn-primary"
            disabled={!progress.complete || busy}
            onClick={onStartStudio}
          >
            <span>{startLabel}</span>
            <ArrowRight size={17} />
          </button>
        </div>
      </footer>
    </section>
  );
}
