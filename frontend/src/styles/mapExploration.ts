import { StyleSheet } from 'react-native';

export const mapExplorationStyles = StyleSheet.create({
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
  routeTypeContainer: {
    flexDirection: "row",
    marginBottom: 15,
    gap: 10,
  },
  routeTypeButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
    backgroundColor: "#e0e0e0",
    alignItems: "center",
  },
  routeTypeActive: {
    backgroundColor: "#007AFF",
  },
  routeTypeText: {
    fontWeight: "600",
    fontSize: 14,
  },
  searchModeContainer: {
    flexDirection: "row",
    marginBottom: 15,
    gap: 10,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 6,
    backgroundColor: "#f0f0f0",
    alignItems: "center",
  },
  modeActive: {
    backgroundColor: "#34C759",
  },
  modeText: {
    fontSize: 13,
    fontWeight: "500",
  },
  resultsContainer: {
    backgroundColor: "#fff",
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    overflow: "hidden",
    maxHeight: 200,
  },
  resultItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  resultText: {
    fontSize: 14,
    color: "#000",
  },
  primaryButton: {
    backgroundColor: "#34C759",
    flex: 1,
  },
});
