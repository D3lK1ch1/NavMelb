# Mobile Navigation App 

Combining best of Apple (traffic light configuration) and Google map features (path finding)
Can drive to station or which station has parking or else walking. Combination of driving + PTV for best route, knowing which station has parking. App has traffic lights established + lane to turn to.

## Features:
* Lane tracking (Google Maps) with traffic light (Apple Maps)
* Combination of PTV with car / Uber as a route than either-or
* Making sure that stations have car parks for the car
* Walking paths to be less confusing because it is hard to know where to walk in shopping centres / uni campus

## Configurations
* Frontend (Mobile) = React Native - find one good for both Apple and Android
* Mapping SDK = OSM (using free versions)
* Backend = Node.js + Express (for route calc, data aggregation, parking and PTV API) + GraphQL
* Cloud Infrastructure = AWS / Google Cloud / Azure (host routing services, store user data, ML models) - check which one is free
* Database = PostgreSQL + PostGIS (Store map data, station info, parking metadata and custom routing logic)
* AI / ML = TensorFlow Lite(For indoor positioning, walking direction disambiguation) = how to combine TensorFlow to JS?

## Constraints
* Completely in JS, for the web development portion of the works. Other languages must integrate well with JS in the case of databases.
* Followiing  Google Map and Apple Map samples aka Maps JavaScript API and Mapkit JS API respectively as base.


Phases and tests loosely followed, while tech stack is at work as long as features are implemented. Feedback appreciated.