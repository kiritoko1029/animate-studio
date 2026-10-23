import { t, getLocale, translateMessage } from '../../i18n';
import { useEffect, useRef, useState } from 'react';
import { Cloud, Copy, ExternalLink, LoaderCircle, Share2, X } from 'lucide-react';
import { StudioButton, StudioDialog } from '../StudioUI';
import { useAccount } from '../AccountProvider';
import { componentShareUrl } from '../../lib/custom-components/cloud';
import type { DesignerTarget } from '../../lib/custom-components/drafts';
import { useLibrary } from './useCustomLibrary';

type Share = { token: string | null; publishedAt: string | null; sharedRevision: number | null; revision: number };
const time = (value: string) => new Date(value).toLocaleString(getLocale(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * Sharing publishes a snapshot of the component as saved in the account.
 * Later saves do not change the shared copy until it is updated; closing the
 * share or deleting the component makes the old link stop working.
 */
export function ShareComponentDialog({ target, dirty, name, onSaveToAccount, onClose, notify }: { target: DesignerTarget; revision: number | null; dirty: boolean; name: string; onSaveToAccount: () => Promise<boolean>; onClose: () => void; notify: (message: string) => void }) {
  const library = useLibrary();
  const { user } = useAccount();
  const [share, setShare] = useState<Share | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const cloudId = target?.kind === 'cloud' ? target.id : null;

  useEffect(() => {
    setShare(null); setError('');
    if (!cloudId || !user) return;
    let active = true; setLoading(true);
    library.loadCloud(cloudId)
      .then(record => { if (active) setShare({ token: record.shareToken, publishedAt: record.publishedAt, sharedRevision: record.sharedRevision, revision: record.revision }); })
      .catch(failure => { if (active) setError(failure instanceof Error ? failure.message : t("暂时无法读取分享状态。")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [cloudId, user?.id]);

  async function run(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try { await action(); } catch (failure) { setError(failure instanceof Error ? failure.message : t("操作失败，请重试。")); }
    finally { busyRef.current = false; setBusy(false); }
  }
  const publish = () => run(async () => {
    if (!cloudId) return;
    if (dirty && !(await onSaveToAccount())) return;
    const result = await library.publishCloud(cloudId);
    setShare(current => ({ token: result.token, publishedAt: result.publishedAt, sharedRevision: result.revision, revision: Math.max(result.revision, current?.revision ?? 0) }));
    notify(share?.token ? t("分享内容已更新为当前保存的版本") : t("分享链接已创建"));
  });
  const close = () => run(async () => {
    if (!cloudId) return;
    await library.unpublishCloud(cloudId);
    setShare(current => current ? { ...current, token: null, publishedAt: null, sharedRevision: null } : current);
    notify(t("分享已关闭，原链接不再可访问"));
  });

  const link = share?.token ? componentShareUrl(share.token) : '';
  const outdated = share?.token && share.sharedRevision !== null && share.sharedRevision < share.revision;
  return <StudioDialog title={t("分享组件")} className="account-dialog component-share-dialog" onClose={() => { if (!busyRef.current) onClose(); }} dismissOutside={!busy}>
    <header className="account-dialog-heading"><h2>{t("分享「")}{name || t("未命名组件")}」</h2><StudioButton className="icon-button" aria-label={t("关闭")} onClick={() => { if (!busyRef.current) onClose(); }}><X size={17}/></StudioButton></header>
    <p className="account-description">{t("任何持有链接的人都能查看组件介绍和实时预览，并把副本复制到自己的组件库；他们无法修改你的组件。分享的是发布时的快照，之后的保存不会自动同步。")}</p>
    {!cloudId ? <>
      <p className="account-hint">{user ? t("分享前需要先把组件保存到你的账号，本机副本会保留。") : t("分享需要登录，并把组件保存到账号。")}</p>
      {error && <p className="account-error" role="alert">{translateMessage(error)}</p>}
      <div className="account-dialog-actions"><StudioButton className="primary-button" disabled={busy || !user} onClick={() => void run(async () => { await onSaveToAccount(); })}>{busy ? <LoaderCircle size={14} className="spin"/> : <Cloud size={14}/>}{t("保存到账号")}</StudioButton></div>
    </> : loading ? <p className="account-hint"><LoaderCircle size={14} className="spin"/> {t("正在读取分享状态…")}</p> : <>
      {share?.token ? <>
        <label className="account-label" htmlFor="component-share-link">{t("分享链接")}</label>
        <div className="share-link-field"><input id="component-share-link" readOnly value={link} onFocus={event => event.target.select()}/><StudioButton className="icon-button" aria-label={t("复制分享链接")} onClick={async () => { try { await navigator.clipboard.writeText(link); notify(t("分享链接已复制")); } catch { setError(t("请选中上方链接，手动复制。")); } }}><Copy size={16}/></StudioButton></div>
        <a className="account-preview-link" href={link} target="_blank" rel="noreferrer">{t("打开分享页")}<ExternalLink size={13}/></a>
        <p className="account-hint">{t("已发布版本 v")}{share.sharedRevision}{share.publishedAt ? ` · ${time(share.publishedAt)}` : ''}{outdated ? t("。账号中已保存到 v{0}，点击“更新分享内容”后访客才会看到。", { 0: share.revision }) : ''}</p>
      </> : <p className="account-hint">{t("这个组件还没有分享。")}</p>}
      {dirty && <p className="account-hint">{t("设计器中有未保存的修改。发布时会先保存到账号，再发布保存后的版本。")}</p>}
      {error && <p className="account-error" role="alert">{translateMessage(error)}</p>}
      <div className="account-dialog-actions">
        <StudioButton className="primary-button" disabled={busy} onClick={() => void publish()}>{busy ? <LoaderCircle size={14} className="spin"/> : <Share2 size={14}/>}{share?.token ? (dirty ? t("保存并更新分享内容") : t("更新分享内容")) : (dirty ? t("保存并创建分享链接") : t("创建分享链接"))}</StudioButton>
        {share?.token && <StudioButton className="secondary-button" disabled={busy} onClick={() => void close()}>{t("关闭分享")}</StudioButton>}
      </div>
    </>}
  </StudioDialog>;
}
