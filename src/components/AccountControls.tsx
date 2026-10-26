import { t, translateMessage, getLocale } from '../i18n';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Cloud, Copy, ExternalLink, Code2, LoaderCircle, LogOut, Mail, MoreHorizontal, Moon, Sun, Share2, Trash2, UserRound, X } from 'lucide-react';
import { StudioButton, StudioDialog } from './StudioUI';
import { useAccount } from './AccountProvider';
import { LanguageMenuItems } from './LanguageMenuItems';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from './animate-ui/components/radix/dropdown-menu';
import { accountApi, cloudPagePath, shareUrl, type CloudPageRecord, type CloudPageSummary } from '../lib/account-api';
import '../account.css';

function DialogHeading({ title, close }: { title: string; close: () => void }) {
  return <header className="account-dialog-heading"><h2>{title}</h2><StudioButton className="icon-button" aria-label={t("关闭")} onClick={close}><X size={17}/></StudioButton></header>;
}
const errorText = (error: unknown) => error instanceof Error ? error.message : t("操作失败，请重试。");

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
  return <StudioDialog title={t("登录 Animate Studio")} className="account-dialog" onClose={onClose}>
    <DialogHeading title={t("登录你的创作空间")} close={onClose}/>
    <p className="account-description">{t("保存多个页面、分享作品，在不同设备继续创作。")}</p>
    {capabilities.emailEnabled ? <form onSubmit={submit} className="account-form">
      {sentTo ? <><p className="account-hint">{t("验证码已发送至")} <strong>{sentTo}</strong></p><label htmlFor="login-otp">{t("邮箱验证码")}</label><input id="login-otp" autoFocus autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, ''))} placeholder={t("输入 6 位验证码")} disabled={busy}/></> : <><label htmlFor="login-email">{t("邮箱地址")}</label><input id="login-email" type="email" autoComplete="email" autoFocus required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" disabled={busy}/></>}
      <StudioButton type="submit" className="primary-button account-wide" disabled={busy}>{busy ? <LoaderCircle size={15} className="spin"/> : <Mail size={15}/>} {sentTo ? t("登录") : t("发送验证码")}</StudioButton>
      {sentTo && <div className="account-form-options"><StudioButton disabled={busy || remaining > 0} onClick={() => void send(sentTo)}>{remaining ? t("{0} 秒后重新发送", { 0: remaining }) : t("重新发送验证码")}</StudioButton><StudioButton disabled={busy} onClick={() => { setSentTo(''); setOtp(''); setError(''); }}>{t("更换邮箱")}</StudioButton></div>}
    </form> : <p className="account-hint">{t("邮箱登录暂不可用，你可以继续编辑、预览和导出。")}</p>}
    {capabilities.githubEnabled && <><div className="account-divider"><span>{t("或")}</span></div><StudioButton className="secondary-button account-wide" disabled={busy} onClick={() => void run(async () => {
      const result = await accountApi<{ url?: string }>('/api/auth/sign-in/social', { method: 'POST', body: { provider: 'github', callbackURL: `${window.location.origin}${window.location.pathname}${window.location.search}` } });
      if (!result.url) throw new Error(t("暂时无法连接 GitHub，请稍后重试。"));
      const destination = new URL(result.url);
      if (destination.protocol !== 'https:' || destination.hostname !== 'github.com') throw new Error(t("GitHub 登录地址无效。"));
      window.location.assign(destination.href);
    })}><Code2 size={16}/>{t("使用 GitHub 登录")}</StudioButton></>}
    {error && <p className="account-error" role="alert">{translateMessage(error)}</p>}
    <p className="account-footnote">{t("未登录也能使用编辑器全部基础功能。")}</p>
  </StudioDialog>;
}

type Props = {
  studioTheme: 'light' | 'dark';
  onToggleTheme: () => void;
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const pendingDialog = useRef<'pages' | 'share' | null>(null);
  const requestDialog = (next: 'pages' | 'share') => { pendingDialog.current = next; setMenuOpen(false); };
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
  const time = (date: string) => new Date(date).toLocaleString(getLocale(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return <>
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild><StudioButton ref={menuTrigger} className="secondary-button more-actions-button" aria-label={t("更多操作")} title={user ? t("账号：{0}", { 0: user.email }) : t("更多操作")}><MoreHorizontal size={18}/></StudioButton></DropdownMenuTrigger>
      <DropdownMenuContent className="studio-menu workbench-more-menu" align="end" sideOffset={8} onCloseAutoFocus={event => {
        const next = pendingDialog.current;
        if (!next) return;
        // Open the dialog after the menu releases focus, using its persistent trigger as the opener.
        event.preventDefault(); pendingDialog.current = null; menuTrigger.current?.focus(); show(next);
      }}>
        {user ? <DropdownMenuLabel className="menu-account-identity" title={user.email}><UserRound size={13}/><span>{user.email}</span></DropdownMenuLabel> : <DropdownMenuItem disabled={loading} onSelect={() => requestDialog('pages')} aria-label={t("登录")}><UserRound size={15}/>{t("登录")}</DropdownMenuItem>}
        <DropdownMenuItem disabled={loading} onSelect={() => requestDialog('pages')} aria-label={t("云端页面")}><Cloud size={15}/>{t("云端页面")}</DropdownMenuItem>
        <DropdownMenuItem disabled={loading} onSelect={() => requestDialog('share')} aria-label={t("分享页面")}><Share2 size={15}/>{t("分享页面")}</DropdownMenuItem>
        <DropdownMenuSeparator/>
        <LanguageMenuItems/>
        <DropdownMenuSeparator/>
        <DropdownMenuItem onSelect={props.onToggleTheme} aria-label={props.studioTheme === 'light' ? t("切换工作台深色主题") : t("切换工作台浅色主题")}>
          {props.studioTheme === 'light' ? <Moon size={15}/> : <Sun size={15}/>}{props.studioTheme === 'light' ? t("切换深色外观") : t("切换浅色外观")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    {dialog === 'login' && <LoginDialog onClose={() => setDialog(null)}/>}
    {dialog === 'pages' && user && <StudioDialog title={t("我的云端页面")} className="account-dialog cloud-pages-dialog" onClose={close} dismissOutside={!busy}>
      <DialogHeading title={t("我的云端页面")} close={close}/>
      <div className="account-identity"><span>{user.email}</span><StudioButton disabled={busy} onClick={() => void run(async () => {
        await props.onBeforeSignOut(); await accountApi('/api/auth/sign-out', { method: 'POST', body: {} }); announceChange(); await refresh(); setDialog(null); props.notify(t("已退出登录，云端页面已保留"));
      })}><LogOut size={13}/>{t("退出登录")}</StudioButton></div>
      <div className="cloud-page-toolbar"><StudioButton className="primary-button" disabled={busy || !capabilities.cloudEnabled} onClick={() => void run(async () => { await props.onSaveCloud(); setListVersion(value => value + 1); props.notify(t("页面已保存到云端")); })}>{busy ? <LoaderCircle size={14} className="spin"/> : <Cloud size={14}/>} {props.targetId ? t("保存当前云端页面") : t("保存当前页面到云端")}</StudioButton><StudioButton className="secondary-button" disabled={busy || !props.targetId} onClick={() => void run(async () => { await props.onGuest(); setDialog(null); })}>{t("返回浏览器草稿")}</StudioButton></div>
      {!capabilities.cloudEnabled && <p className="account-hint">{t("云端保存暂不可用，当前作品仍可导出。")}</p>}
      {error && <p className="account-error" role="alert">{translateMessage(error)}</p>}
      <div className="cloud-page-list" aria-busy={listLoading}>
        {listLoading ? <div className="account-empty"><LoaderCircle size={20} className="spin"/>{t("正在读取页面…")}</div> : !pages.length ? <div className="account-empty"><Cloud size={28}/><strong>{t("还没有云端页面")}</strong><p>{t("保存当前作品后，就能在其他设备继续编辑。")}</p></div> : pages.map(page => <article className={`cloud-page-item ${page.id === props.targetId ? 'active' : ''}`} key={page.id}>
          <StudioButton className="cloud-page-open" disabled={busy} onClick={() => void run(async () => { await props.onOpenPage(page.id); setDialog(null); })}><span>{page.name || t("未命名页面")}</span><small>{page.id === props.targetId ? t("正在编辑 · ") : ''}{page.shareToken ? t("已分享 · ") : ''}{time(page.updatedAt)}</small></StudioButton>
          <StudioButton className="icon-button" aria-label={t("删除页面：{0}", { 0: page.name })} disabled={busy} onClick={() => setDeleting(page.id)}><Trash2 size={15}/></StudioButton>
          {deleting === page.id && <div className="cloud-delete-confirm"><p>{t("删除「{0}」及其分享链接？此操作无法撤销。", { 0: page.name })}</p><div><StudioButton className="secondary-button" disabled={busy} onClick={() => setDeleting(null)}>{t("取消")}</StudioButton><StudioButton className="primary-button" disabled={busy} onClick={() => void run(async () => { await props.onDeletePage(page.id); setDeleting(null); setListVersion(value => value + 1); props.notify(t("页面已删除")); })}>{t("确认删除")}</StudioButton></div></div>}
        </article>)}
      </div>
      {!listLoading && <StudioButton className="account-text-button" disabled={busy} onClick={() => setListVersion(value => value + 1)}>{t("刷新列表")}</StudioButton>}
    </StudioDialog>}
    {dialog === 'share' && user && <StudioDialog title={t("分享页面")} className="account-dialog" onClose={close} dismissOutside={!busy}>
      <DialogHeading title={t("分享页面")} close={close}/>
      <p className="account-description">{t("任何持有链接的人都能预览整个站点。继续编辑不会改变已分享内容，点击“更新分享内容”后才会发布所有页面的最新草稿。")}</p>
      {listLoading ? <p className="account-hint">{t("正在读取分享状态…")}</p> : token ? <><label className="account-label" htmlFor="share-link">{t("分享链接")}</label><div className="share-link-field"><input id="share-link" readOnly value={shareUrl(token)} onFocus={event => event.target.select()}/><StudioButton className="icon-button" aria-label={t("复制分享链接")} onClick={async () => { try { await navigator.clipboard.writeText(shareUrl(token)); props.notify(t("分享链接已复制")); } catch { setError(t("请选中上方链接，手动复制。")); } }}><Copy size={16}/></StudioButton></div><a className="account-preview-link" href={shareUrl(token)} target="_blank" rel="noreferrer">{t("打开分享预览")}<ExternalLink size={13}/></a>{publishedAt && <p className="account-hint">{t("最近发布：")}{time(publishedAt)}</p>}</> : <p className="account-hint">{props.targetId ? t("当前站点尚未分享。") : t("创建分享时，会先把当前站点保存到你的云端空间。")}</p>}
      {error && <p className="account-error" role="alert">{translateMessage(error)}</p>}
      <div className="account-dialog-actions"><StudioButton className="primary-button" disabled={busy || listLoading || !capabilities.cloudEnabled} onClick={() => void run(async () => { const result = await props.onPublish(); shareReadVersion.current++; setToken(result.token); setPublishedAt(result.publishedAt); props.notify(t("分享内容已发布")); })}>{busy ? <LoaderCircle size={14} className="spin"/> : <Share2 size={14}/>} {token ? t("更新分享内容") : t("创建分享链接")}</StudioButton>{token && props.targetId && <StudioButton className="secondary-button" disabled={busy} onClick={() => void run(async () => { await accountApi(cloudPagePath(props.targetId!) + '/share', { method: 'DELETE' }); setToken(null); setPublishedAt(null); props.notify(t("分享已关闭，原链接不再可访问")); })}>{t("关闭分享")}</StudioButton>}</div>
    </StudioDialog>}
  </>;
}
