import { t, translateMessage } from '../i18n';
import { useEffect, useState } from 'react';
import { AlertCircle, LoaderCircle } from 'lucide-react';
import { SitePreview } from './SitePreview';
import { StudioButton } from './StudioUI';
import { AccountApiError, accountApi } from '../lib/account-api';
import { toFreeDocument, type PageDocument, type StudioDocument } from '../model';
import '../account.css';

export function SharedPage({ token }: { token: string }) {
  const [page, setPage] = useState<StudioDocument | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setPage(null); setError('');
    void accountApi<{ page: StudioDocument }>(`/api/shared/${encodeURIComponent(token)}`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setPage('kind' in result.page ? result.page : toFreeDocument({ ...result.page, id: result.page.id ?? `shared-${token}` })); })
      .catch(failure => { if (!controller.signal.aborted) setError(failure instanceof AccountApiError && failure.status === 404 ? t("这个分享链接不存在或已关闭。") : t("页面暂时无法加载，请稍后重试。")); });
    return () => controller.abort();
  }, [token, retry]);
  useEffect(() => { if (!page) return; const title = document.title; document.title = page.name || t("页面预览"); return () => { document.title = title; }; }, [page?.name]);
  if (!page) return <main className="shared-page-status">{error ? <><AlertCircle size={28}/><h1>{t("无法打开页面")}</h1><p role="alert">{translateMessage(error)}</p><StudioButton className="secondary-button" onClick={() => setRetry(value => value + 1)}>{t("重新加载")}</StudioButton></> : <><LoaderCircle size={24} className="spin"/><p>{t("正在打开页面…")}</p></>}</main>;
  const home = 'settings' in page ? page : page.pages.find(entry => entry.id === page.homePageId)?.page;
  return <main className="shared-page" style={{ background: home?.settings.background }}><div className="shared-page-content" style={{ maxWidth: home?.settings.maxWidth }}><SitePreview document={page} mode="share" basePath={`/p/${token}`} persistenceScope={`shared:${token}`}/></div></main>;
}
