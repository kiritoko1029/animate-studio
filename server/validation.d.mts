import type { PageDocument, SiteDocument } from '../src/model';

export class ValidationError extends Error {
  constructor(message: string, path?: string);
  /** Present only when one invalid field can be identified without guessing intent. */
  path?: string;
}
/** Numeric prop limits, shared with the AI protocol so it can clamp near misses instead of rejecting them. */
export const numberLimits: Readonly<Record<'duration' | 'fontSize' | 'padding' | 'radius' | 'value' | 'max' | 'contentScale', readonly [number, number]>>;
export function validatePage(page: unknown): PageDocument;
export function validateSaveRequest(body: unknown): PageDocument;
export function validateSite(site: unknown): SiteDocument;
