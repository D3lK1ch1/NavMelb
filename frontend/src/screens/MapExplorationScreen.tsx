import React, { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { MapComponent } from "../components/MapComponent";
import { lookupPlace, calculateDistance } from "../services/api";
import { Coordinate } from "../types";

/**
 * MapExplorationScreen
 * 
 * Phase 1a Feature: Map Foundation
 * Displays interactive Melbourne map with:
 * - Traffic light markers (bounds-filtered)
 * - Place search functionality
 * - Distance calculation between two locations
 * 
 * Features:
 * - Real-time map interaction (zoom, pan, rotate)
 * - Place lookup via backend API
 * - Distance calculation in kilometers
 * - Loading states and error handling
 * - Debug information panel
 */
export const MapExplorationScreen: React.FC = () => {
  const [placeQuery, setPlaceQuery] = useState("");
  const [place1, setPlace1] = useState<Coordinate | null>(null);
  const [place2, setPlace2] = useState<Coordinate | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(true);

  /**
   * Handle place lookup
   * Searches for place and stores coordinate
   * On second place search, auto-calculates distance
   */
  const handlePlaceLookup = async () => {
    if (!placeQuery.trim()) {
      setError("Please enter a place name");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await lookupPlace(placeQuery);

      if (response.success && response.data) {
        if (!place1) {
          setPlace1(response.data);
          setPlaceQuery("");
        } else {
          setPlace2(response.data);
          setPlaceQuery("");
          // Calculate distance if both places are set
          if (place1) {
            await calculateDistanceBetweenPlaces(place1, response.data);
          }
        }
      } else {
        setError(response.error || "Place not found");
      }
    } catch (err: any) {
      setError(err.message || "Failed to lookup place");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Calculate distance between two places
   * Uses Haversine formula via backend API
   */
  const calculateDistanceBetweenPlaces = async (
    from: Coordinate,
    to: Coordinate
  ) => {
    try {
      setLoading(true);
      const response = await calculateDistance(from, to);

      if (response.success && response.data) {
        setDistance(response.data.distanceKm);
      }
    } catch (err: any) {
      setError(err.message || "Failed to calculate distance");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Reset all searches
   */
  const resetForm = () => {
    setPlace1(null);
    setPlace2(null);
    setDistance(null);
    setPlaceQuery("");
    setError(null);
  };

  return (
    <View style={styles.container}>
      {/* Map Section - Interactive Melbourne map */}
      {showMap && <MapComponent showTrafficLights={true} />}

      {/* Control Panel - Place search and results */}
      <View style={styles.controlPanel}>
        <Text style={styles.title}>Map Exploration</Text>
        <Text style={styles.subtitle}>
          Traffic lights • Place search • Distance calculator
        </Text>

        {/* Place Input */}
        <View style={styles.inputSection}>
          <TextInput
            style={styles.input}
            placeholder="Enter place name (e.g., Southern Cross)"
            value={placeQuery}
            onChangeText={setPlaceQuery}
            editable={!loading}
          />
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handlePlaceLookup}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Search</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Results */}
        {error && <Text style={styles.error}>{error}</Text>}

        {place1 && (
          <View style={styles.resultBox}>
            <Text style={styles.resultLabel}>Place 1:</Text>
            <Text style={styles.resultValue}>
              Lat: {place1.lat.toFixed(4)}, Lng: {place1.lng.toFixed(4)}
            </Text>
          </View>
        )}

        {place2 && (
          <View style={styles.resultBox}>
            <Text style={styles.resultLabel}>Place 2:</Text>
            <Text style={styles.resultValue}>
              Lat: {place2.lat.toFixed(4)}, Lng: {place2.lng.toFixed(4)}
            </Text>
          </View>
        )}

        {distance !== null && (
          <View style={[styles.resultBox, styles.distanceBox]}>
            <Text style={styles.resultLabel}>Distance:</Text>
            <Text style={styles.resultValue}>{distance.toFixed(2)} km</Text>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={resetForm}
          >
            <Text style={styles.buttonText}>Reset</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={() => setShowMap(!showMap)}
          >
            <Text style={styles.buttonText}>
              {showMap ? "Hide" : "Show"} Map
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.helpText}>
          Try: &quot;Southern Cross&quot;, &quot;Parliament&quot;, &quot;Flinders Street&quot;
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  controlPanel: {
    backgroundColor: "#fff",
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
    maxHeight: "50%",
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 5,
    color: "#000",
  },
  subtitle: {
    fontSize: 12,
    color: "#666",
    marginBottom: 15,
  },
  inputSection: {
    flexDirection: "row",
    marginBottom: 15,
    gap: 10,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  button: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonDisabled: {
    backgroundColor: "#ccc",
  },
  secondaryButton: {
    backgroundColor: "#666",
    flex: 1,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  resultBox: {
    backgroundColor: "#f9f9f9",
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: "#007AFF",
  },
  distanceBox: {
    borderLeftColor: "#34C759",
    backgroundColor: "#f0fdf4",
  },
  resultLabel: {
    fontSize: 12,
    color: "#666",
    fontWeight: "600",
  },
  resultValue: {
    fontSize: 14,
    color: "#000",
    marginTop: 5,
    fontFamily: "monospace",
  },
  actionButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 15,
  },
  error: {
    color: "#FF3B30",
    fontSize: 12,
    marginBottom: 10,
    backgroundColor: "#ffebee",
    padding: 10,
    borderRadius: 6,
  },
  helpText: {
    fontSize: 11,
    color: "#999",
    marginTop: 10,
    fontStyle: "italic",
  },
});
