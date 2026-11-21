import { useState, useEffect, useCallback, useRef } from 'react';
import { Check, Clapperboard, Sparkles } from 'lucide-react';
import {
  CreationKind,
  Discussion,
  LLMConfig,
  Locale,
  SortMode,
  StoryNode,
  UserAccount,
  WorkspaceView,
} from './types';
import {
  createEmptyBrief,
  getBriefProgress,
  setBriefFieldValue,
} from './data/schema';
import { t } from './data/i18n';
import {
  aiCompleteBrief,
  aiGenerateStudioNodes,
  fetchWorkspaceState,
  saveLLMConfig,
  saveWorkspaceState,
  streamCreativeChat,
} from './api/client';
import { Sidebar } from './components/Sidebar';
import { ChatPanel } from './components/ChatPanel';
import { BriefPanel } from './components/BriefPanel';
import { StudioPanel } from './components/StudioPanel';
import { SettingsModal } from './components/SettingsModal';

function createBlankDiscussion(): Discussion {
  const now = Date.now();
  return {
    id: `disc-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    kind: 'film',
    kindSelected: false,
    kindLocked: false,
    createdAt: now,
    updatedAt: now,
    messages: [],
    brief: createEmptyBrief(),
    suggestedReplies: [],
    studioNodes: [],
    studioCreated: false,
  };
}

function BriefProgressRing({ confirmed, total, ready }: { confirmed: number; total: number; ready: boolean }) {
  if (ready) {
    return (
      <span className="df-brief-ring" data-ready="true">
        <Check size={14} strokeWidth={2.5} />
      </span>
    );
  }
  const segments = Math.max(total, 6);
  const r = 6.5;
  const cx = 9;
  const cy = 9;
  const step = (Math.PI * 2) / segments;
  const gap = 0.24;

  return (
    <span className="df-brief-ring" data-ready="false" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 18 18">
        {Array.from({ length: segments }, (_, i) => {
          const a0 = -Math.PI / 2 + i * step + gap / 2;
          const a1 = -Math.PI / 2 + (i + 1) * step - gap / 2;
          const x0 = cx + r * Math.cos(a0);
          const y0 = cy + r * Math.sin(a0);
          const x1 = cx + r * Math.cos(a1);
          const y1 = cy + r * Math.sin(a1);
          const active = i < confirmed;
          return (
            <path
              key={i}
              d={`M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`}
              fill="none"
              stroke={active ? '#91d2ad' : '#d7b36f'}
              strokeOpacity={active ? 1 : 0.72}
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          );
        })}
      </svg>
    </span>
  );
}

export default function App() {
  const [locale, setLocale] = useState<Locale>('en');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [view, setView] = useState<WorkspaceView>('chat');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('updated');
  const [inputValue, setInputValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [liveReady, setLiveReady] = useState(false);

  const [discussions, setDiscussions] = useState<Discussion[]>(() => [createBlankDiscussion()]);
  const [activeId, setActiveId] = useState<string>(() => discussions[0].id);

  const [account, setAccount] = useState<UserAccount>({
    signedIn: true,
    name: 'Yino',
    email: 'creator@dramafork.local',
    credits: 25,
  });

  const [llmConfig, setLlmConfig] = useState<LLMConfig>({
    enabled: false,
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
  });

  const hydratedRef = useRef(false);

  // Load persisted state from local Node backend
  useEffect(() => {
    let active = true;
    fetchWorkspaceState()
      .then((state) => {
        if (!active) return;
        if (state.account) setAccount(state.account);
        if (state.llm) setLlmConfig({ ...state.llm, apiKey: '' });
        setLiveReady(Boolean(state.liveReady));
        if (Array.isArray(state.discussions) && state.discussions.length > 0) {
          setDiscussions(state.discussions);
          setActiveId(state.discussions[0].id);
        }
        hydratedRef.current = true;
      })
      .catch(() => {
        hydratedRef.current = true;
      });
    return () => {
      active = false;
    };
  }, []);

  // Auto-save state to backend (debounced)
  useEffect(() => {
    if (!hydratedRef.current) return;
    const timer = setTimeout(() => {
      saveWorkspaceState({ account, discussions }).catch(() => {
        // ignore transient save errors
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [account, discussions]);

  useEffect(() => {
    document.title = t(locale, 'appTitle');
  }, [locale]);

  const activeDiscussion =
    discussions.find((d) => d.id === activeId) || discussions[0];

  const progress = getBriefProgress(activeDiscussion.brief, activeDiscussion.kind);

  const updateActive = useCallback(
    (updater: (d: Discussion) => Discussion) => {
      setDiscussions((prev) =>
        prev.map((item) => (item.id === activeDiscussion.id ? updater(item) : item)),
      );
    },
    [activeDiscussion.id],
  );

  const handleNewDiscussion = () => {
    const fresh = createBlankDiscussion();
    setDiscussions((prev) => [fresh, ...prev]);
    setActiveId(fresh.id);
    setInputValue('');
    setErrorText(null);
    setView('chat');
  };

  const handleDeleteDiscussion = (id: string) => {
    setDiscussions((prev) => {
      const next = prev.filter((d) => d.id !== id);
      if (next.length === 0) {
        const fresh = createBlankDiscussion();
        setActiveId(fresh.id);
        return [fresh];
      }
      if (id === activeId) {
        setActiveId(next[0].id);
      }
      return next;
    });
  };

  const handleSelectKind = (kind: CreationKind) => {
    if (activeDiscussion.kindLocked || busy) return;
    updateActive((d) => ({
      ...d,
      kind,
      kindSelected: true,
      updatedAt: Date.now(),
    }));
  };

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text || busy || !activeDiscussion.kindSelected) return;

    const userMsg = {
      id: `m-${Date.now().toString(36)}-u`,
      role: 'user' as const,
      content: text,
      timestamp: Date.now(),
    };

    const currentHistory = activeDiscussion.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setInputValue('');
    setErrorText(null);
    setStreamingText('');
    setBusy(true);

    if (account.signedIn) {
      setAccount((a) => ({ ...a, credits: Math.max(0, a.credits - 2) }));
    }

    updateActive((d) => ({
      ...d,
      kindLocked: true,
      messages: [...d.messages, userMsg],
      updatedAt: Date.now(),
    }));

    let accumulated = '';
    let pendingUpdatedFields: string[] = [];

    try {
      await streamCreativeChat(
        {
          kind: activeDiscussion.kind,
          brief: activeDiscussion.brief,
          userMessage: text,
          history: currentHistory,
          locale,
        },
        {
          onDelta: (delta) => {
            accumulated += delta;
            setStreamingText(accumulated);
          },
          onBrief: (payload) => {
            pendingUpdatedFields = payload.updatedFields || [];
            updateActive((d) => ({
              ...d,
              brief: payload.brief,
              suggestedReplies: payload.suggestedReplies || d.suggestedReplies,
              updatedAt: Date.now(),
            }));
          },
          onDone: (payload) => {
            const finalReply = payload.reply || accumulated;
            updateActive((d) => ({
              ...d,
              messages: [
                ...d.messages,
                {
                  id: `m-${Date.now().toString(36)}-a`,
                  role: 'assistant',
                  content: finalReply,
                  timestamp: Date.now(),
                  updatedFields: pendingUpdatedFields,
                },
              ],
              updatedAt: Date.now(),
            }));
            setStreamingText('');
          },
          onError: (msg) => {
            setErrorText(msg);
            setStreamingText('');
          },
        },
      );
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : 'Request failed');
      setStreamingText('');
    } finally {
      setBusy(false);
    }
  };

  const handleAutoCompleteBrief = async () => {
    setBusy(true);
    setErrorText(null);
    try {
      const res = await aiCompleteBrief({
        kind: activeDiscussion.kind,
        brief: activeDiscussion.brief,
        messages: activeDiscussion.messages.map((m) => ({ role: m.role, content: m.content })),
        locale,
      });
      updateActive((d) => ({
        ...d,
        kindSelected: true,
        brief: res.brief,
        updatedAt: Date.now(),
      }));
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : 'Auto-complete failed');
    } finally {
      setBusy(false);
    }
  };

  const handleStartStudio = async () => {
    if (activeDiscussion.studioNodes.length > 0) {
      setView('studio');
      return;
    }
    setBusy(true);
    setErrorText(null);
    try {
      const res = await aiGenerateStudioNodes({
        kind: activeDiscussion.kind,
        brief: activeDiscussion.brief,
        locale,
      });
      updateActive((d) => ({
        ...d,
        studioNodes: res.nodes,
        studioCreated: true,
        updatedAt: Date.now(),
      }));
      setView('studio');
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : 'Studio generation failed');
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateStudioNodes = (nodes: StoryNode[]) => {
    updateActive((d) => ({
      ...d,
      studioNodes: nodes,
      updatedAt: Date.now(),
    }));
  };

  const handleSaveLLM = async (next: LLMConfig) => {
    const res = await saveLLMConfig(next);
    setLlmConfig({ ...res.llm, apiKey: '' });
    setLiveReady(Boolean(res.liveReady));
  };

  return (
    <div className="df-shell" data-sidebar-collapsed={sidebarCollapsed || undefined}>
      <Sidebar
        locale={locale}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        discussions={discussions}
        activeId={activeDiscussion.id}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        sortMode={sortMode}
        onSortChange={setSortMode}
        onSelectDiscussion={(id) => {
          setActiveId(id);
          setView('chat');
        }}
        onNewDiscussion={handleNewDiscussion}
        onDeleteDiscussion={handleDeleteDiscussion}
        account={account}
        onToggleSignIn={() =>
          setAccount((a) => ({
            ...a,
            signedIn: !a.signedIn,
          }))
        }
        onTopUpCredits={() => setAccount((a) => ({ ...a, credits: a.credits + 25 }))}
        onToggleLocale={() => setLocale((l) => (l === 'en' ? 'zh' : 'en'))}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="df-main">
        {/* Top Segmented Control */}
        <header className="df-topbar">
          <div className="df-view-selector" role="tablist" aria-label="Creation view">
            <button
              type="button"
              role="tab"
              id="agent-chat-tab"
              className="df-view-tab"
              aria-selected={view === 'chat'}
              onClick={() => setView('chat')}
            >
              {t(locale, 'chatTab')}
            </button>
            <button
              type="button"
              role="tab"
              id="agent-brief-tab"
              className="df-view-tab"
              aria-selected={view === 'brief'}
              onClick={() => setView('brief')}
            >
              <span>{t(locale, 'briefTab')}</span>
              <BriefProgressRing
                confirmed={progress.confirmed}
                total={progress.total}
                ready={progress.complete}
              />
            </button>
            {activeDiscussion.studioCreated && (
              <button
                type="button"
                role="tab"
                className="df-view-tab"
                aria-selected={view === 'studio'}
                onClick={() => setView('studio')}
              >
                <Clapperboard size={14} />
                <span>{t(locale, 'studioTab')}</span>
              </button>
            )}
          </div>

          <div className="df-topbar-right">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                height: 34,
                padding: '0 12px',
                borderRadius: 999,
                border: `1px solid ${liveReady ? '#315945' : '#2e293b'}`,
                background: liveReady ? 'rgba(145, 210, 173, 0.08)' : '#14131d',
                color: liveReady ? '#9adbb5' : '#9c93aa',
                fontSize: 12,
                cursor: 'pointer',
              }}
              title={locale === 'zh' ? '配置大模型 API' : 'Configure LLM API'}
            >
              <Sparkles size={13} color={liveReady ? '#91d2ad' : '#cba5ef'} />
              <span>
                {liveReady
                  ? `Live AI · ${llmConfig.model || llmConfig.provider}`
                  : locale === 'zh'
                    ? '内置引擎 · 配置大模型'
                    : 'Demo Engine · Connect AI'}
              </span>
            </button>
          </div>
        </header>

        {/* Main Workspace Stage */}
        <div
          className="df-stage"
          data-view={view}
          data-empty-chat={view === 'chat' && activeDiscussion.messages.length === 0 ? 'true' : undefined}
        >
          {view === 'chat' && (
            <ChatPanel
              locale={locale}
              discussion={activeDiscussion}
              inputValue={inputValue}
              onInputChange={setInputValue}
              onSelectKind={handleSelectKind}
              onSend={handleSend}
              busy={busy}
              streamingText={streamingText}
              errorText={errorText}
              onSwitchToBrief={() => setView('brief')}
              onStartStudio={handleStartStudio}
            />
          )}

          {view === 'brief' && (
            <BriefPanel
              locale={locale}
              discussion={activeDiscussion}
              busy={busy}
              onUpdateTitle={(title) =>
                updateActive((d) => ({
                  ...d,
                  brief: { ...d.brief, title },
                  updatedAt: Date.now(),
                }))
              }
              onUpdateField={(key, val) =>
                updateActive((d) => ({
                  ...d,
                  kindSelected: true,
                  brief: setBriefFieldValue(d.brief, d.kind, key, val, false),
                  updatedAt: Date.now(),
                }))
              }
              onAutoComplete={handleAutoCompleteBrief}
              onReset={handleNewDiscussion}
              onRefineInChat={() => setView('chat')}
              onStartStudio={handleStartStudio}
            />
          )}

          {view === 'studio' && (
            <StudioPanel
              locale={locale}
              discussion={activeDiscussion}
              onUpdateNodes={handleUpdateStudioNodes}
              onBackToBrief={() => setView('brief')}
            />
          )}
        </div>
      </main>

      {settingsOpen && (
        <SettingsModal
          locale={locale}
          config={llmConfig}
          onSave={handleSaveLLM}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
