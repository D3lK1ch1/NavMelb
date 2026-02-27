import React, { useState } from "react";
import {View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView} from "react-native";
import { lookupDestination, searchStations, calculateRoute } from "../services/api";
import { Coordinate, RouteSegment } from "../types";
import MapComponent from "../components/MapComponent";
import { mapExplorationStyles as styles } from "../styles/mapExploration";

type SearchMode = "destination" | "station";

export const MapExplorationScreen: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [startPoint, setStartPoint] = useState<Coordinate | null>(null);
  const [destination, setDestination] = useState<Coordinate | null>(null);
  const [stations, setStations] = useState<Coordinate[]>([]);
  const [stationNames, setStationNames] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<{name: string; position: Coordinate}[]>([]);
  const [searchMode, setSearchMode] = useState<SearchMode>("destination");
  const [routeSegments, setRouteSegments] = useState<RouteSegment[]>([]);
  const [routeType, setRouteType] = useState<"car" | "train">("car");
  const [distance, setDistance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(true);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setError("Please enter a search term");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      if (searchMode === "station") {
        const response = await searchStations(searchQuery);
        if (response.success && response.data && response.data.length > 0) {
          setSearchResults(response.data);
        } else {
          setError("No stations found");
        }
      } else {
        const response = await lookupDestination(searchQuery);
        if (response.success && response.data) {
          if (!startPoint) {
            setStartPoint({ ...response.data, name: searchQuery });
          } else if (!destination) {
            setDestination({ ...response.data, name: searchQuery });
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

  const handleSelectStation = (station: {name: string; position: Coordinate}) => {
    setStations([...stations, station.position]);
    setStationNames([...stationNames, station.name]);
    setSearchResults([]);
    setSearchQuery("");
  };

  const handleCalculateRoute = async () => {
    if (!startPoint || !destination) {
      setError("Please enter start point and destination");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await calculateRoute(startPoint, destination, routeType, stations);

      if (response.success && response.data) {
        setRouteSegments(response.data.segments);
        setDistance(response.data.totalDistance / 1000);
      } else {
        setError(response.error || "Failed to calculate route");
      }
    } catch (err: any) {
      setError(err.message || "Route calculation failed");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSearchQuery("");
    setStartPoint(null);
    setDestination(null);
    setStations([]);
    setStationNames([]);
    setSearchResults([]);
    setRouteSegments([]);
    setDistance(null);
    setError(null);
  };

  const getMarkers = () => {
    const result = [];
    if (startPoint) result.push({ lat: startPoint.lat, lng: startPoint.lng, label: startPoint.name || "Start" });
    if (destination) result.push({ lat: destination.lat, lng: destination.lng, label: destination.name || "Destination" });
    stations.forEach((s, i) => result.push({ lat: s.lat, lng: s.lng, label: stationNames[i] || `Station ${i + 1}` }));
    return result;
  };

  return (    
    <View style={styles.container}>
      {showMap && (
        <View style={{ flex: 1 }}>
          <MapComponent
            markers={getMarkers()}
            routeSegments={routeSegments}
          />
        </View>
      )}

      <View style={styles.controlPanel}>
        <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
        <Text style={styles.title}>Melbourne Navigation</Text>
        
        <View style={styles.routeTypeContainer}>
          <TouchableOpacity
            style={[styles.routeTypeButton, routeType === "car" && styles.routeTypeActive]}
            onPress={() => setRouteType("car")}
          >
            <Text style={styles.routeTypeText}>Car</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.routeTypeButton, routeType === "train" && styles.routeTypeActive]}
            onPress={() => setRouteType("train")}
          >
            <Text style={styles.routeTypeText}>Train</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchModeContainer}>
          <TouchableOpacity
            style={[styles.modeButton, searchMode === "destination" && styles.modeActive]}
            onPress={() => setSearchMode("destination")}
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
                <Text style={styles.resultText}>{result.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        {startPoint && (
          <View style={styles.resultBox}>
            <Text style={styles.resultLabel}>Start: {startPoint.name}</Text>
            <Text style={styles.resultValue}>
              {startPoint.lat.toFixed(4)}, {startPoint.lng.toFixed(4)}
            </Text>
          </View>
        )}

        {stationNames.length > 0 && (
          <View style={styles.resultBox}>
            <Text style={styles.resultLabel}>Via Stations:</Text>
            {stationNames.map((name, i) => (
              <Text key={i} style={styles.resultValue}>• {name}</Text>
            ))}
          </View>
        )}

        {destination && (
          <View style={styles.resultBox}>
            <Text style={styles.resultLabel}>Destination: {destination.name}</Text>
            <Text style={styles.resultValue}>
              {destination.lat.toFixed(4)}, {destination.lng.toFixed(4)}
            </Text>
          </View>
        )}

        {distance !== null && (
          <View style={[styles.resultBox, styles.distanceBox]}>
            <Text style={styles.resultLabel}>Distance:</Text>
            <Text style={styles.resultValue}>{distance.toFixed(2)} km</Text>
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
            style={[styles.button, styles.primaryButton]}
            onPress={handleCalculateRoute}
            disabled={!startPoint || !destination}
          >
            <Text style={styles.buttonText}>Calculate Route</Text>
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
