import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import * as Location from "expo-location";
import { lookupDestination, searchStations, calculateRoute } from "../services/api";
import { ApiResponse, Coordinate, Waypoint, RouteSegment, RouteStrategy, FailedLeg, RouteResult, TransportType } from "../types";
import MapComponent from "../components/MapComponent";
import { mapExplorationStyles as styles } from "../styles/mapExploration";

type StationSearchResult = { name: string; position: Coordinate; transportTypes: TransportType[]; displayName?: string; routeNames?: string[] };
type JourneyStop = { coord: Coordinate; name: string; type: "place" | "station"; transportTypes?: TransportType[] };
type ApiErrorShape = { response?: { data?: { error?: unknown } }; message?: unknown };

const stopLabel = (index: number) => String.fromCharCode(65 + index);

function nowAsTimeString(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function transportIcon(types: TransportType[]): string {
  if (types.includes("train")) return "Train";
  if (types.includes("tram")) return "Tram";
  return "Bus";
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error !== "object" || error === null) return fallback;
  const shaped = error as ApiErrorShape;
  const apiError = shaped.response?.data?.error;
  if (typeof apiError === "string" && apiError.length > 0) return apiError;
  if (typeof shaped.message === "string" && shaped.message.length > 0) return shaped.message;
  return fallback;
}

function isRouteSegment(segment: RouteSegment | FailedLeg): segment is RouteSegment {
  return segment.type !== "failed";
}

export const MapExplorationScreen: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [stops, setStops] = useState<JourneyStop[]>([]);
  const [departureTime, setDepartureTime] = useState<string>(nowAsTimeString());
  const [searchResults, setSearchResults] = useState<StationSearchResult[]>([]);
  const [routeSegments, setRouteSegments] = useState<(RouteSegment | FailedLeg)[]>([]);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(true);
  const [searchMode, setSearchMode] = useState<"place" | "station">("place");
  const [transportFilter] = useState<"tram" | "train" | "bus" | undefined>(undefined);
  const requestGenRef = useRef(0);
  const strategy: RouteStrategy = stops.slice(1, -1).some((stop) => stop.type === "station") ? "ptv" : "car";

  const addStop = (coord: Coordinate, name: string, type: "place" | "station", transportTypes?: TransportType[]) => {
    setStops((prev) => [...prev, { coord, name, type, transportTypes }]);
  };

  const removeStop = (index: number) => {
    setStops((prev) => prev.filter((_, i) => i !== index));
  };

  const moveStop = (from: number, to: number) => {
    setStops((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

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
      const coord: Coordinate = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setStops((prev) => [{ coord, name: "My Location", type: "place" }, ...prev]);
      setShowMap(true);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to get location"));
    } finally {
      setLoading(false);
    }
  };

  const calculateRoutePreview = useCallback(async () => {
    if (stops.length < 2) return;

    const myGeneration = ++requestGenRef.current;
    setLoading(true);
    setError(null);
    setRouteResult(null);
    setRouteSegments([]);

    try {
      const firstStop = stops[0];
      const lastStop = stops[stops.length - 1];
      const origin = firstStop.coord;
      const destination = lastStop.coord;
      const waypoints: Waypoint[] = stops.slice(1, -1).map((s) => ({
        position: s.coord,
        type: s.type,
        name: s.name,
        transportTypes: s.transportTypes,
      }));

      const response: ApiResponse<RouteResult> = await calculateRoute(
        origin,
        destination,
        strategy,
        waypoints,
        departureTime,
        firstStop.type,
        firstStop.name,
        lastStop.type,
        lastStop.name,
      );

      if (requestGenRef.current !== myGeneration) return;

      if (response.success && response.data) {
        setRouteResult(response.data);
        setRouteSegments(response.data.segments);
      } else {
        setError(response.error || "Route calculation failed");
      }
    } catch (err: unknown) {
      if (requestGenRef.current !== myGeneration) return;
      setError(getErrorMessage(err, "Route preview failed"));
    } finally {
      if (requestGenRef.current === myGeneration) {
        setLoading(false);
      }
    }
  }, [stops, strategy, departureTime]);

  useEffect(() => {
    if (stops.length >= 2) {
      calculateRoutePreview();
    } else {
      setRouteResult(null);
      setRouteSegments([]);
    }
  }, [stops, strategy, departureTime, calculateRoutePreview]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setError("Please enter a search term");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      if (searchMode === "station") {
        const response = await searchStations(searchQuery, 100, transportFilter);
        if (response.success && response.data && response.data.length > 0) {
          setSearchResults(response.data);
        } else {
          setError("No stations found");
        }
      } else {
        const response = await lookupDestination(searchQuery);
        if (response.success && response.data) {
          addStop({ ...response.data }, searchQuery, "place");
          setSearchQuery("");
        } else {
          setError(response.error || "Place not found");
        }
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Search failed"));
    } finally {
      setLoading(false);
    }
  };

  const handleSelectStation = (station: StationSearchResult) => {
    addStop(station.position, station.name, "station", station.transportTypes);
    setSearchResults([]);
    setSearchQuery("");
  };

  const resetForm = () => {
    setSearchQuery("");
    setStops([]);
    setSearchResults([]);
    setRouteSegments([]);
    setRouteResult(null);
    setError(null);
    setDepartureTime(nowAsTimeString());
  };

  const getMarkers = () =>
    stops.map((s, i) => ({
      lat: s.coord.lat,
      lng: s.coord.lng,
      label: `${stopLabel(i)}: ${s.name}`,
    }));

  const formatDuration = (seconds: number) => {
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      {showMap && (
        <View style={{ flex: 1 }}>
          <MapComponent
            markers={getMarkers()}
            routeSegments={routeSegments.filter(isRouteSegment)}
            onMapClick={({ lat, lng }) => {
              addStop({ lat, lng }, "Picked location", "place");
              setShowMap(true);
            }}
          />
        </View>
      )}

      <View style={styles.controlPanel}>
        <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
          <Text style={styles.title}>NavMelb</Text>

          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
            <Text style={{ marginRight: 8, color: "#444", fontSize: 13 }}>Depart at:</Text>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              placeholder="HH:MM"
              value={departureTime}
              onChangeText={setDepartureTime}
              keyboardType="numeric"
            />
          </View>

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
              placeholder={searchMode === "station" ? "Search station to add..." : "Search place to add..."}
              value={searchQuery}
              onChangeText={setSearchQuery}
              editable={!loading}
            />
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSearch}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Add</Text>}
            </TouchableOpacity>
          </View>

          <Text style={{ marginBottom: 8, color: "#666", fontSize: 12 }}>
            {searchMode === "place" && "Place stops route by car. Add station stops between places for PTV legs."}
            {searchMode === "station" && "Adjacent station stops route by PTV. Other legs route by car."}
          </Text>

          {searchResults.length > 0 && (
            <ScrollView style={styles.resultsContainer} nestedScrollEnabled>
              {searchResults.map((result, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.resultItem}
                  onPress={() => handleSelectStation(result)}
                >
                  <Text style={styles.resultText}>
                    {transportIcon(result.transportTypes)}{"  "}{result.displayName ?? result.name}
                    {result.routeNames && result.routeNames.length > 0
                      ? `  -  ${result.routeNames.slice(0, 3).join(" - ")}`
                      : ""}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          {stops.length > 0 && (
            <View style={styles.resultBox}>
              <Text style={styles.resultLabel}>Journey:</Text>
              {stops.map((stop, i) => (
                <View key={`${stop.name}-${i}`} style={{ flexDirection: "row", alignItems: "center", marginVertical: 2 }}>
                  <Text style={{ fontWeight: "bold", width: 24, color: "#333" }}>{stopLabel(i)}</Text>
                  <Text style={[styles.resultValue, { flex: 1 }]}>
                    {stop.type === "station" ? "Station: " : "Place: "}{stop.name}
                  </Text>
                  <TouchableOpacity onPress={() => removeStop(i)} style={{ paddingHorizontal: 6 }}>
                    <Text style={{ color: "red", fontSize: 14 }}>x</Text>
                  </TouchableOpacity>
                  {i > 0 && (
                    <TouchableOpacity onPress={() => moveStop(i, i - 1)} style={{ paddingHorizontal: 4 }}>
                      <Text>Up</Text>
                    </TouchableOpacity>
                  )}
                  {i < stops.length - 1 && (
                    <TouchableOpacity onPress={() => moveStop(i, i + 1)} style={{ paddingHorizontal: 4 }}>
                      <Text>Down</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {stops.length < 2 && (
                <Text style={{ color: "#888", fontSize: 12, marginTop: 4 }}>
                  Add at least one more stop to calculate a route.
                </Text>
              )}
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
                    {new Date(routeResult.estimatedArrival).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </>
              )}
              {routeResult.departureInfo && routeResult.departureInfo.length > 0 && (
                <>
                  <Text style={styles.resultLabel}>Next departures:</Text>
                  {routeResult.departureInfo.map((d, i) => (
                    <Text key={`${d.stationName}-${i}`} style={styles.resultValue}>
                      {d.stationName}: {d.waitTimeMinutes} min ({d.nextDeparture})
                    </Text>
                  ))}
                </>
              )}
            </View>
          )}

          {routeSegments.some((s) => s.type === "failed") && (
            <View style={styles.resultBox}>
              <Text style={styles.resultLabel}>Some legs failed to calculate:</Text>
              {routeSegments.filter((s): s is FailedLeg => s.type === "failed").map((s, i) => (
                <Text key={`${s.from}-${s.to}-${i}`} style={styles.resultValue}>
                  No route: {s.from} to {s.to}
                </Text>
              ))}
            </View>
          )}

          <View style={styles.actionButtons}>
            <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={resetForm}>
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
    </KeyboardAvoidingView>
  );
};
