import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Cloud, Copy, ExternalLink, Code2, LoaderCircle, LogOut, Mail, Share2, Trash2, UserRound, X } from 'lucide-react';
import { StudioButton, StudioDialog } from './StudioUI';
import { useAccount } from './AccountProvider';
import { accountApi, cloudPagePath, shareUrl, type CloudPageRecord, type CloudPageSummary } from '../lib/account-api';
import '../account.css';

function DialogHeading({ title, close }: { title: string; close: () => void }) {
  return <header className="account-dialog-heading"><h2>{title}</h2><StudioButton className="icon-button" aria-label="关闭" onClick={close}><X size={17}/></StudioButton></header>;
}
const errorText = (error: unknown) => error instanceof Error ? error.message : '操作失败，请重试。';

/** Shared by the header and by features that need the real sign-in entry. */
export function LoginDialog({ onClose }: { onClose: () => void }) {
  const { capabilities, refresh, announceChange } = useAccount();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; const timer = setInterval(() => setNow(Date.now()), 1000); return () => { mounted.current = false; clearInterval(timer); }; }, []);
  async function run(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try { await action(); } catch (failure) { if (mounted.current) setError(errorText(failure)); }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  const remaining = Math.min(60, Math.max(0, Math.ceil((resendAt - now) / 1000)));
  const send = (target: string) => run(async () => {
    await accountApi('/api/auth/email-otp/send-verification-otp', { method: 'POST', body: { email: target, type: 'sign-in' } });
    if (mounted.current) { setSentTo(target); setOtp(''); setResendAt(Date.now() + 60000); }
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!sentTo) { void send(email.trim()); return; }
    void run(async () => {
      await accountApi('/api/auth/sign-in/email-otp', { method: 'POST', body: { email: sentTo, otp } });
      announceChange(); await refresh(); if (mounted.current) onClose();
    });
  }
  return <StudioDialog title="登录 Animate Studio" className="account-dialog" onClose={onClose}>
    <DialogHeading title="登录你的创作空间" close={onClose}/>
    <p className="account-description">保存多个页面、分享作品，在不同设备继续创作。</p>
    {capabilities.emailEnabled ? <form onSubmit={submit} className="account-form">
      {sentTo ? <><p className="account-hint">验证码已发送至 <strong>{sentTo}</strong></p><label htmlFor="login-otp">邮箱验证码</label><input id="login-otp" autoFocus autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, ''))} placeholder="输入 6 位验证码" disabled={busy}/></> : <><label htmlFor="login-email">邮箱地址</label><input id="login-email" type="email" autoComplete="email" autoFocus required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" disabled={busy}/></>}
      <StudioButton type="submit" className="primary-button account-wide" disabled={busy}>{busy ? <LoaderCircle size={15} className="spin"/> : <Mail size={15}/>} {sentTo ? '登录' : '发送验证码'}</StudioButton>
      {sentTo && <div className="account-form-options"><StudioButton disabled={busy || remaining > 0} onClick={() => void send(sentTo)}>{remaining ? `${remaining} 秒后重新发送` : '重新发送验证码'}</StudioButton><StudioButton disabled={busy} onClick={() => { setSentTo(''); setOtp(''); setError(''); }}>更换邮箱</StudioButton></div>}
    </form> : <p className="account-hint">邮箱登录暂不可用，你可以继续编辑、预览和导出。</p>}
    {capabilities.githubEnabled && <><div className="account-divider"><span>或</span></div><StudioButton className="secondary-button account-wide" disabled={busy} onClick={() => void run(async () => {
      const result = await accountApi<{ url?: string }>('/api/auth/sign-in/social', { method: 'POST', body: { provider: 'github', callbackURL: `${window.location.origin}${window.location.pathname}${window.location.search}` } });
      if (!result.url) throw new Error('暂时无法连接 GitHub，请稍后重试。');
      const destination = new URL(result.url);
      if (destination.protocol !== 'https:' || destination.hostname !== 'github.com') throw new Error('GitHub 登录地址无效。');
      window.location.assign(destination.href);
    })}><Code2 size={16}/>使用 GitHub 登录</StudioButton></>}
    {error && <p className="account-error" role="alert">{error}</p>}
    <p className="account-footnote">未登录也能使用编辑器全部基础功能。</p>
  </StudioDialog>;
}

type Props = {
  targetId: string | null;
  onSaveCloud: () => Promise<CloudPageRecord>;
  onOpenPage: (id: string) => Promise<void>;
  onDeletePage: (id: string) => Promise<void>;
  onPublish: () => Promise<{ token: string; publishedAt: string }>;
  onBeforeSignOut: () => Promise<void>;
  onGuest: () => Promise<void>;
  notify: (message: string) => void;
};

export function AccountControls(props: Props) {
  const { user, loading, capabilities, refresh, announceChange } = useAccount();
  const [dialog, setDialog] = useState<'login' | 'pages' | 'share' | null>(null);
  const [pages, setPages] = useState<CloudPageSummary[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [listVersion, setListVersion] = useState(0);
  const shareReadVersion = useRef(0);
  const userRef = useRef(user?.id); userRef.current = user?.id;
  const close = () => { if (!busyRef.current) { setDialog(null); setError(''); setDeleting(null); } };
  const show = (value: 'pages' | 'share') => { setError(''); setDeleting(null); setDialog(user ? value : 'login'); };
  useEffect(() => {
    setPages([]); setToken(null); setPublishedAt(null); setDeleting(null); setError('');
    if (!user) setDialog(current => current === 'login' ? current : null);
  }, [user?.id]);
  useEffect(() => {
    if (!user || dialog !== 'pages') return;
    const controller = new AbortController(); setListLoading(true); setError('');
    void accountApi<{ pages: CloudPageSummary[] }>('/api/account/pages', { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setPages(data.pages); })
      .catch(failure => { if (!controller.signal.aborted) setError(errorText(failure)); })
      .finally(() => { if (!controller.signal.aborted) setListLoading(false); });
    return () => controller.abort();
  }, [user?.id, dialog, listVersion]);
  useEffect(() => {
    const version = ++shareReadVersion.current;
    setToken(null); setPublishedAt(null); setListLoading(false);
    if (!user || dialog !== 'share' || !props.targetId) return;
    const controller = new AbortController(); setListLoading(true);
    void accountApi<CloudPageRecord>(cloudPagePath(props.targetId), { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted && version === shareReadVersion.current) { setToken(data.shareToken); setPublishedAt(data.publishedAt); } })
      .catch(failure => { if (!controller.signal.aborted) setError(errorText(failure)); })
      .finally(() => { if (!controller.signal.aborted) setListLoading(false); });
    return () => controller.abort();
  }, [user?.id, dialog, props.targetId]);
  async function run(action: () => Promise<void>) {
    if (busyRef.current) return;
    const owner = userRef.current; busyRef.current = true; setBusy(true); setError('');
    try { await action(); } catch (failure) { if (owner === userRef.current) setError(errorText(failure)); }
    finally { busyRef.current = false; setBusy(false); }
  }
  const time = (date: string) => new Date(date).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return <>
    <div className="account-header-controls">
      <StudioButton className="secondary-button account-pages-button" onClick={() => show('pages')} aria-label="云端页面"><Cloud size={14}/><span>云端页面</span></StudioButton>
      <StudioButton className="icon-button" onClick={() => show('share')} aria-label="分享页面" title="分享页面"><Share2 size={16}/></StudioButton>
      <StudioButton className={user ? 'user-avatar account-avatar' : 'secondary-button account-login-button'} aria-label={user ? `账号：${user.email}` : '登录'} title={user?.email} onClick={() => { setError(''); setDialog(user ? 'pages' : 'login'); }} disabled={loading}>{loading ? <LoaderCircle size={14} className="spin"/> : user ? (user.name || user.email).slice(0, 1).toUpperCase() : <><UserRound size={14}/><span>登录</span></>}</StudioButton>
    </div>
    {dialog === 'login' && <LoginDialog onClose={() => setDialog(null)}/>}
    {dialog === 'pages' && user && <StudioDialog title="我的云端页面" className="account-dialog cloud-pages-dialog" onClose={close} dismissOutside={!busy}>
      <DialogHeading title="我的云端页面" close={close}/>
      <div className="account-identity"><span>{user.email}</span><StudioButton disabled={busy} onClick={() => void run(async () => {
        await props.onBeforeSignOut(); await accountApi('/api/auth/sign-out', { method: 'POST', body: {} }); announceChange(); await refresh(); setDialog(null); props.notify('已退出登录，云端页面已保留');
      })}><LogOut size={13}/>退出登录</StudioButton></div>
      <div className="cloud-page-toolbar"><StudioButton className="primary-button" disabled={busy || !capabilities.cloudEnabled} onClick={() => void run(async () => { await props.onSaveCloud(); setListVersion(value => value + 1); props.notify('页面已保存到云端'); })}>{busy ? <LoaderCircle size={14} className="spin"/> : <Cloud size={14}/>} {props.targetId ? '保存当前云端页面' : '保存当前页面到云端'}</StudioButton><StudioButton className="secondary-button" disabled={busy || !props.targetId} onClick={() => void run(async () => { await props.onGuest(); setDialog(null); })}>返回浏览器草稿</StudioButton></div>
      {!capabilities.cloudEnabled && <p className="account-hint">云端保存暂不可用，当前作品仍可导出。</p>}
      {error && <p className="account-error" role="alert">{error}</p>}
      <div className="cloud-page-list" aria-busy={listLoading}>
        {listLoading ? <div className="account-empty"><LoaderCircle size={20} className="spin"/>正在读取页面…</div> : !pages.length ? <div className="account-empty"><Cloud size={28}/><strong>还没有云端页面</strong><p>保存当前作品后，就能在其他设备继续编辑。</p></div> : pages.map(page => <article className={`cloud-page-item ${page.id === props.targetId ? 'active' : ''}`} key={page.id}>
          <StudioButton className="cloud-page-open" disabled={busy} onClick={() => void run(async () => { await props.onOpenPage(page.id); setDialog(null); })}><span>{page.name || '未命名页面'}</span><small>{page.id === props.targetId ? '正在编辑 · ' : ''}{page.shareToken ? '已分享 · ' : ''}{time(page.updatedAt)}</small></StudioButton>
          <StudioButton className="icon-button" aria-label={`删除页面：${page.name}`} disabled={busy} onClick={() => setDeleting(page.id)}><Trash2 size={15}/></StudioButton>
          {deleting === page.id && <div className="cloud-delete-confirm"><p>删除「{page.name}」及其分享链接？此操作无法撤销。</p><div><StudioButton className="secondary-button" disabled={busy} onClick={() => setDeleting(null)}>取消</StudioButton><StudioButton className="primary-button" disabled={busy} onClick={() => void run(async () => { await props.onDeletePage(page.id); setDeleting(null); setListVersion(value => value + 1); props.notify('页面已删除'); })}>确认删除</StudioButton></div></div>}
        </article>)}
      </div>
      {!listLoading && <StudioButton className="account-text-button" disabled={busy} onClick={() => setListVersion(value => value + 1)}>刷新列表</StudioButton>}
    </StudioDialog>}
    {dialog === 'share' && user && <StudioDialog title="分享页面" className="account-dialog" onClose={close} dismissOutside={!busy}>
      <DialogHeading title="分享页面" close={close}/>
      <p className="account-description">任何持有链接的人都能直接预览。继续编辑不会改变已分享内容，点击“更新分享内容”后才会发布修改。</p>
      {listLoading ? <p className="account-hint">正在读取分享状态…</p> : token ? <><label className="account-label" htmlFor="share-link">分享链接</label><div className="share-link-field"><input id="share-link" readOnly value={shareUrl(token)} onFocus={event => event.target.select()}/><StudioButton className="icon-button" aria-label="复制分享链接" onClick={async () => { try { await navigator.clipboard.writeText(shareUrl(token)); props.notify('分享链接已复制'); } catch { setError('请选中上方链接，手动复制。'); } }}><Copy size={16}/></StudioButton></div><a className="account-preview-link" href={shareUrl(token)} target="_blank" rel="noreferrer">打开分享预览<ExternalLink size={13}/></a>{publishedAt && <p className="account-hint">最近发布：{time(publishedAt)}</p>}</> : <p className="account-hint">{props.targetId ? '当前页面尚未分享。' : '创建分享时，会先把当前页面保存到你的云端空间。'}</p>}
      {error && <p className="account-error" role="alert">{error}</p>}
      <div className="account-dialog-actions"><StudioButton className="primary-button" disabled={busy || listLoading || !capabilities.cloudEnabled} onClick={() => void run(async () => { const result = await props.onPublish(); shareReadVersion.current++; setToken(result.token); setPublishedAt(result.publishedAt); props.notify('分享内容已发布'); })}>{busy ? <LoaderCircle size={14} className="spin"/> : <Share2 size={14}/>} {token ? '更新分享内容' : '创建分享链接'}</StudioButton>{token && props.targetId && <StudioButton className="secondary-button" disabled={busy} onClick={() => void run(async () => { await accountApi(cloudPagePath(props.targetId!) + '/share', { method: 'DELETE' }); setToken(null); setPublishedAt(null); props.notify('分享已关闭，原链接不再可访问'); })}>关闭分享</StudioButton>}</div>
    </StudioDialog>}
  </>;
}
