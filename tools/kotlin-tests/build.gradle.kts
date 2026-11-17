// Runs the app's pure Kotlin files (no Android types) and their unit tests on a plain JVM, so they can be run
// without the Android SDK. CI still runs the full Android unit tests.
plugins { kotlin("jvm") version "2.0.21" }
repositories { mavenCentral() }
dependencies { testImplementation("junit:junit:4.13.2") }
