import React, { useState } from "react";
import {View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView} from "react-native";
import { lookupDestination, calculateDistance } from "../services/api";
import { Coordinate } from "../types";
import MapComponent from "../components/MapComponent";
import { mapExplorationStyles as styles } from "../styles/mapExploration";

export const MapExplorationScreen: React.FC = () => {
  const [destinationQuery, setDestinationQuery] = useState("");
  const [destination1, setDestination1] = useState<Coordinate | null>(null);
  const [destination2, setDestination2] = useState<Coordinate | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(true);

  const handlePlaceLookup = async () => {
    if (!destinationQuery.trim()) {
      setError("Please enter destination");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await lookupDestination(destinationQuery);

      if (response.success && response.data) {
        if (!destination1) {
          setDestination1({ ...response.data, name: destinationQuery });
          setDestinationQuery("");
        } else {
          const newDestination2 = { ...response.data, name: destinationQuery };
          setDestination2(newDestination2);
          setDestinationQuery("");
          if (destination1) {
            await calculateDistanceBetweenDestinations(destination1, newDestination2);
          }
        }
      } else {
        setError(response.error || "Destination not found");
      }
    } catch (err: any) {
      setError(err.message || "Failed to lookup place");
    } finally {
      setLoading(false);
    }
  };

  const calculateDistanceBetweenDestinations = async (
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


  const resetForm = () => {
    setDestinationQuery("");
    setDestination1(null);
    setDestination2(null);
    setDistance(null);
    setError(null);

  };

  return (    
    <View style={styles.container}>
      {showMap && (
        <View style={{ flex: 1 }}>
          <MapComponent
            markers={
              [
                destination1 && { lat: destination1.lat, lng: destination1.lng, label: destination1.name },
                destination2 && { lat: destination2.lat, lng: destination2.lng, label: destination2.name},
              ].filter(Boolean) as Array<{ lat: number; lng: number; label?: string }>
            } />
        </View>
      )}

      <View style={styles.controlPanel}>
        <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
        <Text style={styles.title}>Melbourne Navigation</Text>
        <Text style={styles.subtitle}>
          Search Destination
        </Text>

        <View style={styles.inputSection}>
          <TextInput
            style={styles.input}
            placeholder="Enter destination"
            value={destinationQuery}
            onChangeText={setDestinationQuery}
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

        {error && <Text style={styles.error}>{error}</Text>}

        {destination1 && (
          <View style={styles.resultBox}>
            <Text style={styles.resultLabel}>{destination1.name}</Text>
            <Text style={styles.resultValue}>
              Lat: {destination1.lat.toFixed(4)}, Lng: {destination1.lng.toFixed(4)}
            </Text>
          </View>
        )}

        {destination2 && (
          <View style={styles.resultBox}>
            <Text style={styles.resultLabel}>{destination2.name}</Text>
            <Text style={styles.resultValue}>
              Lat: {destination2.lat.toFixed(4)}, Lng: {destination2.lng.toFixed(4)}
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
