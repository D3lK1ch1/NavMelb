# Mobile Navigation App 

Combining best of Apple (traffic light configuration) and Google map features (path finding)
Can drive to station or which station has parking or else walking. Combination of driving + PTV for best route, knowing which station has parking. App has traffic lights established + lane to turn to.

Need-to-know: Due to using React Expo, making it a mobile navigation app, the code is tested purely through Android or IOS, unable to render the map in web.

# Getting Started

After either forking or cloning the repo, run `npm install` to install all dependencies.

At backend, run:

npm run dev

At frontend remember to install Expo Go on phone and scan the QR code to test the app and ensure the .env with the url is the same as from ipconfig for networking purposes, and then run:

npx expo start --lan

Need-to-know: remote error with gtfs folder because of large file size limit. If location search does not work due to large file size, add on your own from url: https://discover.data.vic.gov.au/dataset/gtfs-schedule

## Features:
* Combination of PTV with car / Uber as a route than either-or (Important) - Adding multiple stops for routing
> Ensuring that markers are added on screen rather than just coordinates (working)
> Ensuring that distance is also visualized between place on screen (working)
-------------------------------------
[Optional, once done]
* Making sure that stations have car parks for the car
* Lane tracking (Google Maps) with traffic light (Apple Maps)
* Walking paths to be less confusing because it is hard to know where to walk in shopping centres / uni campus

## Configurations
* Frontend (Mobile) = React Native - find one good for both Apple and Android
* Mapping SDK = OSM (using free versions) aka Leaflet too
* Backend = Node.js + Express (for route calc, data aggregation, parking and PTV API) + GraphQL
-------------------------------------
* Cloud Infrastructure = AWS / Google Cloud / Azure (host routing services, store user data, ML models) - check which one is free
* Database = PostgreSQL + PostGIS (Store map data, station info, parking metadata and custom routing logic)
* AI / ML = TensorFlow Lite(For indoor positioning, walking direction disambiguation) = how to combine TensorFlow to JS?

## Constraints
* Completely in TS/JS, for the web development portion of the works. Other languages must integrate well with JS in the case of databases.
* Followiing  Google Map and Apple Map samples aka Maps JavaScript API and Mapkit JS API respectively as base.

Tech stack is in work while the navigation app is iteratively integrated, as features are being implemented one by one. 

## Current Progress
Not necessarily satisfied with AI integration on the template for my definition to make a multi routing for car and PTV, ranging from problems with unclear button uses, unclear data information about stations, still from starting point and destination without input about station in between ex. Car -> Station -> Destination. Figuring out the problems, learning how to narrow down code to fix this one by one.