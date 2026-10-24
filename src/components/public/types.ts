// Datos públicos del local (GET /public/{slug}/info) para /t/:slug y /v/:slug
import type { Vocabulary } from "../../config";

export interface PublicProfessional { id: number; name: string; role_label: string | null; color: string | null; photo: string | null; bio: string | null }
export interface Venue {
  slug: string; name: string; rubro: string | null; vocabulary: Vocabulary;
  address: string | null; phone: string | null; whatsapp_phone: string | null; instagram: string | null; email: string | null;
  opening_hours: Record<string, string[][]>;
  tattoo_mode: boolean; slot_minutes: number; booking_min_notice_min: number; booking_max_days: number; allow_professional_choice: boolean;
  cancel_free_hours: number; cancel_policy_text: string | null; deposit_mode: string; deposit_value: number; mp_enabled: boolean;
  professionals: PublicProfessional[]; ticket_footer: string | null; web_turnos: boolean; web_vitrina: boolean;
}
