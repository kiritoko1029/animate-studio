import { isSiteDocument } from '../../shared/site-document.mjs';
import { validatePage, validateSite } from '../../server/validation.mjs';
import { toFreeDocument, type StudioDocument } from '../model';

export function parseStudioDocument(value: unknown): StudioDocument {
  return isSiteDocument(value) ? validateSite(value) : toFreeDocument(validatePage(value));
}
