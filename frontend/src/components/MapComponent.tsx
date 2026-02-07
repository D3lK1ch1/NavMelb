import React, { useState, useRef, useEffect } from "react";
import { StyleSheet, View, Text, ActivityIndicator } from "react-native";
import { WebView } from "react-native-webview";
import { TrafficLight } from "../types";
import { fetchTrafficLightsByBounds } from "../services/api";

const MELBOURNE_INITIAL_REGION = {
  latitude: -37.8136,
  longitude: 144.9631,
  latitudeDelta: 0.1,
  longitudeDelta: 0.1,
};

interface MapComponentProps {
  showTrafficLights?: boolean;
}

export const MapComponent: React.FC<MapComponentProps> = ({
  showTrafficLights = true,
}) => {
  const [trafficLights, setTrafficLights] = useState<TrafficLight[]>([]);
  const [loading, setLoading] = useState(false);
  const [mapRegion, setMapRegion] = useState(MELBOURNE_INITIAL_REGION);
  const webviewRef = useRef<any>(null);

  // When backend returns new traffic lights, push them into the WebView map
  useEffect(() => {
    if (!webviewRef.current) return;
    const markers = trafficLights.map((t) => ({
      id: t.id,
      lat: t.position.lat,
      lng: t.position.lng,
      title: `${t.road || "Traffic Light"}`,
      state: t.state,
    }));

    const js = `window.updateMarkers(${JSON.stringify(markers)});true;`;
    webviewRef.current.injectJavaScript(js);
  }, [trafficLights]);

  // Fetch traffic lights when region changes (called from WebView)
  const handleRegionChange = async (region: any) => {
    setMapRegion(region);

    if (!showTrafficLights) return;

    try {
      setLoading(true);
      const minLat = region.latitude - region.latitudeDelta / 2;
      const maxLat = region.latitude + region.latitudeDelta / 2;
      const minLng = region.longitude - region.longitudeDelta / 2;
      const maxLng = region.longitude + region.longitudeDelta / 2;

      const response = await fetchTrafficLightsByBounds(
        minLat,
        maxLat,
        minLng,
        maxLng
      );

      if (response.success && response.data) {
        setTrafficLights(response.data);
      } else {
        setTrafficLights([]);
      }
    } catch (error) {
      console.error("Error fetching traffic lights:", error);
      setTrafficLights([]);
    } finally {
      setLoading(false);
    }
  };

  // HTML content with Leaflet map. Uses window.updateMarkers(json) to update markers
  const makeHTML = (lat: number, lng: number) => `
  <!doctype html>
  <html>
  <head>
    <meta name="viewport" content="initial-scale=1, maximum-scale=1">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
    <style>html,body,#map{height:100%;margin:0;padding:0}</style>
  </head>
  <body>
    <div id="map"></div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
      const center = [${lat}, ${lng}];
      const map = L.map('map', {zoomControl:true}).setView(center, 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      let markers = [];
      window.updateMarkers = function(data){
        try{
          markers.forEach(m => map.removeLayer(m));
        }catch(e){}
        markers = (data||[]).map(function(item){
          const m = L.circleMarker([item.lat, item.lng], {radius:6, color:'#007AFF'}).addTo(map);
          m.bindPopup(item.title||'');
          return m;
        });
      }

      function sendRegion(){
        const bounds = map.getBounds();
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        const center = map.getCenter();
        const payload = {
          latitude: center.lat,
          longitude: center.lng,
          latitudeDelta: Math.abs(ne.lat - sw.lat),
          longitudeDelta: Math.abs(ne.lng - sw.lng)
        };
        if(window.ReactNativeWebView && window.ReactNativeWebView.postMessage){
          window.ReactNativeWebView.postMessage(JSON.stringify({type:'region', region: payload}));
        }
      }

      map.on('moveend', function(){ sendRegion(); });

      // send initial region after load
      setTimeout(sendRegion, 500);
    </script>
  </body>
  </html>
  `;

  return (
    <View style={styles.container}>
      <WebView
        originWhitelist={["*"]}
        source={{ html: makeHTML(MELBOURNE_INITIAL_REGION.latitude, MELBOURNE_INITIAL_REGION.longitude) }}
        style={styles.map}
        ref={webviewRef}
        onMessage={(event) => {
          try {
            const msg = JSON.parse(event.nativeEvent.data);
            if (msg && msg.type === 'region' && msg.region) {
              handleRegionChange(msg.region);
            }
          } catch (e) {
            // ignore
          }
        }}
      />

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#0000ff" />
          <Text style={styles.loadingText}>Loading traffic lights...</Text>
        </View>
      )}

      <View style={styles.debugInfo}>
        <Text style={styles.debugText}>Traffic Lights: {trafficLights.length}</Text>
        <Text style={styles.debugText}>Zoom: {mapRegion.latitudeDelta.toFixed(4)}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  loadingText: {
    marginTop: 10,
    color: "#fff",
    fontSize: 14,
  },
  debugInfo: {
    position: "absolute",
    bottom: 10,
    left: 10,
    backgroundColor: "rgba(0,0,0,0.7)",
    padding: 10,
    borderRadius: 5,
    zIndex: 5,
  },
  debugText: {
    color: "#fff",
    fontSize: 12,
    marginVertical: 2,
  },
});
