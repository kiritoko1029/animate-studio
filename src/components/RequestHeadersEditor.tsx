import { Plus, Trash2 } from 'lucide-react';
import { isSensitiveDataHeader } from '../../shared/data-sources.mjs';
import type { HeaderRow } from '../lib/data/header-fields';
import { t } from '../i18n';
import { StudioButton } from './StudioUI';

export function RequestHeadersEditor({ rows, onChange, forwarding = false }: { forwarding?: boolean; rows: HeaderRow[]; onChange: (rows: HeaderRow[]) => void }) {
  const update = (id: string, patch: Partial<HeaderRow>) => onChange(rows.map(row => row.id === id ? { ...row, ...patch } : row));
  return <section className="request-headers-editor" aria-label={t('请求头')}>
    <div className="request-headers-heading"><h4>{t('请求头')}</h4><StudioButton disabled={rows.length >= 20} onClick={() => onChange([...rows, { id: crypto.randomUUID(), name: '', value: '', local: false }])}><Plus size={13}/>{t('添加请求头')}</StudioButton></div>
    {rows.map((row, index) => {
      const sensitive = isSensitiveDataHeader(row.name), local = row.local || sensitive;
      return <div className="request-header-row" key={row.id}>
        <label className="data-source-field"><span>{t('名称')}</span><input aria-label={t('请求头名称 {0}', { 0: index + 1 })} placeholder="Content-Type / x-token" value={row.name} maxLength={100} autoComplete="off" spellCheck={false} onChange={event => update(row.id, { name: event.target.value, local: row.local || isSensitiveDataHeader(event.target.value) })}/></label>
        <label className="data-source-field"><span>{t('值')}</span><input aria-label={t('请求头值 {0}', { 0: index + 1 })} type={local ? 'password' : 'text'} value={row.value} maxLength={local ? 4096 : 2000} autoComplete="off" spellCheck={false} onChange={event => update(row.id, { value: event.target.value })}/></label>
        <StudioButton className="icon-button" aria-label={t('删除请求头 {0}', { 0: index + 1 })} onClick={() => onChange(rows.filter(item => item.id !== row.id))}><Trash2 size={14}/></StudioButton>
        <label className="request-header-local"><input type="checkbox" checked={local} disabled={sensitive} onChange={event => update(row.id, { local: event.target.checked })}/>{t('值仅保留在当前标签页')}</label>
      </div>;
    })}
    <p className="data-source-hint">{t(forwarding ? '转发支持自定义请求头。x-token、Authorization、Cookie 等认证值仅保留在当前标签页，随本次请求交给本站服务端，再发送至已保存的目标接口；不写入站点、分享、导出或 AI。' : '普通请求头随站点保存；x-token、Authorization 等认证值仅用于本标签页编辑与预览，刷新后需重填，不进入分享、导出或 AI。')}</p>
    <p className="data-source-hint">{t(forwarding ? '转发可显式填写 Cookie、Origin、Referer 和 User-Agent；不会自动复制浏览器 Cookie。Host、Content-Length 等由服务端传输层管理。' : 'Cookie、Origin、Referer 等由浏览器管理，不能作为手工请求头填写。')}</p>
  </section>;
}
