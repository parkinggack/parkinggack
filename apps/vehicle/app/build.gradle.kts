import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.paparazzi)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "com.parkinggack.app"
    compileSdk = 35

    // AAOS 표준 Car API (CarPropertyManager, CarUxRestrictionsManager)
    useLibrary("android.car")

    defaultConfig {
        applicationId = "com.parkinggack.app"
        minSdk = 28 // Pleos 필수 요건 (서명 키 로테이션)
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // 폰 앱 주소 (C-07 QR, 폰 연결 QR). 배포: Vercel 프로젝트 parkinggack
        val webBaseUrl = (project.findProperty("webBaseUrl") as String?) ?: "https://parkinggack.vercel.app"
        buildConfigField("String", "WEB_BASE_URL", "\"$webBaseUrl\"")
        // 첫 실행 때 예시 기록(심사·시연용, session/DemoSeed) 넣기. 끄려면 -PdemoSeed=false
        val demoSeed = (project.findProperty("demoSeed") as String?)?.toBooleanStrictOrNull() ?: true
        buildConfigField("boolean", "DEMO_SEED", "$demoSeed")
    }

    // release 서명 — apps/vehicle/keystore.properties (gitignore, 형식은 keystore.properties.example).
    // 없으면 서명 안 된 app-release-unsigned.apk 가 나온다. v2·v3 서명 (Pleos 요건: minSdk 28 = 키 로테이션)
    val keystoreProps = rootProject.file("keystore.properties").takeIf { it.exists() }
        ?.let { f -> Properties().apply { f.inputStream().use { load(it) } } }
    signingConfigs {
        if (keystoreProps != null) create("release") {
            storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
            storePassword = keystoreProps.getProperty("storePassword")
            keyAlias = keystoreProps.getProperty("keyAlias")
            keyPassword = keystoreProps.getProperty("keyPassword")
            enableV2Signing = true
            enableV3Signing = true
        }
    }

    // 서버 주소 (apps/server). 기본 = 배포 서버 (Vercel Functions, 서울 icn1) https://parkinggack-api.vercel.app
    //   PC에서 띄운 로컬 서버(npm run dev)를 쓰려면: ./gradlew assembleDebug -PapiBaseUrl=http://10.0.2.2:8787
    val apiOverride = project.findProperty("apiBaseUrl") as String?
    buildTypes {
        debug {
            buildConfigField("String", "API_BASE_URL", "\"${apiOverride ?: "https://parkinggack-api.vercel.app"}\"")
        }
        release {
            buildConfigField("String", "API_BASE_URL", "\"${apiOverride ?: "https://parkinggack-api.vercel.app"}\"")
            signingConfig = signingConfigs.findByName("release")
            // 코드 축소 끔 — 켜면 Pleos SDK 쪽 코드가 지워져 release에서만 죽을 수 있다
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { compose = true; buildConfig = true }
    packaging { resources { excludes += "/META-INF/{AL2.0,LGPL2.1}" } }
}

dependencies {
    // Pleos SDK — 아이디어 확정 후 안 쓰는 건 지울 것
    implementation(libs.pleos.vehicle)
    implementation(libs.pleos.navihelper)
    implementation(libs.pleos.fusedlocation)
    implementation(libs.pleos.stt)
    implementation(libs.pleos.tts)

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.zxing.core) // C-07 QR 생성
    implementation(libs.osmdroid) // C-04·C-02 주행 중 지도 (CARTO Dark 타일)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    debugImplementation(libs.androidx.ui.tooling)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.okhttp.mockwebserver)
}

// 화면 스냅숏 → docs/screenshots/vehicle (Paparazzi, 에뮬레이터 불필요). docs/screenshots/README.md 참고.
// `./gradlew exportScreenshots` = recordPaparazziDebug 후 파일 이름에서 클래스 접두사를 떼어 복사.
// 평소 testDebugUnitTest는 렌더만 하고 비교하지 않는다 (verifyPaparazziDebug는 쓰지 않음, 골든은 gitignore).
val exportScreenshots by tasks.registering(Sync::class) {
    group = "verification"
    description = "Render every car screen with Paparazzi and copy the PNGs to docs/screenshots/vehicle"
    dependsOn("recordPaparazziDebug")
    from(layout.projectDirectory.dir("src/test/snapshots/images"))
    // 시안 크기(1280×720) 스냅숏 + Pleos 에뮬레이터 창 크기(1682×1210) 스냅숏 pleos_*
    include("com.parkinggack.app.ui_ScreenshotTest_*.png", "com.parkinggack.app.ui_PleosPanelScreenshotTest_*.png")
    rename { it.removePrefix("com.parkinggack.app.ui_ScreenshotTest_").removePrefix("com.parkinggack.app.ui_PleosPanelScreenshotTest_") }
    into(rootProject.layout.projectDirectory.dir("../../docs/screenshots/vehicle"))
}
