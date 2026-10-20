import type { PageDocument } from '../src/model';

export class ValidationError extends Error {}
export function validatePage(page: unknown): PageDocument;
export function validateSaveRequest(body: unknown): PageDocument;
