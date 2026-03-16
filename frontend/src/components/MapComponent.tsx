import { useEffect, useRef } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import { RouteSegment } from "../types";

type Marker = { lat: number; lng: number; label?: string };
type MapComponentProps = {
  center?: [number, number];
  zoom?: number;
  markers?: Marker[];
  waypoints?: Marker[];
  routeSegments?: RouteSegment[];
  onMapClick?: (coord: { lat: number; lng: number }) => void;
};

export default function MapComponent({
  center = [-37.8136, 144.9631],
  zoom = 13,
  markers = [],
  waypoints = [],
  routeSegments = [],
  onMapClick,
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
  .leaf-routing-container { 
    display: none; 
  }
</style>
</head>
<body>
<div id="map"></div>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.js"></script>
<script>
  const map = L.map('map').setView([${center[0]}, ${center[1]}], ${zoom});

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);

  let markersLayer = L.layerGroup().addTo(map);
  let polylinesLayer = L.layerGroup().addTo(map);
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

  function updateRouteSegments(segments) {
    polylinesLayer.clearLayers();
    if (routingControl) {
      map.removeControl(routingControl);
      routingControl = null;
    }
    
    segments.forEach(seg => {
      const polyline = L.polyline(seg.coordinates, {
        color: seg.color,
        weight: 5,
        opacity: 0.8,
      }).addTo(polylinesLayer);
    });
    
    if (segments.length > 0) {
      const bounds = L.latLngBounds(
        segments.flatMap(s => s.coordinates)
      );
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }

  function updateWaypoints(waypointsList) {
    if (routingControl) {
      map.removeControl(routingControl);
      routingControl = null;
    }

    if (waypointsList.length < 2) return;

    const wp = waypointsList.map(p => L.latLng(p.lat, p.lng));
    routingControl = L.Routing.control({
      waypoints: wp,
      routeWhileDragging: true,
      lineOptions: {
        styles: [{ color: 'blue', opacity: 0.8, weight: 6 }]
      },
      createMarker: function() { return null; }
    }).addTo(map);

    const bounds = L.latLngBounds(wp);
    map.fitBounds(bounds, { padding: [50, 50] });
  }

  updateMarkers(${JSON.stringify(markers)});
  updateRouteSegments(${JSON.stringify(routeSegments)});
  updateWaypoints(${JSON.stringify(waypoints)});

  function handleMessage(event) {
    try {
      const data = JSON.parse(event.data);
      if(data.type === 'updateMarkers') updateMarkers(data.markers || []);
      if(data.type === 'updateWaypoints') updateWaypoints(data.waypoints || []);
      if(data.type === 'updateRouteSegments') updateRouteSegments(data.routeSegments || []);
    } catch(e) {
      console.error(e);
    }
  }

  document.addEventListener('message', handleMessage);
  window.addEventListener('message', handleMessage);

  map.on('click', function(e) {
    const payload = JSON.stringify({ type: 'mapClick', lat: e.latlng.lat, lng: e.latlng.lng });
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(payload);
    }
  });
</script>
</body>
</html>
`;

  useEffect(() => {
    if (webViewRef.current) {
      webViewRef.current.postMessage(
        JSON.stringify({ type: "updateMarkers", markers })
      );
    }
  }, [markers]);

  useEffect(() => {
    if (webViewRef.current) {
      webViewRef.current.postMessage(
        JSON.stringify({ type: "updateWaypoints", waypoints })
      );
    }
  }, [waypoints]);

  useEffect(() => {
    if (webViewRef.current) {
      webViewRef.current.postMessage(
        JSON.stringify({ type: "updateRouteSegments", routeSegments })
      );
    }
  }, [routeSegments]);

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
            if (data?.type === "mapClick" && typeof data.lat === "number" && typeof data.lng === "number") {
              onMapClick?.({ lat: data.lat, lng: data.lng });
            }
          } catch (e) {
            console.error("Failed to parse map event:", e);
          }
        }}
      />
    </View>
  );
}