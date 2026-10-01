plugins {
    id("com.android.application")
}

// Signing comes from the environment: CI decodes the keystore secret, a local build sources it
// from outside the repo. Without it, only the debug build works.
val keystoreFile: String? = System.getenv("LIRE_KEYSTORE_FILE")

android {
    namespace = "tech.krebs.lire"
    compileSdk = 36

    defaultConfig {
        applicationId = "tech.krebs.lire"
        minSdk = 21
        targetSdk = 35
        // Every update must raise it, so CI passes its run number.
        versionCode = System.getenv("LIRE_VERSION_CODE")?.toInt() ?: 1
        versionName = System.getenv("LIRE_VERSION_NAME") ?: "dev"
    }

    signingConfigs {
        if (keystoreFile != null) {
            create("release") {
                storeFile = file(keystoreFile)
                storePassword = System.getenv("LIRE_KEYSTORE_PASSWORD")
                keyAlias = "lire"
                keyPassword = System.getenv("LIRE_KEYSTORE_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (keystoreFile != null) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.7.3")
}
