import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export type RadarPin = {
  id: number | string;
  lat: number;
  lng: number;
  label: string;
  score: number;
};

type Props = {
  center: { lat: number; lng: number } | null;
  pins: RadarPin[];
  scanning: boolean;
};

function MapRecenter({ center }: { center: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView([center.lat, center.lng], 12, { animate: true });
    }
  }, [center, map]);
  return null;
}

function pinColor(score: number): string {
  if (score >= 70) {
    return "#f87171";
  }
  if (score >= 45) {
    return "#fbbf24";
  }
  return "#34d399";
}

export function RadarMap({ center, pins, scanning }: Props) {
  const defaultCenter = center ?? { lat: 51.505, lng: -0.09 };

  return (
    <div className="relative min-h-[280px] flex-1 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
      {scanning ? (
        <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center">
          <div className="radar-pulse h-48 w-48 rounded-full border border-cyan-400/40" />
        </div>
      ) : null}

      <MapContainer
        center={[defaultCenter.lat, defaultCenter.lng]}
        zoom={11}
        className="h-full min-h-[280px] w-full"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapRecenter center={center} />
        {pins.map((pin) => (
          <CircleMarker
            key={pin.id}
            center={[pin.lat, pin.lng]}
            radius={8}
            pathOptions={{
              color: pinColor(pin.score),
              fillColor: pinColor(pin.score),
              fillOpacity: 0.85,
              weight: 1,
            }}
          />
        ))}
      </MapContainer>
    </div>
  );
}
