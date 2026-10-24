export interface PhotoItem {
  id: number; customer_id: number; appointment_id: number | null; professional_id: number | null; professional_name: string | null; kind: string; taken_at: string;
  caption: string | null; pair_id: number | null; public_visible: boolean; is_public_now: boolean; has_public_consent: boolean; customer_name?: string | null;
}
export interface PhotoConsentStatus {
  internal: { ok: boolean; signed_at: string | null }; public: { ok: boolean; signed_at: string | null };
  is_minor: boolean; policy_text: string | null; fichas: boolean;
}
export const PHOTO_KIND_LABEL: Record<string, string> = { ANTES: "Antes", DESPUES: "Después", REFERENCIA: "Referencia", OTRA: "Otra" };
