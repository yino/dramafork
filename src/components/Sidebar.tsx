import { useState, useRef, useEffect } from 'react';
import {
  Plus,
  Search,
  SlidersHorizontal,
  Check,
  PanelLeftClose,
  PanelLeftOpen,
  Coins,
  ChevronDown,
  Trash2,
  LogIn,
  LogOut,
  Settings,
  Globe,
} from 'lucide-react';
import { Discussion, Locale, SortMode, UserAccount } from '../types';
import { KIND_SCHEMAS } from '../data/schema';
import { t } from '../data/i18n';
import { BrandLogo } from './BrandLogo';

interface SidebarProps {
  locale: Locale;
  collapsed: boolean;
  onToggleCollapse: () => void;
  discussions: Discussion[];
  activeId: string;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  sortMode: SortMode;
  onSortChange: (m: SortMode) => void;
  onSelectDiscussion: (id: string) => void;
  onNewDiscussion: () => void;
  onDeleteDiscussion: (id: string) => void;
  account: UserAccount;
  onToggleSignIn: () => void;
  onTopUpCredits: () => void;
  onToggleLocale: () => void;
  onOpenSettings: () => void;
}

export function Sidebar({
  locale,
  collapsed,
  onToggleCollapse,
  discussions,
  activeId,
  searchQuery,
  onSearchChange,
  sortMode,
  onSortChange,
  onSelectDiscussion,
  onNewDiscussion,
  onDeleteDiscussion,
  account,
  onToggleSignIn,
  onTopUpCredits,
  onToggleLocale,
  onOpenSettings,
}: SidebarProps) {
  const [sortOpen, setSortOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = discussions
    .filter((d) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        (d.brief.title || '').toLowerCase().includes(q) ||
        (d.brief.summary || '').toLowerCase().includes(q) ||
        d.messages.some((m) => m.content.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => {
      if (sortMode === 'title') {
        return (a.brief.title || 'zzz').localeCompare(b.brief.title || 'zzz');
      }
      if (sortMode === 'created') return b.createdAt - a.createdAt;
      return b.updatedAt - a.updatedAt;
    });

  const nonEmptyDiscussions = filtered.filter(
    (d) => d.messages.length > 0 || Boolean(d.brief.title) || Boolean(d.brief.summary),
  );

  return (
    <aside className="df-sidebar" aria-label="Creation history">
      {/* Collapsed Rail */}
      <div className="df-sidebar-rail">
        <button
          type="button"
          className="df-icon-btn"
          onClick={onToggleCollapse}
          aria-label="Expand history sidebar"
          title="Expand sidebar"
        >
          <PanelLeftOpen size={18} />
        </button>
        <button
          type="button"
          className="df-icon-btn"
          onClick={onNewDiscussion}
          aria-label={t(locale, 'newDiscussion')}
          title={t(locale, 'newDiscussion')}
        >
          <Plus size={18} />
        </button>
      </div>

      {/* Expanded Content */}
      <div className="df-sidebar-content">
        <div className="df-sidebar-header">
          <button
            type="button"
            className="df-brand-link"
            onClick={onNewDiscussion}
            aria-label="DramaFork workspace home"
          >
            <BrandLogo />
          </button>
          <button
            type="button"
            className="df-icon-btn"
            onClick={onToggleCollapse}
            aria-label="Collapse history sidebar"
            title="Collapse sidebar"
          >
            <PanelLeftClose size={17} />
          </button>
        </div>

        <button type="button" className="df-new-discussion-btn" onClick={onNewDiscussion}>
          <Plus size={16} />
          <span>{t(locale, 'newDiscussion')}</span>
        </button>

        <label className="df-search-box">
          <Search size={15} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t(locale, 'searchIdeas')}
            aria-label="Search creation history"
          />
        </label>

        <div className="df-sort-toolbar" ref={sortRef}>
          <span>{t(locale, 'discussions')}</span>
          <button
            type="button"
            className="df-sort-trigger"
            aria-label="Sort discussions"
            aria-expanded={sortOpen}
            onClick={() => setSortOpen((v) => !v)}
          >
            <SlidersHorizontal size={16} />
          </button>

          {sortOpen && (
            <div className="df-dropdown-menu" role="menu">
              {(['updated', 'created', 'title'] as SortMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="menuitemradio"
                  aria-checked={sortMode === mode}
                  data-active={sortMode === mode}
                  className="df-dropdown-item"
                  onClick={() => {
                    onSortChange(mode);
                    setSortOpen(false);
                  }}
                >
                  <span>
                    {mode === 'updated'
                      ? t(locale, 'sortUpdated')
                      : mode === 'created'
                        ? t(locale, 'sortCreated')
                        : t(locale, 'sortTitle')}
                  </span>
                  <Check size={14} style={{ visibility: sortMode === mode ? 'visible' : 'hidden' }} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="df-history-list">
          {nonEmptyDiscussions.length === 0 ? (
            <div className="df-history-empty">
              {searchQuery.trim() ? t(locale, 'noSearchMatch') : t(locale, 'emptyHistory')}
            </div>
          ) : (
            nonEmptyDiscussions.map((item) => {
              const title =
                item.brief.title ||
                (item.kind === 'film'
                  ? t(locale, 'untitledFilm')
                  : item.kind === 'text'
                    ? t(locale, 'untitledText')
                    : t(locale, 'untitledCharacter'));
              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  className="df-history-item"
                  data-active={item.id === activeId}
                  onClick={() => onSelectDiscussion(item.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectDiscussion(item.id);
                    }
                  }}
                >
                  <span
                    className="df-history-dot"
                    style={{ background: KIND_SCHEMAS[item.kind].accentColor }}
                  />
                  <div className="df-history-item-body">
                    <div className="df-history-item-title">{title}</div>
                    <div className="df-history-item-meta">
                      {t(locale, item.kind)} · {item.messages.length} msgs
                    </div>
                  </div>
                  <button
                    type="button"
                    className="df-history-delete"
                    aria-label={t(locale, 'deleteConfirm')}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteDiscussion(item.id);
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="df-sidebar-footer">
          <div className="df-credits-card">
            <button
              type="button"
              className="df-credits-btn"
              onClick={() => {
                setCreditsOpen((v) => !v);
                setAccountOpen(false);
              }}
            >
              <span className="df-credits-left">
                <Coins size={16} color="#cba5ef" />
                <span>{t(locale, 'credits')}</span>
                <span className="df-credits-value">
                  {account.signedIn ? account.credits : '—'}
                </span>
              </span>
              <ChevronDown
                size={15}
                style={{
                  transform: creditsOpen ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.16s',
                }}
              />
            </button>

            {creditsOpen && (
              <div className="df-dropdown-menu up">
                <button
                  type="button"
                  className="df-dropdown-item"
                  onClick={() => {
                    onTopUpCredits();
                    setCreditsOpen(false);
                  }}
                >
                  <span>{t(locale, 'creditsTopUp')}</span>
                  <Plus size={14} />
                </button>
                <button
                  type="button"
                  className="df-dropdown-item"
                  onClick={() => {
                    onOpenSettings();
                    setCreditsOpen(false);
                  }}
                >
                  <span>{t(locale, 'accountSettings')}</span>
                  <Settings size={14} />
                </button>
              </div>
            )}
          </div>

          <div className="df-footer-controls">
            {account.signedIn ? (
              <button
                type="button"
                className="df-avatar-btn"
                title={account.name}
                onClick={() => {
                  setAccountOpen((v) => !v);
                  setCreditsOpen(false);
                }}
              >
                {account.name.slice(0, 1).toUpperCase()}
              </button>
            ) : (
              <button
                type="button"
                className="df-footer-icon-btn"
                title={t(locale, 'signIn')}
                onClick={onToggleSignIn}
              >
                <LogIn size={17} />
              </button>
            )}

            <button
              type="button"
              className="df-footer-icon-btn"
              onClick={onToggleLocale}
              title={locale === 'en' ? 'Switch to 简体中文' : 'Switch to English'}
              aria-label="Switch language"
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12 }}>
                <Globe size={15} />
                {locale === 'en' ? 'EN' : '中'}
              </span>
            </button>

            <button
              type="button"
              className="df-footer-icon-btn"
              onClick={onOpenSettings}
              title={t(locale, 'accountSettings')}
              aria-label={t(locale, 'accountSettings')}
            >
              <Settings size={16} />
            </button>

            <a
              className="df-footer-icon-btn"
              href="https://dramafork.com/workspace"
              target="_blank"
              rel="noreferrer"
              title="DramaFork Official"
              aria-label="External link"
            >
              <span style={{ fontWeight: 700, fontSize: 14 }}>𝕏</span>
            </a>

            {accountOpen && (
              <div className="df-dropdown-menu up">
                <div style={{ padding: '6px 10px', borderBottom: '1px solid #2b2535', marginBottom: 4 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: '#f4f0f7' }}>{account.name}</div>
                  <div style={{ fontSize: 11, color: '#8f859e' }}>{account.email}</div>
                </div>
                <button
                  type="button"
                  className="df-dropdown-item"
                  onClick={() => {
                    onOpenSettings();
                    setAccountOpen(false);
                  }}
                >
                  <span>{t(locale, 'accountSettings')}</span>
                  <Settings size={14} />
                </button>
                <button
                  type="button"
                  className="df-dropdown-item"
                  onClick={() => {
                    onToggleSignIn();
                    setAccountOpen(false);
                  }}
                >
                  <span>{t(locale, 'signOut')}</span>
                  <LogOut size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
