# Mobile Navigation App 

Combining best of Apple (traffic light configuration) and Google map features (path finding)
Can drive to station or which station has parking or else walking. Combination of driving + PTV for best route, knowing which station has parking. App has traffic lights established + lane to turn to.

Need-to-know: Due to using React Expo, making it a mobile navigation app, the code is tested purely through Android or IOS, unable to render the map in web.

# Getting Started

After either forking or cloning the repo, run `npm install` to install all dependencies.

At backend, run:

npm run dev

At frontend remember to install Expo Go on phone and scan the QR code to test the app, then run:

npx expo start --lan

**Every time before testing on a physical device**, check your machine's current local IP — DHCP can reassign it between sessions:

```
ipconfig | findstr "IPv4"
```

Update `frontend/.env` with the result:

```
EXPO_PUBLIC_API_BASE_URL=http://<YOUR_CURRENT_IP>:3000/api/map
```

If you skip this step and the IP has changed, all API calls from the app will silently time out after 10 seconds — the backend will appear healthy but the phone cannot reach it.

Need-to-know: remote error with gtfs folder because of large file size limit. If location search does not work due to large file size, add on your own from url: https://discover.data.vic.gov.au/dataset/gtfs-schedule

## Features:
* Combination of PTV with car / Uber as a route than either-or aka Multi-modal routing(Important) > Adding multiple stops for routing (Done with waypoint chaining)
> Ensuring that markers are added on screen rather than just coordinates (Both worked)
> Ensuring that distance is also visualized between place on screen (worked)
 * Real GTFS travel times with actual departure times from timetable (fixed)
 * Station filtering by searching transport types (stated when searched)
 * Multi - destination (searching more than two places between start and destination)

-------------------------------------
[Optional, once done]
* Making sure that stations have car parks for the car
* Lane tracking (Google Maps) with traffic light (Apple Maps)
* Walking paths to be less confusing because it is hard to know where to walk in shopping centres / uni campus

## Configurations
* Frontend (Mobile) = React Native - find one good for both Apple and Android
* Mapping SDK = OSM (using free versions) aka Leaflet too
* Backend = Node.js + Express (for route calc, data aggregation, parking and ~~PTV API~~ GTFS (PTV) + Raptor [for real time PTV routing instead of fallback straight line])


## Constraints
* Completely in TS/JS, for the web development portion of the works. Other languages must integrate well with JS in the case of databases.
* Followiing  Google Map and Apple Map samples aka Maps JavaScript API and Mapkit JS API respectively as base.
* Using GTFS + Raptor (Round-bAsed Public Transmit Optimized Router - algorithm behind Google Maps' transmit directions) instead of PTV API, to test routing algorithm over production mode for now.

Tech stack is in work while the navigation app is iteratively integrated, as features are being implemented one by one.
