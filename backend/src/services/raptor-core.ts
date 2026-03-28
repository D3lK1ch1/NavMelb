import { StreamStop, StreamStopTime, StreamTrip } from "./gtfs-stream.service";

export interface RaptorStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface RaptorStopTime {
  stopId: string;
  arrivalTime: number;
  departureTime: number;
  stopSequence: number;
}

export interface RaptorTrip {
  id: string;
  routeId: string;
  stopTimes: RaptorStopTime[];
}

export interface RaptorJourneyLeg {
  trip: RaptorTrip;
  fromStopId: string;
  toStopId: string;
  fromTime: number;
  toTime: number;
  fromStopName: string;
  toStopName: string;
}

export interface RaptorJourney {
  legs: RaptorJourneyLeg[];
  departureTime: number;
  arrivalTime: number;
  durationMinutes: number;
}

export class RaptorCore {
  private stopIdToIdx: Map<string, number> = new Map();
  private stops: RaptorStop[] = [];
  private stopNormalizedNames: string[] = [];
  private trips: RaptorTrip[] = [];
  private tripIdxToId: Map<number, string> = new Map();
  private stopIdxToTripIdxs: Map<number, Set<number>> = new Map();

  initialize(
    stops: StreamStop[],
    trips: StreamTrip[],
    stopTimes: StreamStopTime[]
  ): void {
    console.log(`[RaptorCore] Initializing with ${stops.length} stops, ${trips.length} trips, ${stopTimes.length} stop_times`);

    this.stopIdToIdx.clear();
    this.stops = [];
    this.stopNormalizedNames = [];
    this.trips = [];
    this.tripIdxToId.clear();
    this.stopIdxToTripIdxs.clear();

    const stopIdToTrips = new Map<string, string[]>();
    const tripIdToStopTimes = new Map<string, StreamStopTime[]>();

    for (const stop of stops) {
      const idx = this.stops.length;
      this.stopIdToIdx.set(stop.stop_id, idx);
      this.stops.push({
        id: stop.stop_id,
        name: stop.stop_name,
        lat: stop.stop_lat,
        lng: stop.stop_lon,
      });
      this.stopNormalizedNames.push(this.normalizeStopName(stop.stop_name));
      stopIdToTrips.set(stop.stop_id, []);
    }

    for (const st of stopTimes) {
      if (!tripIdToStopTimes.has(st.trip_id)) {
        tripIdToStopTimes.set(st.trip_id, []);
      }
      tripIdToStopTimes.get(st.trip_id)!.push(st);

      const tripList = stopIdToTrips.get(st.stop_id);
      if (tripList && !tripList.includes(st.trip_id)) {
        tripList.push(st.trip_id);
      }
    }

    for (const trip of trips) {
      const idx = this.trips.length;
      this.tripIdxToId.set(idx, trip.trip_id);

      const rawStopTimes = tripIdToStopTimes.get(trip.trip_id) || [];
      const sorted = [...rawStopTimes].sort(
        (a, b) => a.stop_sequence - b.stop_sequence
      );

      const raptorStopTimes: RaptorStopTime[] = sorted.map((st) => ({
        stopId: st.stop_id,
        arrivalTime: this.parseTime(st.arrival_time),
        departureTime: this.parseTime(st.departure_time),
        stopSequence: st.stop_sequence,
      }));

      this.trips.push({
        id: trip.trip_id,
        routeId: trip.route_id,
        stopTimes: raptorStopTimes,
      });

      for (const st of raptorStopTimes) {
        const stopIdx = this.stopIdToIdx.get(st.stopId);
        if (stopIdx !== undefined) {
          if (!this.stopIdxToTripIdxs.has(stopIdx)) {
            this.stopIdxToTripIdxs.set(stopIdx, new Set());
          }
          this.stopIdxToTripIdxs.get(stopIdx)!.add(idx);
        }
      }
    }

    console.log(`[RaptorCore] Built index: ${this.stopIdxToTripIdxs.size} stops with trips`);
  }

  private parseTime(time: string): number {
    if (!time || time.length < 5) return 0;
    const parts = time.split(":").map(Number);
    const h = isNaN(parts[0]) ? 0 : parts[0];
    const m = isNaN(parts[1]) ? 0 : parts[1];
    const s = isNaN(parts[2]) ? 0 : parts[2];
    return h * 3600 + m * 60 + s;
  }

  getStopIdx(stopId: string): number | undefined {
    return this.stopIdToIdx.get(stopId);
  }

  getStop(stopId: string): RaptorStop | undefined {
    const idx = this.stopIdToIdx.get(stopId);
    return idx !== undefined ? this.stops[idx] : undefined;
  }

  getStopByIdx(idx: number): RaptorStop | undefined {
    return this.stops[idx];
  }

  private normalizeStopName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ")
      .replace(/\bstation\b/g, "")
      .replace(/\brailway\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Find a stop by normalized name. Prefers stops that have actual trips
   * (i.e. platform stops) over parent station nodes that have no trips.
   */
  findStopByName(normalizedQuery: string): RaptorStop | undefined {
    // Pass 0: exact name match with trips — highest confidence.
    for (let idx = 0; idx < this.stops.length; idx++) {
      if (this.stopNormalizedNames[idx] === normalizedQuery) {
        if (this.stopIdxToTripIdxs.has(idx)) {
          return this.stops[idx];
        }
      }
    }
    // Pass 1: partial match with trips.
    for (let idx = 0; idx < this.stops.length; idx++) {
      if (this.stopNormalizedNames[idx].includes(normalizedQuery)) {
        if (this.stopIdxToTripIdxs.has(idx)) {
          return this.stops[idx];
        }
      }
    }
    // Pass 2: exact match with no trips (edge case).
    for (let idx = 0; idx < this.stops.length; idx++) {
      if (this.stopNormalizedNames[idx] === normalizedQuery) {
        return this.stops[idx];
      }
    }
    // Pass 3: any partial match.
    for (let idx = 0; idx < this.stops.length; idx++) {
      if (this.stopNormalizedNames[idx].includes(normalizedQuery)) {
        return this.stops[idx];
      }
    }
    return undefined;
  }

  query(
    fromStopId: string,
    toStopId: string,
    departureTime: number = 9 * 3600
  ): RaptorJourney | null {
    const fromIdx = this.stopIdToIdx.get(fromStopId);
    const toIdx = this.stopIdToIdx.get(toStopId);

    if (fromIdx === undefined || toIdx === undefined) {
      console.log(`[RaptorCore] Stop not found: ${fromStopId} or ${toStopId}`);
      return null;
    }

    console.log(`[RaptorCore] Query: ${fromStopId} (idx ${fromIdx}) -> ${toStopId} (idx ${toIdx}) at ${Math.floor(departureTime / 60)}m`);

    const directJourney = this.findDirectTrip(fromIdx, toIdx, departureTime);
    if (directJourney) {
      console.log(`[RaptorCore] Found direct trip: ${directJourney.durationMinutes} mins`);
      return directJourney;
    }

    const transferJourney = this.findTransferJourney(fromIdx, toIdx, departureTime);
    if (transferJourney) {
      console.log(`[RaptorCore] Found transfer journey: ${transferJourney.durationMinutes} mins`);
      return transferJourney;
    }

    console.log(`[RaptorCore] No journey found`);
    return null;
  }

  private findDirectTrip(fromIdx: number, toIdx: number, departureTime: number): RaptorJourney | null {
    const tripIdxs = this.stopIdxToTripIdxs.get(fromIdx);
    if (!tripIdxs) return null;

    for (const tripIdx of tripIdxs) {
      const trip = this.trips[tripIdx];
      const fromStIdx = trip.stopTimes.findIndex((st) => {
        const idx = this.stopIdToIdx.get(st.stopId);
        return idx === fromIdx;
      });
      const toStIdx = trip.stopTimes.findIndex((st) => {
        const idx = this.stopIdToIdx.get(st.stopId);
        return idx === toIdx;
      });

      if (fromStIdx !== -1 && toStIdx !== -1 && fromStIdx < toStIdx) {
        const fromSt = trip.stopTimes[fromStIdx];
        if (fromSt.departureTime >= departureTime) {
          const toSt = trip.stopTimes[toStIdx];
          const durationMins = Math.round((toSt.arrivalTime - fromSt.departureTime) / 60);

          return {
            legs: [
              {
                trip,
                fromStopId: fromSt.stopId,
                toStopId: toSt.stopId,
                fromTime: fromSt.departureTime,
                toTime: toSt.arrivalTime,
                fromStopName: this.getStopByIdx(fromIdx)?.name || fromSt.stopId,
                toStopName: this.getStopByIdx(toIdx)?.name || toSt.stopId,
              },
            ],
            departureTime: fromSt.departureTime,
            arrivalTime: toSt.arrivalTime,
            durationMinutes: Math.max(1, durationMins),
          };
        }
      }
    }

    return null;
  }

  private findTransferJourney(fromIdx: number, toIdx: number, departureTime: number): RaptorJourney | null {
    const fromTripIdxs = this.stopIdxToTripIdxs.get(fromIdx);
    if (!fromTripIdxs) return null;

    const fromStop = this.stops[fromIdx];
    const toStop = this.stops[toIdx];
    const deadline = Date.now() + 800;

    for (const trip1Idx of fromTripIdxs) {
      if (Date.now() > deadline) {
        console.log("[RaptorCore] Transfer search deadline exceeded, deferring to timetable fallback");
        return null;
      }
      const trip1 = this.trips[trip1Idx];
      const fromStIdx = trip1.stopTimes.findIndex((st) => {
        const idx = this.stopIdToIdx.get(st.stopId);
        return idx === fromIdx;
      });

      if (fromStIdx === -1) continue;
      const fromSt = trip1.stopTimes[fromStIdx];
      if (fromSt.departureTime < departureTime) continue;

      for (let i = fromStIdx + 1; i < trip1.stopTimes.length; i++) {
        const transferSt = trip1.stopTimes[i];
        const transferIdx = this.stopIdToIdx.get(transferSt.stopId);
        if (transferIdx === undefined) continue;
        if (transferIdx === fromIdx) continue;

        const transferTripIdxs = this.stopIdxToTripIdxs.get(transferIdx);
        if (!transferTripIdxs) continue;

        for (const trip2Idx of transferTripIdxs) {
          if (trip2Idx === trip1Idx) continue;

          const trip2 = this.trips[trip2Idx];
          const transferStIdx2 = trip2.stopTimes.findIndex((st) => st.stopId === transferSt.stopId);
          if (transferStIdx2 === -1) continue;

          const toStIdx2 = trip2.stopTimes.findIndex((st) => {
            const idx = this.stopIdToIdx.get(st.stopId);
            return idx === toIdx;
          });

          if (toStIdx2 !== -1 && transferStIdx2 < toStIdx2) {
            const transferFromSt = trip2.stopTimes[transferStIdx2];
            const toSt2 = trip2.stopTimes[toStIdx2];

            if (transferFromSt.departureTime >= transferSt.arrivalTime + 120) {
              const durationMins = Math.round(
                (toSt2.arrivalTime - fromSt.departureTime) / 60
              );

              const leg1FromStop = this.stops[fromIdx];
              const leg1TransferStop = this.stops[transferIdx];
              const leg2TransferStop = this.stops[transferIdx];
              const leg2ToStop = this.stops[toIdx];

              return {
                legs: [
                  {
                    trip: trip1,
                    fromStopId: fromSt.stopId,
                    toStopId: transferSt.stopId,
                    fromTime: fromSt.departureTime,
                    toTime: transferSt.arrivalTime,
                    fromStopName: leg1FromStop?.name || fromSt.stopId,
                    toStopName: leg1TransferStop?.name || transferSt.stopId,
                  },
                  {
                    trip: trip2,
                    fromStopId: transferSt.stopId,
                    toStopId: toSt2.stopId,
                    fromTime: transferFromSt.departureTime,
                    toTime: toSt2.arrivalTime,
                    fromStopName: leg2TransferStop?.name || transferSt.stopId,
                    toStopName: leg2ToStop?.name || toSt2.stopId,
                  },
                ],
                departureTime: fromSt.departureTime,
                arrivalTime: toSt2.arrivalTime,
                durationMinutes: Math.max(1, durationMins),
              };
            }
          }
        }
      }
    }

    return null;
  }

  getStats(): { stops: number; trips: number; loaded: boolean } {
    return {
      stops: this.stops.length,
      trips: this.trips.length,
      loaded: this.stops.length > 0,
    };
  }
}
