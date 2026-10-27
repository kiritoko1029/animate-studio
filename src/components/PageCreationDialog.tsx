import { useState } from 'react';
import { ArrowRight, ChartNoAxesColumnIncreasing, FilePlus2, Globe2, LayoutDashboard, LoaderCircle, Sparkles, X } from 'lucide-react';
import { t } from '../i18n';
import type { PageTask } from '../lib/page-templates';
import { StudioButton, StudioDialog } from './StudioUI';
import '../page-creation.css';

type PageCreationDialogProps = {
  onSelect: (task: PageTask) => Promise<void>;
  onBlank: () => Promise<void>;
  onAi: () => void;
  onAiSite?: () => void;
  onClose: () => void;
};

const tasks = [
  { id: 'website', icon: Globe2, title: '制作网站', description: '从完整的品牌主页开始，替换文字和图片就能使用。', action: '创建网站', preview: 'website', sample: false },
  { id: 'dashboard', icon: ChartNoAxesColumnIncreasing, title: '制作数据看板', description: '用指标、图表、表格和进度整理业务概况。', action: '创建看板', preview: 'dashboard', sample: true },
  { id: 'internal', icon: LayoutDashboard, title: '制作内部工具', description: '从搜索、数据表格和常用操作开始搭建管理页。', action: '创建内部工具', preview: 'internal', sample: true },
] as const;

export function PageCreationDialog({ onSelect, onBlank, onAi, onAiSite, onClose }: PageCreationDialogProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, action: () => void | Promise<void>) => {
    if (busy) return;
    setBusy(key);
    try { await action(); } finally { setBusy(null); }
  };
  return <StudioDialog title={t('从任务或模板开始')} className="page-creation-dialog" onClose={onClose}>
    <div className="page-creation-heading">
      <div><span className="page-creation-eyebrow">{t('新建页面')}</span><h2>{t('你想做什么？')}</h2><p>{t('选一个起点，之后每一步都可以继续修改。')}</p></div>
      <StudioButton className="icon-button" aria-label={t('关闭')} onClick={onClose} disabled={!!busy}><X size={17}/></StudioButton>
    </div>
    <div className="page-creation-body" aria-busy={!!busy}>
      <StudioButton className="page-creation-ai" onClick={() => void run('ai', onAi)} disabled={!!busy}>
        <span className="page-creation-ai-icon"><Sparkles size={19}/></span>
        <span><strong>{t('让 AI 帮我创建')}</strong><small>{t('用一句话生成页面，也可以随时接着修改。')}</small></span>
        {busy === 'ai' ? <LoaderCircle size={17} className="spin"/> : <ArrowRight size={17}/>}
      </StudioButton>
      {onAiSite && <StudioButton className="secondary-button page-creation-site-ai" onClick={() => void run('site-ai', onAiSite)} disabled={!!busy}><Sparkles size={15}/>{t('用 AI 创建完整站点（先确认页面结构）')}</StudioButton>}
      <div className="page-creation-section-label"><span>{t('从模板开始')}</span><span>{t('所有内容都可以编辑')}</span></div>
      <div className="page-creation-grid">
        {tasks.map(task => <StudioButton key={task.id} className={`page-creation-task page-creation-task--${task.preview}`} onClick={() => void run(task.id, () => onSelect(task.id))} disabled={!!busy}>
          <span className="page-creation-preview" aria-hidden="true"><span className="page-creation-preview-bar"/><span className="page-creation-preview-body"><i/><i/><i/><i/></span></span>
          <span className="page-creation-task-title"><task.icon size={16}/><strong>{t(task.title)}</strong>{task.sample && <span className="page-creation-sample">{t('示例数据')}</span>}</span>
          <span className="page-creation-description">{t(task.description)}</span>
          <span className="page-creation-action">{busy === task.id ? <LoaderCircle size={13} className="spin"/> : null}{t(task.action)}<ArrowRight size={13}/></span>
        </StudioButton>)}
      </div>
    </div>
    <div className="page-creation-footer"><span>{t('不需要模板？')}</span><StudioButton className="text-button" onClick={() => void run('blank', onBlank)} disabled={!!busy}>{busy === 'blank' ? <LoaderCircle size={13} className="spin"/> : <FilePlus2 size={13}/>}{t('从空白页面开始')}</StudioButton></div>
  </StudioDialog>;
}
