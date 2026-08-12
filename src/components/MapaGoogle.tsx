import { useEffect, useRef } from "react";

type Punto = {
  id: string;
  nombre: string;
  distrito: string;
  lat: number;
  lng: number;
  menu_hoy?: { nombre_plato: string; precio: number } | null;
};

declare global {
  interface Window {
    google?: any;
    __initLaOllitaMap?: () => void;
    __laOllitaMapReady?: boolean;
  }
}

const SCRIPT_ID = "google-maps-js-laollita";

function cargarGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.__laOllitaMapReady && window.google?.maps) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const onReady = () => resolve();
    if (existing) {
      if (window.__laOllitaMapReady) return resolve();
      existing.addEventListener("laollita-ready", onReady, { once: true });
      existing.addEventListener("error", () => reject(new Error("Maps script failed")), { once: true });
      return;
    }
    const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
    const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID ?? "";
    if (!key) return reject(new Error("Falta GOOGLE_MAPS_BROWSER_KEY"));

    window.__initLaOllitaMap = () => {
      window.__laOllitaMapReady = true;
      document.getElementById(SCRIPT_ID)?.dispatchEvent(new Event("laollita-ready"));
      resolve();
    };

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&callback=__initLaOllitaMap${channel ? `&channel=${encodeURIComponent(channel)}` : ""}`;
    script.addEventListener("error", () => reject(new Error("No se pudo cargar Google Maps")));
    document.head.appendChild(script);
  });
}

export function MapaGoogle({ puntos, onSeleccionar }: { puntos: Punto[]; onSeleccionar?: (id: string) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const infoRef = useRef<any>(null);

  useEffect(() => {
    let cancelado = false;
    cargarGoogleMaps()
      .then(() => {
        if (cancelado || !ref.current || !window.google?.maps) return;
        const g = window.google.maps;
        const center = puntos.length
          ? { lat: puntos[0].lat, lng: puntos[0].lng }
          : { lat: -12.0464, lng: -77.0428 };
        mapRef.current = new g.Map(ref.current, {
          center,
          zoom: 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        infoRef.current = new g.InfoWindow();
        pintarMarcadores();
      })
      .catch((e) => console.error(e));
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    pintarMarcadores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puntos]);

  function pintarMarcadores() {
    const g = window.google?.maps;
    if (!g || !mapRef.current) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    const bounds = new g.LatLngBounds();
    puntos.forEach((p) => {
      const marker = new g.Marker({
        position: { lat: p.lat, lng: p.lng },
        map: mapRef.current,
        title: p.nombre,
      });
      marker.addListener("click", () => {
        const menu = p.menu_hoy
          ? `<div style="margin-top:4px;color:#7a4a2c;font-weight:600">${escapeHtml(p.menu_hoy.nombre_plato)} · S/ ${p.menu_hoy.precio.toFixed(2)}</div>`
          : `<div style="margin-top:4px;color:#888;font-size:12px">Aún no publica el menú</div>`;
        const btn = onSeleccionar
          ? `<button id="ir-${p.id}" style="margin-top:8px;padding:6px 12px;background:#c0623f;color:#fff;border:none;border-radius:999px;font-weight:600;cursor:pointer">Ver detalle</button>`
          : "";
        infoRef.current.setContent(
          `<div style="font-family:system-ui;max-width:220px"><div style="font-weight:700;font-size:14px">${escapeHtml(p.nombre)}</div><div style="font-size:12px;color:#666">${escapeHtml(p.distrito)}</div>${menu}${btn}</div>`,
        );
        infoRef.current.open(mapRef.current, marker);
        if (onSeleccionar) {
          setTimeout(() => {
            const el = document.getElementById(`ir-${p.id}`);
            if (el) el.onclick = () => onSeleccionar(p.id);
          }, 50);
        }
      });
      markersRef.current.push(marker);
      bounds.extend(marker.getPosition());
    });
    if (puntos.length > 1) mapRef.current.fitBounds(bounds, 40);
  }

  return (
    <div className="rounded-3xl overflow-hidden border border-arena bg-white">
      <div ref={ref} style={{ width: "100%", height: 420 }} />
    </div>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}