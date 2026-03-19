/**
 * Generates minimal GTFS fixture ZIPs for testing.
 * Run with: npx tsx src/__tests__/fixtures/build-gtfs.ts
 */
import AdmZip from "adm-zip";
import path from "path";

function buildTrainFixture(): void {
  const zip = new AdmZip();

  // 5 train stops — two "Flinders Street" entries ~50m apart to test proximity merging
  const stops = [
    "stop_id,stop_name,stop_lat,stop_lon",
    "S1,Flinders Street Station,-37.8183,144.9671",
    "S1b,Flinders Street Station,-37.8179,144.9675",
    "S2,Southern Cross Station,-37.8184,144.9525",
    "S3,Richmond Station,-37.8235,144.9898",
    "S4,Parliament Station,-37.8112,144.9731",
    "S5,Melbourne Central Station,-37.8100,144.9628",
  ].join("\n");

  const routes = [
    "route_id,route_short_name,route_long_name,route_type",
    "R1,Lilydale,Lilydale Line,2",
    "R2,Craigieburn,Craigieburn Line,2",
  ].join("\n");

  const trips = [
    "route_id,service_id,trip_id",
    "R1,WD,T1",
    "R1,WD,T2",
    "R2,WD,T3",
  ].join("\n");

  const stopTimes = [
    "trip_id,arrival_time,departure_time,stop_id,stop_sequence",
    // T1: Flinders St → Richmond → Parliament
    "T1,08:00:00,08:00:00,S1,1",
    "T1,08:10:00,08:11:00,S3,2",
    "T1,08:20:00,08:20:00,S4,3",
    // T2: Flinders St → Southern Cross → Melbourne Central
    "T2,09:00:00,09:00:00,S1,1",
    "T2,09:08:00,09:09:00,S2,2",
    "T2,09:18:00,09:18:00,S5,3",
    // T3: Southern Cross → Parliament → Richmond
    "T3,10:00:00,10:00:00,S2,1",
    "T3,10:12:00,10:13:00,S4,2",
    "T3,10:25:00,10:25:00,S3,3",
  ].join("\n");

  const calendar = [
    "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date",
    "WD,1,1,1,1,1,0,0,20240101,20261231",
  ].join("\n");

  zip.addFile("stops.txt", Buffer.from(stops));
  zip.addFile("routes.txt", Buffer.from(routes));
  zip.addFile("trips.txt", Buffer.from(trips));
  zip.addFile("stop_times.txt", Buffer.from(stopTimes));
  zip.addFile("calendar.txt", Buffer.from(calendar));

  const outPath = path.join(__dirname, "gtfs", "1", "google_transit.zip");
  zip.writeZip(outPath);
  console.log(`Wrote train fixture: ${outPath}`);
}

function buildTramFixture(): void {
  const zip = new AdmZip();

  const stops = [
    "stop_id,stop_name,stop_lat,stop_lon",
    "TS1,Federation Square/Flinders St,-37.8180,144.9690",
    "TS2,Melbourne University,-37.7963,144.9614",
    "TS3,St Kilda Rd/Arts Precinct,-37.8225,144.9690",
  ].join("\n");

  const routes = [
    "route_id,route_short_name,route_long_name,route_type",
    "TR1,1,Route 1 - South Melbourne Beach,0",
  ].join("\n");

  const trips = [
    "route_id,service_id,trip_id",
    "TR1,WD,TT1",
  ].join("\n");

  const stopTimes = [
    "trip_id,arrival_time,departure_time,stop_id,stop_sequence",
    "TT1,07:30:00,07:30:00,TS1,1",
    "TT1,07:45:00,07:46:00,TS2,2",
    "TT1,08:00:00,08:00:00,TS3,3",
  ].join("\n");

  const calendar = [
    "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date",
    "WD,1,1,1,1,1,0,0,20240101,20261231",
  ].join("\n");

  zip.addFile("stops.txt", Buffer.from(stops));
  zip.addFile("routes.txt", Buffer.from(routes));
  zip.addFile("trips.txt", Buffer.from(trips));
  zip.addFile("stop_times.txt", Buffer.from(stopTimes));
  zip.addFile("calendar.txt", Buffer.from(calendar));

  const outPath = path.join(__dirname, "gtfs", "3", "google_transit.zip");
  zip.writeZip(outPath);
  console.log(`Wrote tram fixture: ${outPath}`);
}

buildTrainFixture();
buildTramFixture();
