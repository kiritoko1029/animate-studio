import { t, getLocale, translateMessage } from '../../i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, Cloud, Copy, ExternalLink, HardDrive, LoaderCircle, Moon, Sun } from 'lucide-react';
import { Brand } from '../Brand';
import { StudioButton } from '../StudioUI';
import { useAccount } from '../AccountProvider';
import { customFieldKeys, customFieldLabels, validateCustomComponentDefinition, type CustomComponentDefinition } from '../../../shared/custom-components.mjs';
import { AccountApiError } from '../../lib/account-api';
import { createCloudComponent, readSharedComponent, type SharedComponent } from '../../lib/custom-components/cloud';
import { pickDefinition, saveLocalComponent } from '../../lib/custom-components/library';
import { customComponentTheme } from '../../lib/custom-components/instances';
import { getTheme } from '../../lib/themes';
import { CustomComponentFrame } from './CustomComponentFrame';
import '../../account.css';
import '../../custom-designer.css';

const time = (value: string) => new Date(value).toLocaleString(getLocale(), { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * Public view of a shared component. It shows only the published snapshot;
 * visitors can preview it and copy it into their own library or account. The
 * author's data cannot be changed from here: the only request is a GET.
 */
export function SharedComponentPage({ token }: { token: string }) {
  const { user } = useAccount();
  const [shared, setShared] = useState<SharedComponent | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [scheme, setScheme] = useState<'light' | 'dark'>('light');
  const [panel, setPanel] = useState<'html' | 'css' | 'js'>('html');
  const [copied, setCopied] = useState<'' | 'local' | 'cloud'>('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const stage = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const controller = new AbortController(); setShared(null); setError('');
    void readSharedComponent(token, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        // The server validated it on save; a malformed response is still not rendered.
        validateCustomComponentDefinition(result.component);
        setShared(result);
      })
      .catch(failure => { if (!controller.signal.aborted) setError(failure instanceof AccountApiError && failure.status === 404 ? t("这个组件分享不存在或已关闭。") : t("组件暂时无法加载，请稍后重试。")); });
    return () => controller.abort();
  }, [token, retry]);
  useEffect(() => { if (!shared) return; const title = document.title; document.title = t("{0} · 组件分享", { 0: shared.component.name }); return () => { document.title = title; }; }, [shared?.component.name]);
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => setWidth(entries[0]?.contentRect.width ?? 0));
    observer.observe(element);
    return () => observer.disconnect();
  }, [shared]);

  const definition = shared?.component;
  const settings = useMemo(() => { const theme = getTheme(scheme === 'dark' ? 'animate-dark' : 'animate-light'); return { background: theme.canvas, accent: theme.accent, maxWidth: 1200, padding: 0, theme: scheme === 'dark' ? 'animate-dark' as const : 'animate-light' as const }; }, [scheme]);
  if (!definition || !shared) return <main className="shared-page-status">{error ? <><AlertCircle size={28}/><h1>{t("无法打开组件")}</h1><p role="alert">{translateMessage(error)}</p><StudioButton className="secondary-button" onClick={() => setRetry(value => value + 1)}>{t("重新加载")}</StudioButton><a className="account-preview-link" href="/">{t("打开 Animate Studio")}<ExternalLink size={13}/></a></> : <><LoaderCircle size={24} className="spin"/><p>{t("正在打开组件…")}</p></>}</main>;

  const size = definition.size ?? { width: 360, height: 240 };
  const scale = width ? Math.min(1, (width - 32) / size.width) : 1;
  const fields = Object.fromEntries(customFieldKeys.filter(key => definition.fields?.[key] !== undefined).map(key => [key, definition.fields![key]!]));
  const copy = async (where: 'local' | 'cloud') => {
    if (busy) return;
    setBusy(true); setNotice('');
    try {
      const copy: CustomComponentDefinition = pickDefinition(definition);
      if (where === 'local') saveLocalComponent(copy, { origin: 'shared' });
      else await createCloudComponent(copy);
      setCopied(where);
    } catch (failure) { setNotice(failure instanceof Error ? failure.message : t("复制失败，请重试。")); }
    finally { setBusy(false); }
  };

  return <main className="shared-component-page">
    <header className="shared-component-bar"><a href="/" aria-label={t("打开 Animate Studio")}><Brand small/></a><span>{t("组件分享")}</span><a className="account-preview-link" href="/">{t("打开编辑器")}<ExternalLink size={13}/></a></header>
    <section className="shared-component-intro">
      <h1>{definition.name}</h1>
      {definition.description && <p>{definition.description}</p>}
      <small>{t("发布于")}{time(shared.publishedAt)} {t("· 版本 v")}{shared.revision} {t("· 用 HTML、CSS 和 JavaScript 编写的自定义组件")}</small>
    </section>
    <section className="shared-component-preview" aria-label={t("组件预览")}>
      <div className="shared-component-toolbar"><span>{t("实时预览 ·")}{size.width} × {size.height}{scale < 1 ? ` · ${Math.round(scale * 100)}%` : ''}</span><StudioButton className="icon-button" aria-label={scheme === 'light' ? t("切换深色预览") : t("切换浅色预览")} onClick={() => setScheme(value => value === 'light' ? 'dark' : 'light')}>{scheme === 'light' ? <Moon size={15}/> : <Sun size={15}/>}</StudioButton></div>
      <div className="shared-component-stage" ref={stage} style={{ background: settings.background, height: size.height * scale + 32 }}>
        <div className="ccd-stage-frame" style={{ width: size.width, height: size.height, transform: `scale(${Math.max(.1, scale)})` }}>
          <CustomComponentFrame code={definition} props={fields} theme={customComponentTheme({ props: {} }, settings)} title={t("{0} 预览", { 0: definition.name })} interactive/>
        </div>
      </div>
    </section>
    <section className="shared-component-actions" aria-label={t("使用这个组件")}>
      <h2>{t("使用这个组件")}</h2>
      <p>{t("复制后得到一份属于你的副本：可以在编辑器的“我的组件”中修改，并添加到自己的页面。原作者之后的修改不会影响你的副本。")}</p>
      <div>
        <StudioButton className="primary-button" disabled={busy} onClick={() => void copy('local')}>{copied === 'local' ? <Check size={14}/> : <HardDrive size={14}/>}{t("复制到我的组件（本机）")}</StudioButton>
        {user ? <StudioButton className="secondary-button" disabled={busy} onClick={() => void copy('cloud')}>{copied === 'cloud' ? <Check size={14}/> : <Cloud size={14}/>}{t("复制到我的账号")}</StudioButton> : <small>{t("登录编辑器后，也可以直接复制到账号。")}</small>}
      </div>
      {copied && <p className="account-hint" role="status">{t("已复制到")}{copied === 'local' ? t("当前浏览器的“我的组件”") : t("你的账号")}。<a href="/?library=mine">{t("在编辑器中打开")}</a></p>}
      {notice && <p className="account-error" role="alert">{translateMessage(notice)}</p>}
    </section>
    <section className="shared-component-code" aria-label={t("组件代码")}>
      <div className="ccd-tabs" role="tablist" aria-label={t("代码面板")}>{(['html', 'css', 'js'] as const).map(id => <button key={id} type="button" role="tab" aria-selected={panel === id} className={panel === id ? 'active' : ''} onClick={() => setPanel(id)}>{id === 'js' ? 'JavaScript' : id.toUpperCase()}</button>)}<StudioButton className="text-button" onClick={async () => { try { await navigator.clipboard.writeText(definition[panel]); setNotice(''); } catch { setNotice(t("请手动选择代码复制。")); } }}><Copy size={12}/>{t("复制代码")}</StudioButton></div>
      <pre><code>{definition[panel] || t("（空）")}</code></pre>
      {Object.keys(fields).length > 0 && <p className="field-hint">{t("实例字段：")}{Object.keys(fields).map(key => `${t(customFieldLabels[key as keyof typeof customFieldLabels])}（${key}）`).join('、')}{t("。插入页面后可按实例修改。")}</p>}
    </section>
  </main>;
}
