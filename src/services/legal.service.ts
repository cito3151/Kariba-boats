import { supabase } from '../lib/supabase';
import { humanizeError } from './errors';

export type LegalDocType = 'terms' | 'privacy' | 'operator_agreement' | 'booking_waiver' | 'marketing';

export interface LegalDocument {
  id: string; docType: LegalDocType; version: number; title: string; body: string;
  isRequired: boolean; appliesToRoles: string[] | null; isCurrent: boolean;
}
export interface OutstandingConsent {
  docType: LegalDocType; version: number; title: string; body: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapDoc(r: any): LegalDocument {
  return {
    id: r.id, docType: r.doc_type, version: r.version, title: r.title, body: r.body,
    isRequired: r.is_required, appliesToRoles: r.applies_to_roles, isCurrent: r.is_current,
  };
}

export async function listCurrentDocuments(): Promise<LegalDocument[]> {
  const { data, error } = await supabase
    .from('legal_documents').select('*').eq('is_current', true).order('doc_type');
  if (error) throw new Error(humanizeError(error.message));
  return (data ?? []).map(mapDoc);
}

export async function getCurrentDocument(docType: LegalDocType): Promise<LegalDocument | null> {
  const { data, error } = await supabase
    .from('legal_documents').select('*').eq('is_current', true).eq('doc_type', docType).maybeSingle();
  if (error) throw new Error(humanizeError(error.message));
  return data ? mapDoc(data) : null;
}

export async function outstandingConsents(): Promise<OutstandingConsent[]> {
  const { data, error } = await supabase.rpc('outstanding_consents', {});
  if (error) throw new Error(humanizeError(error.message));
  return (data ?? []).map((r: any) => ({
    docType: r.doc_type, version: r.version, title: r.title, body: r.body,
  }));
}

export async function recordConsent(input: {
  docType: LegalDocType; version: number;
  context: 'signup' | 're_consent' | 'booking'; bookingId?: string; accepted?: boolean;
}): Promise<void> {
  const { error } = await supabase.rpc('record_consent', {
    p_doc_type: input.docType, p_version: input.version, p_context: input.context,
    p_booking_id: input.bookingId ?? undefined, p_accepted: input.accepted ?? true,
  });
  if (error) throw new Error(humanizeError(error.message));
}

export async function publishDocument(input: {
  docType: LegalDocType; title: string; body: string;
  isRequired: boolean; appliesToRoles: string[] | null;
}): Promise<void> {
  const { error } = await supabase.rpc('publish_legal_document', {
    p_doc_type: input.docType, p_title: input.title, p_body: input.body,
    p_is_required: input.isRequired, p_applies_to_roles: input.appliesToRoles ?? undefined,
  });
  if (error) throw new Error(humanizeError(error.message));
}
