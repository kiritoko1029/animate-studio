export type CustomComponentBootstrapConfig = {
  channel: string;
  html: string;
  props: Record<string, string>;
  theme: Record<string, string>;
  loopGuard?: boolean;
};
/** Serialized into the sandboxed component document; never call it in the host. */
export function customComponentBootstrap(config: CustomComponentBootstrapConfig, jsLine: number, probeLine: number): void;
