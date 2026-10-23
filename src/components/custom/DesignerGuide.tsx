import { t } from '../../i18n';
import { X } from 'lucide-react';
import { StudioButton } from '../StudioUI';

const api: [string, string][] = [
  ['component.props', '当前实例字段，只读对象，例如 component.props.title。'],
  ['component.onProps(fn)', '实例字段或主题变化时调用 fn(props, theme)；返回取消监听的函数。'],
  ['component.theme', '当前页面主题的颜色、圆角和字体，与 --as-* 变量相同。'],
  ['component.log(...values)', '输出到设计器控制台；console.log / warn / error 也会显示。'],
  ['component.openLink(url)', '请求打开链接，规则与页面链接相同（https、mailto、tel、页面锚点）。'],
];
const attributes: [string, string][] = [
  ['data-prop="title"', '自动把该元素的文字设为实例字段，字段变化时同步更新。'],
  ['data-prop-href="url"', '把字段设为链接地址。'],
  ['data-prop-src="imageUrl"', '把字段设为图片地址。'],
];
const variables = ['--as-accent', '--as-on-accent', '--as-text', '--as-muted', '--as-surface', '--as-panel', '--as-border', '--as-radius', '--as-font'];

/** Reference shown beside the editor: the exact contract the runtime implements. */
export function DesignerGuide({ onClose }: { onClose: () => void }) {
  return <aside className="ccd-guide" aria-label={t("编写指南")}>
    <header><h3>{t("编写指南")}</h3><StudioButton className="icon-button" aria-label={t("关闭编写指南")} onClick={onClose}><X size={15}/></StudioButton></header>
    <div className="ccd-guide-scroll">
      <section><h4>{t("1. 编写入口")}</h4><ol>
        <li><strong>HTML</strong> {t("写组件结构，相当于组件页面 <body> 的内容。")}</li>
        <li><strong>CSS</strong> {t("写样式，可以直接使用 body、h1 等选择器。")}</li>
        <li><strong>JavaScript</strong> {t("在 HTML 加载后运行一次，像普通网页脚本一样使用 document、addEventListener、setInterval、requestAnimationFrame 等浏览器能力。")}</li>
      </ol><p>{t("修改后点击“运行”（⌘/Ctrl + Enter）。开启“自动运行”时，停止输入片刻会自动刷新预览。")}</p></section>
      <section><h4>{t("2. 组件 API")}</h4><dl>{api.map(([name, text]) => <div key={name}><dt><code>{name}</code></dt><dd>{t(text)}</dd></div>)}</dl>
        <dl>{attributes.map(([name, text]) => <div key={name}><dt><code>{name}</code></dt><dd>{t(text)}</dd></div>)}</dl>
        <p>{t("实例字段在“设置”中启用：标题、正文、标签、链接地址、图片地址。插入页面后，每个实例都可以在属性面板中单独修改。")}</p></section>
      <section><h4>{t("3. 主题变量")}</h4><p>{t("组件会收到当前页面主题，可在 CSS 中使用：")}</p><div className="ccd-guide-tokens">{variables.map(name => <code key={name}>{name}</code>)}</div><p>{t("深色主题时根元素带有")}<code>data-scheme="dark"</code>。</p></section>
      <section><h4>{t("4. 样式作用域")}</h4><p>{t("每个组件运行在独立的隔离文档中：你的 CSS 只影响这个组件，页面和其他组件的样式也不会影响它。")}</p></section>
      <section><h4>{t("5. 尺寸")}</h4><p>{t("组件会填满页面中的组件框。“设置”里的默认尺寸决定插入时的大小，之后可以在画布中拖动调整。建议用百分比、flex 或 grid 让内容随尺寸自适应。")}</p></section>
      <section><h4>{t("6. 保存与分享")}</h4><ul>
        <li><strong>{t("本机")}</strong>{t("：保存在当前浏览器，刷新后仍在；换浏览器或清除站点数据后不可用。")}</li>
        <li><strong>{t("账号")}</strong>{t("：登录后显式保存，可在其他设备使用。登录不会自动上传本机组件。")}</li>
        <li><strong>{t("分享")}</strong>{t("：发布账号组件当前已保存版本的快照；之后的修改需点击“更新分享内容”才会发布。关闭分享或删除组件后，原链接失效。")}</li>
        <li><strong>{t("页面中的组件是插入时的副本")}</strong>{t("：编辑、删除或取消分享源组件，都不会改变已插入的实例；需要时在属性面板中选择“更新此实例”。")}</li>
      </ul></section>
      <section><h4>{t("7. 能力边界")}</h4><ul>
        <li>{t("不支持 import、npm 包、外部脚本或外部样式表。")}</li>
        <li>{t("不能联网：fetch、XMLHttpRequest、WebSocket 会被阻止。可以显示 https 图片、字体与媒体。")}</li>
        <li>{t("无法访问页面 Cookie、localStorage、编辑器或页面中的其他元素。")}</li>
        <li>{t("HTML 中的 <script> 和 onclick 等内联事件不会执行；表单不会提交；alert、confirm 不可用。")}</li>
        <li>{t("设计器预览会中止连续运行超过 1 秒的循环，并在控制台给出行号。")}</li>
      </ul></section>
      <section><h4>{t("8. 与页面联动")}</h4><p>{t("插入页面后，可在“组件联动”中把标题、正文、标签绑定到页面变量，变量变化时组件通过 component.onProps 收到新值；点击组件也能触发页面的“点击”动作。组件代码不能直接读取或修改页面变量。")}</p></section>
    </div>
  </aside>;
}
