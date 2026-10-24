// /v/:slug · Vitrina pública del local: servicios con precio, equipo, galería (solo fotos con consentimiento vigente) y botón de reservar.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { API_URL, money, publicApi } from "../../config";
import { Shell } from "../../components/public/Shell";
import type { Venue } from "../../components/public/types";
import "../../g2.css";

interface VService { id: number; name: string; description: string | null; price: number; price_is_from: boolean; duration_min: number }
interface Vitrina { categories: { name: string; services: VService[] }[]; team: { id: number; name: string; role_label: string | null; bio: string | null; photo: string | null }[]; gallery_count: number; instagram: string | null; google_review_url: string | null; photo_policy_text: string | null; web_turnos: boolean }
interface GItem { id: number; kind: string; caption: string | null; pair_id: number | null; month: string }
const KIND: Record<string, string> = { ANTES: "Antes", DESPUES: "Después", REFERENCIA: "Referencia", OTRA: "" };

export default function VitrinaPage() {
  const { slug = "" } = useParams();
  const [venue, setVenue] = useState<Venue | null>(null);
  const [data, setData] = useState<Vitrina | null>(null);
  const [gallery, setGallery] = useState<GItem[]>([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<GItem | null>(null);
  useEffect(() => {
    publicApi<Venue>(`/public/${slug}/info`).then((v) => setVenue({ ...v, slug })).catch((e) => setError(e.message));
    publicApi<Vitrina>(`/public/${slug}/vitrina`).then(setData).catch((e) => setError(e.message));
    publicApi<{ items: GItem[] }>(`/public/${slug}/gallery`).then((g) => setGallery(g.items)).catch(() => setGallery([]));
  }, [slug]);
  const img = (id: number, thumb = false) => `${API_URL}/public/${slug}/gallery/${id}${thumb ? "/thumb" : ""}`;
  const pairOf = (g: GItem) => gallery.find((x) => x.id === g.pair_id) || null;
  const insta = data?.instagram ? (data.instagram.startsWith("http") ? data.instagram : `https://instagram.com/${data.instagram.replace(/^@/, "")}`) : null;

  return (
    <Shell title="Vitrina" venue={venue} heading={venue?.name || "Nuestro local"} intro="Servicios, equipo y cómo llegar." error={error}
      bar={data?.web_turnos ? <div className="g2-vit-cta"><Link to={`/t/${slug}`}>Reservar {venue?.vocabulary?.turno ? `un ${venue.vocabulary.turno}` : "turno"}</Link></div> : undefined}>
      {!data ? <div className="pb-card"><span className="pb-step-label">Cargando</span></div> : (
        <>
          <div className="pb-card g2-vit-section">
            <span className="pb-step-label">Servicios y precios</span>
            {!data.categories.length && <p className="tn-pub-legal">Pronto vamos a cargar los servicios.</p>}
            {data.categories.map((c) => (
              <div key={c.name}><h2 className="g2-vit-cat">{c.name}</h2>
                {c.services.map((s) => (
                  <div key={s.id} className="g2-vit-svc"><div><strong>{s.name}</strong><small>{s.duration_min} min{s.description ? ` · ${s.description}` : ""}</small></div>
                    <span className="g2-vit-price">{s.price_is_from ? "Desde " : ""}{money(s.price)}</span></div>))}
              </div>))}
          </div>

          {data.team.length > 0 && (
            <div className="pb-card g2-vit-section"><span className="pb-step-label">Equipo</span>
              <div className="g2-vit-team">{data.team.map((p) => (
                <div key={p.id} className="g2-vit-person"><b>{p.photo && /^(data:image|https?:)/.test(p.photo) ? <img src={p.photo} alt={p.name} /> : <span aria-hidden="true">{p.name.slice(0, 1)}</span>}</b>
                  <strong>{p.name}</strong>{p.role_label && <small>{p.role_label}</small>}{p.bio && <small>{p.bio}</small>}</div>))}</div></div>)}

          {gallery.length > 0 && (
            <div className="pb-card g2-vit-section"><span className="pb-step-label">Trabajos</span>
              <div className="g2-vit-gal">{gallery.map((g) => (
                <button key={g.id} type="button" onClick={() => setOpen(g)} aria-label={g.caption || "Ver foto"}>
                  <img src={img(g.id, true)} alt={g.caption || "Trabajo realizado"} loading="lazy" />{KIND[g.kind] && <span>{KIND[g.kind]}</span>}</button>))}</div>
              <p className="tn-pub-legal">Fotos publicadas con autorización de cada cliente.</p></div>)}

          {(insta || data.google_review_url) && (
            <div className="pb-card g2-vit-section"><span className="pb-step-label">Seguinos</span>
              <p style={{ margin: 0, display: "flex", gap: 16, flexWrap: "wrap" }}>
                {insta && <a href={insta} target="_blank" rel="noreferrer" style={{ color: "#4a1d4e", fontWeight: 700 }}>Instagram</a>}
                {data.google_review_url && <a href={data.google_review_url} target="_blank" rel="noreferrer" style={{ color: "#4a1d4e", fontWeight: 700 }}>Dejanos tu opinión en Google</a>}</p></div>)}
        </>)}
      {open && (
        <div className="g2-lightbox" role="dialog" aria-modal="true" aria-label="Foto ampliada" onClick={() => setOpen(null)}>
          <div style={{ display: "grid", gap: 8, maxWidth: "100%" }} onClick={(e) => e.stopPropagation()}>
            <img src={img(open.id)} alt={open.caption || "Trabajo realizado"} />
            {pairOf(open) && <img src={img(pairOf(open)!.id)} alt={pairOf(open)!.caption || "Trabajo realizado"} />}
            {open.caption && <p style={{ color: "#ffffff", margin: 0, textAlign: "center" }}>{open.caption}</p>}
          </div>
          <button type="button" onClick={() => setOpen(null)} aria-label="Cerrar">×</button>
        </div>)}
    </Shell>
  );
}
