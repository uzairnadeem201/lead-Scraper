'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface MapComponentProps {
  lat: number | null;
  lng: number | null;
  radiusKm: number;
  historyPoints: { lat: number; lng: number; radius_km: number; title: string }[];
  onPositionChange: (lat: number, lng: number) => void;
}

export default function MapComponent({ lat, lng, radiusKm, onPositionChange, historyPoints }: MapComponentProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markerInstance = useRef<L.Marker | null>(null);
  const circleInstance = useRef<L.Circle | null>(null);
  const historyLayerGroup = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    if (!mapInstance.current) {
      mapInstance.current = L.map(mapRef.current, {
        center: [33.749, -84.388], 
        zoom: 10,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        maxZoom: 19,
      }).addTo(mapInstance.current);

      historyLayerGroup.current = L.layerGroup().addTo(mapInstance.current);

      mapInstance.current.on('click', (e: L.LeafletMouseEvent) => {
        onPositionChange(e.latlng.lat, e.latlng.lng);
      });
    }

    // Default icon manual fix for Leaflet + React
    L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });

  }, [onPositionChange]);

  useEffect(() => {
    if (!mapInstance.current || lat === null || lng === null) return;

    if (markerInstance.current) {
      markerInstance.current.remove();
    }
    if (circleInstance.current) {
      circleInstance.current.remove();
    }

    markerInstance.current = L.marker([lat, lng], { draggable: true }).addTo(mapInstance.current);
    
    markerInstance.current.on('dragend', (e) => {
      const p = e.target.getLatLng();
      if (typeof onPositionChange === 'function') {
        onPositionChange(p.lat, p.lng);
      }
    });

    circleInstance.current = L.circle([lat, lng], {
      radius: radiusKm * 1000,
      color: "#7c3aed",
      fillColor: "#7c3aed",
      fillOpacity: 0.08,
      weight: 2,
      dashArray: "6 4",
    }).addTo(mapInstance.current);

    mapInstance.current.setView([lat, lng], mapInstance.current.getZoom());
  }, [lat, lng, radiusKm, onPositionChange]);

  useEffect(() => {
    if (!historyLayerGroup.current) return;
    historyLayerGroup.current.clearLayers();
    
    historyPoints.forEach(point => {
        if (!point.lat || !point.lng) return;
        L.circle([point.lat, point.lng], {
            radius: (point.radius_km || 25) * 1000,
            color: "#64748b",
            fillColor: "#64748b",
            fillOpacity: 0.04,
            weight: 1,
            dashArray: "4 4",
        }).addTo(historyLayerGroup.current!).bindTooltip(point.title, { direction: "top" });
    });
  }, [historyPoints]);

  return <div ref={mapRef} style={{ width: '100%', height: '100%' }} />;
}
