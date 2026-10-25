import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, LocateFixed } from 'lucide-react';
import type { PageDocument } from '../../model';
import { t } from '../../i18n';
import { blockLabel } from '../../i18n/catalog';
import { inspectAiPage, type AiQualityIssue } from '../../lib/ai/quality';
import { StudioButton } from '../StudioUI';

function describe(issue: AiQualityIssue) {
  switch (issue.kind) {
    case 'bounds': return t('组件超出画布或页边距');
    case 'overlap': return t('组件区域重叠，请确认是否为有意叠放');
    case 'link': return t('页内链接没有目标：{0}', { 0: issue.detail });
    case 'overflow': return t('内容可能溢出组件边框');
    case 'contrast': return t('文字对比度可能不足（实测 / 建议：{0}）', { 0: issue.detail });
  }
}

export function AiQualityReport({ page, getSurface, onReveal }: { page: PageDocument; getSurface: () => HTMLElement | null; onReveal: (id: string) => void }) {
  const latest = useRef(getSurface); latest.current = getSurface;
  const [report, setReport] = useState(() => inspectAiPage(page));
  useEffect(() => {
    let active = true, frame = 0, observed: HTMLElement | null = null;
    const nodes = new Set<Element>(), animations = new WeakSet<Animation>();
    const schedule = () => { if (active && !frame) frame = requestAnimationFrame(measure); };
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    const mutation = typeof MutationObserver === 'undefined' ? null : new MutationObserver(schedule);
    function measure() {
      frame = 0;
      if (!active) return;
      const surface = latest.current();
      setReport(inspectAiPage(page, surface));
      if (!surface) return;
      if (observed !== surface) { resize?.disconnect(); mutation?.disconnect(); nodes.clear(); observed = surface; mutation?.observe(surface, { childList: true, subtree: true }); }
      for (const node of [surface, ...surface.querySelectorAll('.page-block, .page-block-content')]) if (!nodes.has(node)) { nodes.add(node); resize?.observe(node); }
      for (const animation of surface.getAnimations?.({ subtree: true }) ?? []) {
        const timing = animation.effect?.getComputedTiming();
        if (animations.has(animation) || !timing || !Number.isFinite(timing.endTime) || Number(timing.endTime) > 2000) continue;
        animations.add(animation); void animation.finished.then(schedule, schedule);
      }
    }
    setReport(inspectAiPage(page)); schedule();
    const timer = setTimeout(schedule, 650);
    void document.fonts?.ready.then(schedule, schedule);
    return () => { active = false; cancelAnimationFrame(frame); clearTimeout(timer); resize?.disconnect(); mutation?.disconnect(); };
  }, [page]);
  return <details className="ai-change-log" data-ai-quality>
    <summary>{report.issues.length ? <AlertCircle size={13}/> : <Check size={13}/>}<span>{t('生成后检查')}{report.issues.length ? ` · ${t('{0} 项待确认', { 0: report.issues.length })}` : ''}</span></summary>
    <p className="ai-mini-status">{t('辅助检查只提示当前可识别的问题，不会自动修改页面，也不能代替完整的视觉与交互检查。')}</p>
    {!report.measured && <p className="ai-mini-status">{t('尚未取得渲染尺寸，仅完成结构与链接检查。')}</p>}
    {report.measured && !report.issues.length && <p className="ai-mini-status">{t('当前未发现上述辅助检查可识别的问题。')}</p>}
    {!!report.issues.length && <ul>{report.issues.slice(0, 20).map((issue, index) => <li key={`${issue.kind}:${issue.blockIds.join(':')}:${index}`}>
      <AlertCircle size={11}/><span>{describe(issue)}<br/>{issue.blockIds.map(id => {
        const block = page.blocks.find(item => item.id === id);
        return block && <StudioButton key={id} className="text-button" onClick={() => onReveal(id)} aria-label={t('定位{0}', { 0: blockLabel(block) })}><LocateFixed size={11}/>{blockLabel(block)}</StudioButton>;
      })}</span>
    </li>)}</ul>}
    {report.issues.length > 20 && <p className="ai-mini-status">{t('先显示前 20 项，调整后会重新检查。')}</p>}
  </details>;
}
