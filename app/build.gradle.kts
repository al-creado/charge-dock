plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "app.chargedock"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.chargedock"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    // The dock page lives in ../web and is copied into the app's assets at build time.
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/web"))
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.webkit:webkit:1.12.1")
    testImplementation("junit:junit:4.13.2")
}

val syncWebAssets by tasks.registering(Sync::class) {
    from(rootProject.file("web")) { exclude("test/**", "node_modules/**") }
    into(layout.buildDirectory.dir("generated/web"))
}
tasks.named("preBuild") { dependsOn(syncWebAssets) }
