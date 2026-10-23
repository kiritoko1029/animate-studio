import { useEffect, useState } from 'react';
import { AlertCircle, LoaderCircle } from 'lucide-react';
import { PageRenderer } from './PageRenderer';
import { StudioButton } from './StudioUI';
import { AccountApiError, accountApi } from '../lib/account-api';
import { toFreeDocument, type PageDocument } from '../model';
import '../account.css';

export function SharedPage({ token }: { token: string }) {
  const [page, setPage] = useState<PageDocument | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setPage(null); setError('');
    void accountApi<{ page: PageDocument }>(`/api/shared/${encodeURIComponent(token)}`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setPage(toFreeDocument({ ...result.page, id: result.page.id ?? `shared-${token}` })); })
      .catch(failure => { if (!controller.signal.aborted) setError(failure instanceof AccountApiError && failure.status === 404 ? '这个分享链接不存在或已关闭。' : '页面暂时无法加载，请稍后重试。'); });
    return () => controller.abort();
  }, [token, retry]);
  useEffect(() => { if (!page) return; const title = document.title; document.title = page.name || '页面预览'; return () => { document.title = title; }; }, [page?.name]);
  if (!page) return <main className="shared-page-status">{error ? <><AlertCircle size={28}/><h1>无法打开页面</h1><p role="alert">{error}</p><StudioButton className="secondary-button" onClick={() => setRetry(value => value + 1)}>重新加载</StudioButton></> : <><LoaderCircle size={24} className="spin"/><p>正在打开页面…</p></>}</main>;
  return <main className="shared-page" style={{ background: page.settings.background }}><div className="shared-page-content" style={{ maxWidth: page.settings.maxWidth }}><PageRenderer document={page} persistenceScope={`shared:${token}`}/></div></main>;
}
