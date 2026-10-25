import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Brain, ChevronDown, LoaderCircle } from 'lucide-react';
import { t, translateMessage } from '../../i18n';
import type { AiProgress, AiStatus } from '../../lib/ai/types';
import { StudioButton } from '../StudioUI';

function ThinkingPreview({ reasoning }: { reasoning: string }) {
  const [expanded, setExpanded] = useState(false);
  const preview = useRef<HTMLSpanElement>(null), text = useRef<HTMLDivElement>(null), follow = useRef(true);
  const id = useId();
  useLayoutEffect(() => {
    preview.current?.scrollTo({ top: preview.current.scrollHeight });
    if (expanded && follow.current) text.current?.scrollTo({ top: text.current.scrollHeight });
  }, [reasoning, expanded]);
  return <div className="ai-reasoning" data-expanded={expanded}>
    <StudioButton className="ai-reasoning-toggle" aria-expanded={expanded} aria-controls={id} aria-label={t(expanded ? '收起思考内容' : '展开思考内容')} onClick={() => { follow.current = true; setExpanded(value => !value); }}>
      <Brain size={13}/><span className="ai-reasoning-copy"><span className="ai-reasoning-label">{t('思考内容')}</span>
        {!expanded && <span ref={preview} className="ai-reasoning-preview" aria-hidden="true">{reasoning.replace(/\s+/g, ' ')}</span>}
      </span><ChevronDown size={13}/>
    </StudioButton>
    <div id={id} ref={text} hidden={!expanded} className="ai-reasoning-text" role="region" aria-label={t('思考内容')} aria-live="off" tabIndex={0} onScroll={event => {
      const node = event.currentTarget; follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 40;
    }}>{reasoning}</div>
  </div>;
}

export function AiProgressPanel({ progress, running, status }: { progress: AiProgress; running: boolean; status: AiStatus }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running, progress.startedAt]);
  const label = !running ? status === 'complete' ? t('本次生成已完成') : status === 'waiting' ? t('等待你的选择') : t('已暂停')
    : progress.phase === 'thinking' ? t('正在思考…') : progress.phase === 'connecting' ? t('正在连接模型…') : progress.phase === 'waiting' ? t('已连接，等待模型响应…')
      : progress.phase === 'continuing' ? t('正在自动续写…') : t('正在生成组件…');
  const requested = progress.requestedAt ?? progress.startedAt;
  // Explain long silences by where the time is going: the network, the provider queue, or reasoning before output.
  const hint = !running ? '' : (progress.phase === 'connecting' || progress.phase === 'continuing') && !progress.connectedAt && now - requested > 15000 ? t('接口迟迟没有返回响应头：可能是网络、代理或服务商排队较慢。可以暂停后检查 API 地址。')
    : progress.phase === 'waiting' && now - (progress.connectedAt ?? now) > 15000 ? t('已连接，模型仍在排队或读取上下文；推理模型会先思考再输出。') : '';
  return <section className="ai-progress" aria-label={t('生成进度')}>
    <div className="ai-progress-status" role="status">{running ? <LoaderCircle size={14} className="spin"/> : <Brain size={14}/>}<strong>{label}</strong><time aria-live="off">{t('{0} 秒', { 0: Math.max(0, Math.floor(((progress.endedAt ?? now) - progress.startedAt) / 1000)) })}</time></div>
    <p className="ai-progress-count">{t('第 {0} 轮 · 已完成 {1} 次修改', { 0: progress.round, 1: progress.changes })}</p>
    {progress.detail && <p className="ai-progress-detail">{translateMessage(progress.detail)}</p>}
    {hint && <p className="ai-progress-hint">{hint}</p>}
    {progress.reasoning.trim() && <ThinkingPreview key={progress.startedAt} reasoning={progress.reasoning}/>}
  </section>;
}
