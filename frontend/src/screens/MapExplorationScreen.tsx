import React, { useState, useEffect, useCallback } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import * as Location from "expo-location";
import { lookupDestination, searchStations, calculateRoute } from "../services/api";
import { ApiResponse, Coordinate, Waypoint, RouteSegment, RouteStrategy, RouteResult, TransportType } from "../types";
import MapComponent from "../components/MapComponent";
import { mapExplorationStyles as styles } from "../styles/mapExploration";

type StationSearchResult = { name: string; position: Coordinate; transportTypes: TransportType[] };

export const MapExplorationScreen: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [origin, setOrigin] = useState<Coordinate | null>(null);
  const [destination, setDestination] = useState<Coordinate | null>(null);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [searchResults, setSearchResults] = useState<StationSearchResult[]>([]);
  const [strategy, setStrategy] = useState<RouteStrategy>("car");
  const [routeSegments, setRouteSegments] = useState<RouteSegment[]>([]);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(true);
  const [searchMode, setSearchMode] = useState<"place" | "station">("place");
  const [transportFilter, setTransportFilter] = useState<"tram" | "train" | "bus" | undefined>(undefined);

  const handleUseMyLocation = async () => {
    try {
      setLoading(true);
      setError(null);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError("Location permission denied");
        return;
      }

      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coord: Coordinate = { lat: pos.coords.latitude, lng: pos.coords.longitude, name: "My Location" };
      setOrigin(coord);
      setShowMap(true);
    } catch (err: any) {
      setError(err?.message || "Failed to get location");
    } finally {
      setLoading(false);
    }
  };

  const calculateRoutePreview = useCallback(async () => {
    if (!origin || !destination) return;

    try {
      const stationCount = waypoints.filter((w) => w.type === "station").length;
      if (strategy === "ptv" && stationCount < 2) {
        setRouteResult(null);
        setRouteSegments([]);
        setError("PTV routing requires at least 2 station waypoints (use Station search to add them).");
        return;
      }
      if (strategy === "park-and-ride" && stationCount < 1) {
        setRouteResult(null);
        setRouteSegments([]);
        setError("Park & Ride requires at least 1 station waypoint (use Station search to add one).");
        return;
      }

      const response: ApiResponse<RouteResult> = await calculateRoute(origin, destination, strategy, waypoints);
      if (response.success && response.data) {
        setRouteResult(response.data);
        setRouteSegments(response.data.segments);
        setError(null);
      } else if (!response.success) {
        setError(response.error || "Route calculation failed");
      }
    } catch (err) {
      const message =
        (err as any)?.response?.data?.error ||
        (err as any)?.message ||
        "Route preview failed";
      setError(message);
    }
  }, [origin, destination, strategy, waypoints]);

  useEffect(() => {
    if (origin && destination) {
      calculateRoutePreview();
    }
  }, [origin, destination, strategy, waypoints, calculateRoutePreview]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setError("Please enter a search term");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      if (searchMode === "station") {
        const response = await searchStations(searchQuery, 20, transportFilter);
        if (response.success && response.data && response.data.length > 0) {
          setSearchResults(response.data);
        } else {
          setError("No stations found");
        }
      } else {
        const response = await lookupDestination(searchQuery);
        if (response.success && response.data) {
          const newPlace = { ...response.data, name: searchQuery };

          if (!origin) {
            setOrigin(newPlace);
          } else if (!destination) {
            setDestination(newPlace);
          }
          setSearchQuery("");
        } else {
          setError(response.error || "Place not found");
        }
      }
    } catch (err: any) {
      setError(err.message || "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectStation = (station: StationSearchResult) => {
    const newWaypoint: Waypoint = {
      position: station.position,
      type: "station",
      name: station.name,
      transportTypes: station.transportTypes,
    };

    const newWaypoints = [...waypoints, newWaypoint];
    setWaypoints(newWaypoints);
    setSearchResults([]);
    setSearchQuery("");
  };

  const handleRemoveWaypoint = (index: number) => {
    const newWaypoints = waypoints.filter((_, i) => i !== index);
    setWaypoints(newWaypoints);
  };

  const resetForm = () => {
    setSearchQuery("");
    setOrigin(null);
    setDestination(null);
    setWaypoints([]);
    setSearchResults([]);
    setRouteSegments([]);
    setRouteResult(null);
    setError(null);
  };

  const getMarkers = () => {
    const result = [];
    if (origin) result.push({ lat: origin.lat, lng: origin.lng, label: origin.name || "Start" });
    if (destination) result.push({ lat: destination.lat, lng: destination.lng, label: destination.name || "Destination" });
    waypoints.forEach((w, i) => result.push({ lat: w.position.lat, lng: w.position.lng, label: w.name || `Station ${i + 1}` }));
    return result;
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  return (
    <View style={styles.container}>
      {showMap && (
        <View style={{ flex: 1 }}>
          <MapComponent
            markers={getMarkers()}
            routeSegments={routeSegments}
            onMapClick={({ lat, lng }) => {
              const picked: Coordinate = { lat, lng, name: "Picked" };
              if (!origin) setOrigin(picked);
              else if (!destination) setDestination(picked);
              else setDestination(picked);
              setShowMap(true);
            }}
          />
        </View>
      )}

      <View style={styles.controlPanel}>
        <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
          <Text style={styles.title}>NavMelb</Text>

          <View style={styles.routeTypeContainer}>
            <TouchableOpacity
              style={[styles.routeTypeButton, strategy === "car" && styles.routeTypeActive]}
              onPress={() => setStrategy("car")}
            >
              <Text style={styles.routeTypeText}>Car</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.routeTypeButton, strategy === "ptv" && styles.routeTypeActive]}
              onPress={() => setStrategy("ptv")}
            >
              <Text style={styles.routeTypeText}>PTV</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.routeTypeButton, strategy === "park-and-ride" && styles.routeTypeActive]}
              onPress={() => setStrategy("park-and-ride")}
            >
              <Text style={styles.routeTypeText}>Park & Ride</Text>
            </TouchableOpacity>
          </View>

          <Text style={{ marginBottom: 8, color: '#666', fontSize: 12 }}>
            {strategy === "car" && "Driving route only"}
            {strategy === "ptv" && "Public transport only (requires stations)"}
            {strategy === "park-and-ride" && `Drive to station, then PTV: ${waypoints.length} station(s)`}
          </Text>

          <View style={styles.searchModeContainer}>
            <TouchableOpacity
              style={[styles.modeButton, searchMode === "place" && styles.modeActive]}
              onPress={() => setSearchMode("place")}
            >
              <Text style={styles.modeText}>Place</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeButton, searchMode === "station" && styles.modeActive]}
              onPress={() => setSearchMode("station")}
            >
              <Text style={styles.modeText}>Station</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputSection}>
            <TextInput
              style={styles.input}
              placeholder={searchMode === "station" ? "Search station..." : "Search place..."}
              value={searchQuery}
              onChangeText={setSearchQuery}
              editable={!loading}
            />
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSearch}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Search</Text>
              )}
            </TouchableOpacity>
          </View>

          {searchResults.length > 0 && (
            <View style={styles.resultsContainer}>
              {searchResults.slice(0, 5).map((result, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.resultItem}
                  onPress={() => handleSelectStation(result)}
                >
                  <Text style={styles.resultText}>
                    {result.transportTypes.join(",")}: {result.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          {origin && (
            <View style={styles.resultBox}>
              <Text style={styles.resultLabel}>From: {origin.name}</Text>
              <Text style={styles.resultValue}>
                {origin.lat.toFixed(4)}, {origin.lng.toFixed(4)}
              </Text>
            </View>
          )}

          {waypoints.length > 0 && (
            <View style={styles.resultBox}>
              <Text style={styles.resultLabel}>Via Stations:</Text>
              {waypoints.map((w, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.resultValue}>• {(w.transportTypes || []).join(",")}: {w.name}</Text>
                  <TouchableOpacity onPress={() => handleRemoveWaypoint(i)} style={{ marginLeft: 8 }}>
                    <Text style={{ color: 'red' }}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {destination && (
            <View style={styles.resultBox}>
              <Text style={styles.resultLabel}>To: {destination.name}</Text>
              <Text style={styles.resultValue}>
                {destination.lat.toFixed(4)}, {destination.lng.toFixed(4)}
              </Text>
            </View>
          )}

          {routeResult && (
            <View style={[styles.resultBox, styles.distanceBox]}>
              <Text style={styles.resultLabel}>Distance:</Text>
              <Text style={styles.resultValue}>{(routeResult.totalDistance / 1000).toFixed(2)} km</Text>
              <Text style={styles.resultLabel}>Duration:</Text>
              <Text style={styles.resultValue}>{formatDuration(routeResult.totalDuration)}</Text>
              {routeResult.estimatedArrival && (
                <>
                  <Text style={styles.resultLabel}>Est. Arrival:</Text>
                  <Text style={styles.resultValue}>
                    {new Date(routeResult.estimatedArrival).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </>
              )}
              {routeResult.departureInfo && routeResult.departureInfo.length > 0 && (
                <>
                  <Text style={styles.resultLabel}>Next departures:</Text>
                  {routeResult.departureInfo.map((d, i) => (
                    <Text key={i} style={styles.resultValue}>
                      {d.stationName}: {d.waitTimeMinutes} min ({d.nextDeparture})
                    </Text>
                  ))}
                </>
              )}
            </View>
          )}

          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.button, styles.secondaryButton]}
              onPress={resetForm}
            >
              <Text style={styles.buttonText}>Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.secondaryButton]}
              onPress={handleUseMyLocation}
              disabled={loading}
            >
              <Text style={styles.buttonText}>Use My Location</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.secondaryButton]}
              onPress={() => setShowMap(!showMap)}
            >
              <Text style={styles.buttonText}>{showMap ? "Hide Map" : "Show Map"}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </View>
  );
};
