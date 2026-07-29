"use client";

import React, { useState } from 'react';
import { MapContainer, TileLayer, FeatureGroup } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';

export default function MapDrawTool() {
  // Çizilen alanın verisini tutacağımız state (durum)
  const [geoJsonData, setGeoJsonData] = useState(null);

  // Çizim işlemi bittiğinde otomatik çalışacak fonksiyon
  const handleCreated = (e) => {
    const { layerType, layer } = e;
    
    // Görevdeki gibi sadece poligon veya dikdörtgen çizildiyse işlem yap
    if (layerType === 'polygon' || layerType === 'rectangle') {
      // Çizilen alanı istenilen formata (GeoJSON) çeviriyoruz
      const geoJson = layer.toGeoJSON();
      setGeoJsonData(geoJson);
      
      // Arka planda geliştirici konsolunda görebilmek için yazdırıyoruz
      console.log("Üretilen GeoJSON Verisi:", JSON.stringify(geoJson, null, 2));
    }
  };

  return (
    <div className="relative w-full h-[500px] border-2 border-gray-200 rounded-lg overflow-hidden">
      <MapContainer 
        center={[39.92077, 32.85411]} // Haritayı Türkiye (Ankara) merkezli başlatıyoruz
        zoom={6} 
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap'
        />
        
        {/* Çizim araçlarını haritaya eklediğimiz kısım */}
        <FeatureGroup>
          <EditControl
            position="topright"
            onCreated={handleCreated}
            draw={{
              circle: false,         // Yuvarlak çizimi kapalı
              circlemarker: false,   // Yuvarlak işaretçi kapalı
              marker: false,         // Nokta işareti (pin) kapalı
              polyline: false,       // Çizgi kapalı
              polygon: true,         // Poligon (Çokgen) AÇIK
              rectangle: true        // Dikdörtgen AÇIK
            }}
          />
        </FeatureGroup>
      </MapContainer>

      {/* Test ederken ekranda GeoJSON verisini anlık görmek için ufak bir bilgi kutusu */}
      {geoJsonData && (
        <div className="absolute bottom-4 left-4 z-[1000] bg-white p-4 rounded-md shadow-lg max-w-xs overflow-auto max-h-40">
          <h4 className="font-bold text-sm mb-2">Seçilen Alan (GeoJSON):</h4>
          <pre className="text-xs text-gray-600">
            {JSON.stringify(geoJsonData, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}