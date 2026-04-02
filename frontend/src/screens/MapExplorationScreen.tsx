import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import * as Location from "expo-location";
import { lookupDestination, searchStations, calculateRoute } from "../services/api";
import { ApiResponse, Coordinate, Waypoint, RouteSegment, RouteStrategy, RouteResult, TransportType } from "../types";
import MapComponent from "../components/MapComponent";
import { mapExplorationStyles as styles } from "../styles/mapExploration";

type StationSearchResult = { name: string; position: Coordinate; transportTypes: TransportType[]; displayName?: string; routeNames?: string[] };

// A single stop in the journey chain: A -> B -> C -> ...
type JourneyStop = {
  coord: Coordinate;
  name: string;
  type: "place" | "station";
};

// Label stops as A, B, C, D...
const stopLabel = (index: number) => String.fromCharCode(65 + index);

// Format current time as "HH:MM" for the departure time input default
function nowAsTimeString(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function transportIcon(types: TransportType[]): string {
  if (types.includes("train")) return "train";
  if (types.includes("tram")) return "tram";
  return "bus";
}

export const MapExplorationScreen: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [stops, setStops] = useState<JourneyStop[]>([]);
  const [departureTime, setDepartureTime] = useState<string>(nowAsTimeString());
  const [searchResults, setSearchResults] = useState<StationSearchResult[]>([]);
  const [strategy, setStrategy] = useState<RouteStrategy>("car");
  const [routeSegments, setRouteSegments] = useState<RouteSegment[]>([]);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(true);
  const [searchMode, setSearchMode] = useState<"place" | "station">("place");
  const [transportFilter] = useState<"tram" | "train" | "bus" | undefined>(undefined);
  const requestGenRef = useRef(0);

  const addStop = (coord: Coordinate, name: string, type: "place" | "station") => {
    setStops((prev) => [...prev, { coord, name, type }]);
  };

  const removeStop = (index: number) => {
    setStops((prev) => prev.filter((_, i) => i !== index));
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
      // Insert location at the front of the chain as the starting point
      setStops((prev) => [{ coord, name: "My Location", type: "place" }, ...prev]);
      setShowMap(true);
    } catch (err: any) {
      setError(err?.message || "Failed to get location");
    } finally {
      setLoading(false);
    }
  };

  const calculateRoutePreview = useCallback(async () => {
    if (stops.length < 2) return;

    // Increment generation — any in-flight request from a previous generation will be discarded
    const myGeneration = ++requestGenRef.current;

    setLoading(true);
    setError(null);
    setRouteResult(null);
    setRouteSegments([]);

    try {
      const origin = stops[0].coord;
      const destination = stops[stops.length - 1].coord;

      const stationStops = stops.filter((s) => s.type === "station");

      if (strategy === "ptv" && stationStops.length < 1) {
        if (requestGenRef.current === myGeneration) {
          setError("PTV routing requires at least one station stop, and then add a consecutive station for PTV routing.");
        }
        return;
      }

      const waypoints: Waypoint[] = stops.map((s) => ({
        position: s.coord,
        type: s.type,
        name: s.name,
      }));

      console.log("Waypoints being sent :" , JSON.stringify(waypoints.map(w=> ({name: w.name, type: w.type}))));

      const response: ApiResponse<RouteResult> = await calculateRoute(
        origin,
        destination,
        strategy,
        waypoints,
        departureTime
      );

      // Discard if a newer request has already started
      if (requestGenRef.current !== myGeneration) return;

      if (response.success && response.data) {
        setRouteResult(response.data);
        setRouteSegments(response.data.segments);
      } else {
        setError(response.error || "Route calculation failed");
      }
    } catch (err) {
      if (requestGenRef.current !== myGeneration) return;
      const message =
        (err as any)?.response?.data?.error ||
        (err as any)?.message ||
        "Route preview failed";
      setError(message);
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
    } catch (err: any) {
      setError(err.message || "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectStation = (station: StationSearchResult) => {
    addStop(station.position, station.name, "station");
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
    <View style={styles.container}>
      {showMap && (
        <View style={{ flex: 1 }}>
          <MapComponent
            markers={getMarkers()}
            routeSegments={routeSegments}
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

          {/* Strategy selector */}
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
          </View>

          <Text style={{ marginBottom: 8, color: "#666", fontSize: 12 }}>
            {strategy === "car" && "Driving route only"}
            {strategy === "ptv" && "Mix stations + places — station→station is PTV, everything else drives"}
          </Text>

          {/* Departure time input */}
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

          {/* Search mode toggle */}
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

          {/* Search bar */}
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

          {/* Station search results */}
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
                      ? `  ·  ${result.routeNames.slice(0, 3).join(" · ")}`
                      : ""}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          {/* Journey chain: A -> B -> C -> ... */}
          {stops.length > 0 && (
            <View style={styles.resultBox}>
              <Text style={styles.resultLabel}>Journey:</Text>
              {stops.map((stop, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "center", marginVertical: 2 }}>
                  <Text style={{ fontWeight: "bold", width: 24, color: "#333" }}>{stopLabel(i)}</Text>
                  <Text style={[styles.resultValue, { flex: 1 }]}>
                    {stop.type === "station" ? "Station: " : "Place: "}{stop.name}
                  </Text>
                  <TouchableOpacity onPress={() => removeStop(i)} style={{ paddingHorizontal: 6 }}>
                    <Text style={{ color: "red", fontSize: 14 }}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {stops.length < 2 && (
                <Text style={{ color: "#888", fontSize: 12, marginTop: 4 }}>
                  Add at least one more stop to calculate a route.
                </Text>
              )}
            </View>
          )}

          {/* Route result summary */}
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
                    <Text key={i} style={styles.resultValue}>
                      {d.stationName}: {d.waitTimeMinutes} min ({d.nextDeparture})
                    </Text>
                  ))}
                </>
              )}
            </View>
          )}

          {/* Actions */}
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
    </View>
  );
};
