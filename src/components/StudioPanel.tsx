import { useState, useRef, useEffect } from 'react';
import {
  ArrowLeft,
  Plus,
  Play,
  Download,
  RotateCcw,
  GitBranch,
  Film,
  Sparkles,
  Trash2,
  Wand2,
  Send,
  Loader2,
  MessageSquare,
} from 'lucide-react';
import { Discussion, Locale, StoryChoice, StoryNode } from '../types';
import { aiExpandStudioNode, aiGenerateStudioNodes, streamLivePlay } from '../api/client';
import { t } from '../data/i18n';

interface StudioPanelProps {
  locale: Locale;
  discussion: Discussion;
  onUpdateNodes: (nodes: StoryNode[]) => void;
  onBackToBrief: () => void;
}

interface PlayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export function StudioPanel({
  locale,
  discussion,
  onUpdateNodes,
  onBackToBrief,
}: StudioPanelProps) {
  const nodes = discussion.studioNodes;
  const [selectedNodeId, setSelectedNodeId] = useState<string>(nodes[0]?.id || '');
  const [previewNodeId, setPreviewNodeId] = useState<string>(nodes[0]?.id || '');
  const [previewTrail, setPreviewTrail] = useState<string[]>([]);
  const [regenerating, setRegenerating] = useState(false);
  const [expandingId, setExpandingId] = useState<string | null>(null);

  // Live AI Play state (for Character IP roleplay & Text Game dynamic mode)
  const [playMode, setPlayMode] = useState<'graph' | 'ai-live'>(
    discussion.kind === 'character' ? 'ai-live' : 'graph',
  );
  const [playMessages, setPlayMessages] = useState<PlayMessage[]>([]);
  const [playInput, setPlayInput] = useState('');
  const [playStreaming, setPlayStreaming] = useState('');
  const [playBusy, setPlayBusy] = useState(false);
  const playScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (playScrollRef.current) {
      playScrollRef.current.scrollTop = playScrollRef.current.scrollHeight;
    }
  }, [playMessages.length, playStreaming]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || nodes[0];
  const previewNode = nodes.find((n) => n.id === previewNodeId) || nodes[0];

  const updateSelectedNode = (patch: Partial<StoryNode>) => {
    if (!selectedNode) return;
    onUpdateNodes(nodes.map((n) => (n.id === selectedNode.id ? { ...n, ...patch } : n)));
  };

  const addSceneNode = () => {
    const id = `node-${Date.now().toString(36)}`;
    const newNode: StoryNode = {
      id,
      title: locale === 'zh' ? `0${nodes.length + 1} · 新场景分支` : `0${nodes.length + 1} · New Scene`,
      type: 'scene',
      setting: locale === 'zh' ? '自定义拍摄场景' : 'Custom scene location',
      visualCue: locale === 'zh' ? '中景镜头 · 自然光' : 'Medium shot · Ambient lighting',
      narrative:
        locale === 'zh'
          ? '在这里编写该场景的对白、镜头节奏与冲突推进。'
          : 'Write the scene narrative, dialogue beat, and dramatic escalation here.',
      choices: [],
    };
    onUpdateNodes([...nodes, newNode]);
    setSelectedNodeId(id);
  };

  const deleteNode = (id: string) => {
    if (nodes.length <= 1) return;
    const next = nodes
      .filter((n) => n.id !== id)
      .map((n) => ({
        ...n,
        choices: n.choices.filter((c) => c.targetNodeId !== id),
      }));
    onUpdateNodes(next);
    if (selectedNodeId === id) setSelectedNodeId(next[0].id);
    if (previewNodeId === id) setPreviewNodeId(next[0].id);
  };

  const addChoiceToSelected = () => {
    if (!selectedNode) return;
    const fallbackTarget = nodes.find((n) => n.id !== selectedNode.id)?.id || selectedNode.id;
    const nextChoice: StoryChoice = {
      id: `ch-${Date.now().toString(36)}`,
      label: locale === 'zh' ? '新选项分支' : 'New choice branch',
      targetNodeId: fallbackTarget,
      consequence: '',
    };
    updateSelectedNode({ choices: [...selectedNode.choices, nextChoice] });
  };

  const updateChoice = (choiceId: string, patch: Partial<StoryChoice>) => {
    if (!selectedNode) return;
    updateSelectedNode({
      choices: selectedNode.choices.map((c) => (c.id === choiceId ? { ...c, ...patch } : c)),
    });
  };

  const removeChoice = (choiceId: string) => {
    if (!selectedNode) return;
    updateSelectedNode({
      choices: selectedNode.choices.filter((c) => c.id !== choiceId),
    });
  };

  const handleRegenerateGraph = async () => {
    setRegenerating(true);
    try {
      const res = await aiGenerateStudioNodes({
        kind: discussion.kind,
        brief: discussion.brief,
        locale,
      });
      if (res.nodes?.length) {
        onUpdateNodes(res.nodes);
        setSelectedNodeId(res.nodes[0].id);
        setPreviewNodeId(res.nodes[0].id);
        setPreviewTrail([]);
      }
    } finally {
      setRegenerating(false);
    }
  };

  const handleExpandSelectedNode = async () => {
    if (!selectedNode) return;
    setExpandingId(selectedNode.id);
    try {
      const res = await aiExpandStudioNode({
        kind: discussion.kind,
        brief: discussion.brief,
        node: selectedNode,
        locale,
      });
      if (res.patch) {
        updateSelectedNode(res.patch);
      }
    } finally {
      setExpandingId(null);
    }
  };

  const handleSendLivePlay = async () => {
    const text = playInput.trim();
    if (!text || playBusy) return;
    const userMsg: PlayMessage = {
      id: `pm-${Date.now().toString(36)}-u`,
      role: 'user',
      content: text,
    };
    const nextHistory = [...playMessages, userMsg];
    setPlayMessages(nextHistory);
    setPlayInput('');
    setPlayBusy(true);
    setPlayStreaming('');

    let accumulated = '';
    try {
      await streamLivePlay(
        {
          kind: discussion.kind,
          brief: discussion.brief,
          history: playMessages.map((m) => ({ role: m.role, content: m.content })),
          playerInput: text,
          locale,
        },
        {
          onDelta: (delta) => {
            accumulated += delta;
            setPlayStreaming(accumulated);
          },
          onDone: (reply) => {
            const finalContent = reply || accumulated;
            setPlayMessages((prev) => [
              ...prev,
              { id: `pm-${Date.now().toString(36)}-a`, role: 'assistant', content: finalContent },
            ]);
            setPlayStreaming('');
          },
          onError: (msg) => {
            setPlayMessages((prev) => [
              ...prev,
              { id: `pm-${Date.now().toString(36)}-e`, role: 'assistant', content: `[Error] ${msg}` },
            ]);
            setPlayStreaming('');
          },
        },
      );
    } finally {
      setPlayBusy(false);
    }
  };

  const exportProjectJson = () => {
    const payload = {
      title: discussion.brief.title,
      kind: discussion.kind,
      brief: discussion.brief,
      nodes,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(discussion.brief.title || 'dramafork-project').replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Studio Top Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            className="df-btn-secondary"
            style={{ minHeight: 38, padding: '0 14px' }}
            onClick={onBackToBrief}
          >
            <ArrowLeft size={15} />
            <span>{t(locale, 'studioBackToBrief')}</span>
          </button>
          <div>
            <div style={{ fontSize: 11, color: '#cba5ef', fontWeight: 500 }}>
              DramaFork Studio · {t(locale, discussion.kind)}
            </div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
              {discussion.brief.title || 'Untitled Project'}
            </h2>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <button
            type="button"
            className="df-btn-secondary"
            style={{ minHeight: 38, padding: '0 14px' }}
            disabled={regenerating}
            onClick={handleRegenerateGraph}
          >
            {regenerating ? <Loader2 size={15} /> : <Wand2 size={15} color="#cba5ef" />}
            <span>{locale === 'zh' ? 'AI 重新生成剧本' : 'AI regenerate graph'}</span>
          </button>
          <button
            type="button"
            className="df-btn-secondary"
            style={{ minHeight: 38, padding: '0 14px' }}
            onClick={addSceneNode}
          >
            <Plus size={15} />
            <span>{t(locale, 'studioAddNode')}</span>
          </button>
          <button
            type="button"
            className="df-btn-primary"
            style={{ minHeight: 38, padding: '0 16px' }}
            onClick={exportProjectJson}
          >
            <Download size={15} />
            <span>{t(locale, 'studioExport')}</span>
          </button>
        </div>
      </div>

      {/* Main Split: Scene Graph Editor + Playable Preview / Live AI Play */}
      <div className="df-studio-grid">
        {/* Left: Node List & Inspector */}
        <div className="df-studio-card">
          <div className="df-studio-card-header">
            <h3>
              <GitBranch size={16} color="#cba5ef" />
              <span>{t(locale, 'studioSceneGraph')}</span>
              <span style={{ fontSize: 12, color: '#8f859e', fontWeight: 400 }}>
                ({nodes.length})
              </span>
            </h3>
          </div>

          <div className="df-node-list">
            {nodes.map((node) => (
              <div
                key={node.id}
                className="df-node-card"
                data-selected={selectedNode?.id === node.id || undefined}
                onClick={() => setSelectedNodeId(node.id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <strong style={{ fontSize: 13.5, color: '#f4f0f7' }}>{node.title}</strong>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span className="df-node-badge" data-type={node.type}>
                      {node.type}
                    </span>
                    {nodes.length > 1 && (
                      <button
                        type="button"
                        className="df-icon-btn"
                        style={{ width: 24, height: 24 }}
                        aria-label="Delete node"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNode(node.id);
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
                <p style={{ margin: 0, fontSize: 12.5, color: '#aba2b8', lineHeight: 1.6 }}>
                  {node.narrative}
                </p>
                {node.choices.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                    {node.choices.map((ch) => (
                      <span key={ch.id} className="df-token" style={{ fontSize: 11 }}>
                        → {ch.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {selectedNode && (
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid #2a2436' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 12.5, color: '#cba5ef', fontWeight: 600 }}>
                  {locale === 'zh' ? '编辑当前节点' : 'Edit Selected Node'}
                </div>
                <button
                  type="button"
                  className="df-btn-secondary"
                  style={{ minHeight: 32, padding: '0 12px', fontSize: 12 }}
                  disabled={expandingId === selectedNode.id}
                  onClick={handleExpandSelectedNode}
                >
                  {expandingId === selectedNode.id ? <Loader2 size={13} /> : <Sparkles size={13} color="#cba5ef" />}
                  <span>{locale === 'zh' ? 'AI 扩写润色' : 'AI polish & expand'}</span>
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 10 }}>
                <div className="df-modal-field" style={{ marginTop: 0 }}>
                  <label>{locale === 'zh' ? '节点标题' : 'Node title'}</label>
                  <input
                    value={selectedNode.title}
                    onChange={(e) => updateSelectedNode({ title: e.target.value })}
                  />
                </div>
                <div className="df-modal-field" style={{ marginTop: 0 }}>
                  <label>{locale === 'zh' ? '节点类型' : 'Type'}</label>
                  <select
                    value={selectedNode.type}
                    onChange={(e) =>
                      updateSelectedNode({ type: e.target.value as StoryNode['type'] })
                    }
                    style={{
                      padding: '10px 10px',
                      borderRadius: 10,
                      border: '1px solid #322c40',
                      background: '#0f0d16',
                      color: '#f4f0f7',
                      fontSize: 13,
                    }}
                  >
                    <option value="opening">opening</option>
                    <option value="scene">scene</option>
                    <option value="branch">branch</option>
                    <option value="ending">ending</option>
                  </select>
                </div>
              </div>

              <div className="df-modal-field">
                <label>{locale === 'zh' ? '镜头与氛围提示' : 'Visual & camera cue'}</label>
                <input
                  value={selectedNode.visualCue}
                  onChange={(e) => updateSelectedNode({ visualCue: e.target.value })}
                />
              </div>

              <div className="df-modal-field">
                <label>{locale === 'zh' ? '剧情文本 / 对白' : 'Scene narrative'}</label>
                <textarea
                  className="df-inline-edit"
                  rows={4}
                  value={selectedNode.narrative}
                  onChange={(e) => updateSelectedNode({ narrative: e.target.value })}
                />
              </div>

              {/* Branch Choices Editor */}
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label style={{ fontSize: 12, color: '#b4a9c4' }}>
                    {locale === 'zh' ? '分支选项与跳转目标' : 'Branch choices & targets'}
                  </label>
                  <button
                    type="button"
                    className="df-btn-secondary"
                    style={{ minHeight: 28, padding: '0 10px', fontSize: 11.5 }}
                    onClick={addChoiceToSelected}
                  >
                    <Plus size={12} />
                    <span>{locale === 'zh' ? '添加选项' : 'Add choice'}</span>
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selectedNode.choices.map((ch) => (
                    <div
                      key={ch.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 150px 28px',
                        gap: 8,
                        alignItems: 'center',
                      }}
                    >
                      <input
                        value={ch.label}
                        placeholder="Choice label"
                        onChange={(e) => updateChoice(ch.id, { label: e.target.value })}
                        style={{
                          padding: '8px 10px',
                          borderRadius: 8,
                          border: '1px solid #322c40',
                          background: '#0f0d16',
                          color: '#f4f0f7',
                          fontSize: 12.5,
                        }}
                      />
                      <select
                        value={ch.targetNodeId}
                        onChange={(e) => updateChoice(ch.id, { targetNodeId: e.target.value })}
                        style={{
                          padding: '8px 8px',
                          borderRadius: 8,
                          border: '1px solid #322c40',
                          background: '#0f0d16',
                          color: '#d8b5f7',
                          fontSize: 12,
                        }}
                      >
                        {nodes.map((target) => (
                          <option key={target.id} value={target.id}>
                            → {target.title}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="df-icon-btn"
                        style={{ width: 28, height: 28 }}
                        onClick={() => removeChoice(ch.id)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: Playable Preview + Live AI Interactive Engine */}
        <div className="df-studio-card" style={{ position: 'sticky', top: 20 }}>
          <div className="df-studio-card-header">
            <div style={{ display: 'inline-flex', gap: 6, background: '#181624', padding: 3, borderRadius: 10 }}>
              <button
                type="button"
                onClick={() => setPlayMode('graph')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: 0,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 500,
                  background: playMode === 'graph' ? '#2c253d' : 'transparent',
                  color: playMode === 'graph' ? '#f4f0f7' : '#968da4',
                }}
              >
                <Play size={13} color="#91d2ad" />
                <span>{locale === 'zh' ? '分支试玩' : 'Branch Preview'}</span>
              </button>
              <button
                type="button"
                onClick={() => setPlayMode('ai-live')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: 0,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 500,
                  background: playMode === 'ai-live' ? '#2c253d' : 'transparent',
                  color: playMode === 'ai-live' ? '#f4f0f7' : '#968da4',
                }}
              >
                <MessageSquare size={13} color="#cba5ef" />
                <span>
                  {discussion.kind === 'character'
                    ? locale === 'zh'
                      ? 'AI 角色对话'
                      : 'AI Roleplay'
                    : locale === 'zh'
                      ? 'AI 动态推演'
                      : 'AI Live Play'}
                </span>
              </button>
            </div>

            <button
              type="button"
              className="df-icon-btn"
              title={t(locale, 'studioRestartPreview')}
              onClick={() => {
                if (playMode === 'graph') {
                  setPreviewNodeId(nodes[0]?.id || '');
                  setPreviewTrail([]);
                } else {
                  setPlayMessages([]);
                  setPlayStreaming('');
                }
              }}
            >
              <RotateCcw size={15} />
            </button>
          </div>

          {playMode === 'graph' && previewNode && (
            <>
              <div className="df-preview-screen">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <Film size={14} color="#cba5ef" />
                    <span style={{ fontSize: 12, color: '#cba5ef', fontWeight: 500 }}>
                      {previewNode.title}
                    </span>
                  </div>
                  <div
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: 'rgba(203, 165, 239, 0.08)',
                      border: '1px solid rgba(203, 165, 239, 0.18)',
                      fontSize: 11.5,
                      color: '#cbb9de',
                      marginBottom: 16,
                    }}
                  >
                    <Sparkles size={12} style={{ marginRight: 6, verticalAlign: -2 }} />
                    {previewNode.visualCue}
                  </div>
                  <p style={{ margin: 0, fontSize: 15, lineHeight: 1.85, color: '#f3eef9', whiteSpace: 'pre-wrap' }}>
                    {previewNode.narrative}
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {previewNode.choices.length > 0 ? (
                    previewNode.choices.map((choice) => (
                      <button
                        key={choice.id}
                        type="button"
                        className="df-preview-choice-btn"
                        onClick={() => {
                          setPreviewTrail((prev) => [...prev, choice.label]);
                          setPreviewNodeId(choice.targetNodeId);
                        }}
                      >
                        <span>{choice.label}</span>
                        {choice.consequence && (
                          <small style={{ color: '#9c92ac', fontSize: 11 }}>{choice.consequence}</small>
                        )}
                      </button>
                    ))
                  ) : (
                    <div style={{ textAlign: 'center', padding: '12px 0' }}>
                      <div style={{ color: '#91d2ad', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
                        ✦ {t(locale, 'studioEndReached')}
                      </div>
                      <button
                        type="button"
                        className="df-btn-secondary"
                        style={{ minHeight: 38 }}
                        onClick={() => {
                          setPreviewNodeId(nodes[0]?.id || '');
                          setPreviewTrail([]);
                        }}
                      >
                        <RotateCcw size={14} />
                        <span>{t(locale, 'studioRestartPreview')}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {previewTrail.length > 0 && (
                <div style={{ marginTop: 14, fontSize: 11.5, color: '#8c839a' }}>
                  {locale === 'zh' ? '本次选择路径：' : 'Choice path: '}
                  {previewTrail.join(' → ')}
                </div>
              )}
            </>
          )}

          {playMode === 'ai-live' && (
            <div className="df-preview-screen" style={{ minHeight: 420 }}>
              <div
                ref={playScrollRef}
                style={{
                  flex: 1,
                  maxHeight: 340,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  paddingRight: 4,
                }}
              >
                {playMessages.length === 0 && !playStreaming && (
                  <div style={{ color: '#9f95b0', fontSize: 13, lineHeight: 1.7 }}>
                    {discussion.kind === 'character'
                      ? locale === 'zh'
                        ? `输入第一句话，与「${discussion.brief.title || '角色'}」开启实时 AI 角色扮演对话。`
                        : `Send a message to start a live AI roleplay session with ${discussion.brief.title || 'your character'}.`
                      : locale === 'zh'
                        ? '输入任意你想采取的行动，AI 导演将实时推演世界反应与剧情走向。'
                        : 'Type any action you want to take—the AI game master will narrate consequences live.'}
                  </div>
                )}

                {playMessages.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '88%',
                      padding: '10px 14px',
                      borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      background: m.role === 'user' ? '#2c243a' : '#181523',
                      border: '1px solid #2f2840',
                      fontSize: 13.5,
                      lineHeight: 1.7,
                      whiteSpace: 'pre-wrap',
                      color: '#eee9f5',
                    }}
                  >
                    {m.content}
                  </div>
                ))}

                {playStreaming && (
                  <div
                    style={{
                      alignSelf: 'flex-start',
                      maxWidth: '88%',
                      padding: '10px 14px',
                      borderRadius: '16px 16px 16px 4px',
                      background: '#181523',
                      border: '1px solid #3a2e52',
                      fontSize: 13.5,
                      lineHeight: 1.7,
                      whiteSpace: 'pre-wrap',
                      color: '#eee9f5',
                    }}
                  >
                    {playStreaming}
                  </div>
                )}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendLivePlay();
                }}
                style={{ display: 'flex', gap: 8 }}
              >
                <input
                  value={playInput}
                  onChange={(e) => setPlayInput(e.target.value)}
                  disabled={playBusy}
                  placeholder={
                    discussion.kind === 'character'
                      ? locale === 'zh'
                        ? '对角色说点什么…'
                        : 'Say something to the character…'
                      : locale === 'zh'
                        ? '输入你的下一步行动…'
                        : 'Enter your next action…'
                  }
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: 12,
                    border: '1px solid #342d44',
                    background: '#15121f',
                    color: '#f4f0f7',
                    fontSize: 13,
                    outline: 'none',
                  }}
                />
                <button
                  type="submit"
                  className="df-btn-primary"
                  style={{ minHeight: 40, padding: '0 14px' }}
                  disabled={playBusy || !playInput.trim()}
                >
                  {playBusy ? <Loader2 size={15} /> : <Send size={15} />}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
