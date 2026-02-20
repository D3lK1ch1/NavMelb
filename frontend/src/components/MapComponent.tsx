import { useEffect, useRef } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";

type Marker = { lat: number; lng: number; label?: string };
type MapComponentProps = {
  center?: [number, number];
  zoom?: number;
  markers?: Marker[];
  waypoints?: Marker[]; // dynamic routing points
};

export default function MapComponent({
  center = [-37.8136, 144.9631],
  zoom = 13,
  markers = [],
  waypoints = [],
}: MapComponentProps) {
  const webViewRef = useRef<WebView>(null);

  const leafletHtml = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Leaflet Map</title>
<link
  rel="stylesheet"
  href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
/>
<link
  rel="stylesheet"
  href="https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.css"
/>
<style>
  html, body, #map {
    height: 100%;
    margin: 0;
    padding: 0;
  }
  .leaflet-routing-container { 
    background: rgba(255,255,255,0.9); 
  }
</style>
</head>
<body>
<div id="map"></div>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.js"></script>
<script>
  const map = L.map('map').setView([${center[0]}, ${center[1]}], ${zoom});

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);

  let markersLayer = L.layerGroup().addTo(map);
  let routingControl = null;

  function updateMarkers(markerList) {
    markersLayer.clearLayers();
    markerList.forEach(m => {
      const marker = L.circleMarker([m.lat, m.lng], {
        radius: 8,
        color: 'red',
        fillColor: '#f03',
        fillOpacity: 0.8,
      }).addTo(markersLayer);
      if (m.label) marker.bindPopup(m.label);
    });
  }

  function updateWaypoints(waypointsList) {
    if (routingControl) {
      map.removeControl(routingControl);
      routingControl = null;
    }

    if (waypointsList.length < 2) return; // Need at least 2 points for routing

    const wp = waypointsList.map(p => L.latLng(p.lat, p.lng));
    routingControl = L.Routing.control({
      waypoints: wp,
      routeWhileDragging: true,
      lineOptions: {
        styles: [{ color: 'blue', opacity: 0.8, weight: 6 }]
      },
      createMarker: function() { return null; } // prevent duplicate markers
    }).addTo(map);

    // Fit map bounds to include all waypoints
    const bounds = L.latLngBounds(wp);
    map.fitBounds(bounds, { padding: [50, 50] });
  }

  // Initial render
  updateMarkers(${JSON.stringify(markers)});
  updateWaypoints(${JSON.stringify(waypoints)});

  // Listen to messages from React Native
  function handleMessage(event) {
    try {
      const data = JSON.parse(event.data);
      if(data.type === 'updateMarkers') updateMarkers(data.markers || []);
      if(data.type === 'updateWaypoints') updateWaypoints(data.waypoints || []);
    } catch(e) {
      console.error(e);
    }
  }

  document.addEventListener('message', handleMessage);
  window.addEventListener('message', handleMessage);
</script>
</body>
</html>
`;

  // Send updated markers to WebView
  useEffect(() => {
    if (webViewRef.current) {
      webViewRef.current.postMessage(
        JSON.stringify({ type: "updateMarkers", markers })
      );
    }
  }, [markers]);

  // Send updated waypoints to WebView
  useEffect(() => {
    if (webViewRef.current) {
      webViewRef.current.postMessage(
        JSON.stringify({ type: "updateWaypoints", waypoints })
      );
    }
  }, [waypoints]);

  return (
    <View style={{ flex: 1 }}>
      <WebView
        ref={webViewRef}
        originWhitelist={["*"]}
        source={{ html: leafletHtml }}
        javaScriptEnabled
        domStorageEnabled
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