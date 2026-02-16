import { useEffect, useRef } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";

type MapComponentProps = {
  center?: [number, number];
  zoom?: number;
  markers?: Array<{ lat: number; lng: number; label?: string }>;
};

export default function MapComponent({
  center = [-37.8136, 144.9631],
  zoom = 13,
  markers = [],
}: MapComponentProps) {
  const webViewRef = useRef<WebView>(null);

  const leafletHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
      <style>
        body { margin: 0; padding: 0; }
        html, body, #map { height: 100%; width: 100%; }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        try {
          const map = L.map('map').setView([${center[0]}, ${center[1]}], ${zoom});
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19
          }).addTo(map);
          
          const markers = ${JSON.stringify(markers)};
          markers.forEach(m => {
            L.marker([m.lat, m.lng]).bindPopup(m.label || 'Location').addTo(map);
          });
          
          map.on('moveend', () => {
            const bounds = map.getBounds();
            window.ReactNativeWebView?.postMessage(JSON.stringify({
              type: 'boundsChanged',
              minLat: bounds.getSouthWest().lat,
              maxLat: bounds.getNorthEast().lat,
              minLng: bounds.getSouthWest().lng,
              maxLng: bounds.getNorthEast().lng
            }));
          });
        } catch(e) {
          console.error('Map error:', e);
        }
      </script>
    </body>
    </html>
  `;

  return (
    <View style={{ flex: 1, width: "100%", height: "100%" }}>
      <WebView
        ref={webViewRef}
        originWhitelist={["*"]}
        source={{ html: leafletHtml }}
        javaScriptEnabled={true}
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            console.log("Map event:", data);
          } catch (e) {
            console.error("Failed to parse map event:", e);
          }
        }}
      />
    </View>
  );
}
