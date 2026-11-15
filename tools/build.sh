#!/bin/bash
# Сборка APK из корня проекта:  tools/build.sh
# Копирует сайт в app/www, синхронизирует Capacitor, собирает APK (JDK 21) и кладёт его в APK/Trener-vN.apk.
set -e
cd "$(dirname "$0")/.."
N=$(grep -m1 "const APP_VERSION" js/app.js | sed -E "s/.*'([0-9]+)\..*/\1/")
mkdir -p app/www APK
rsync -a --delete index.html privacypolicy.html css js fonts icons img app/www/
cd app && npx cap sync android
cd android
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ANDROID_HOME=~/Library/Android/sdk ./gradlew assembleDebug
cp app/build/outputs/apk/debug/app-debug.apk ../../APK/Trener-v$N.apk
echo "Готово: APK/Trener-v$N.apk"
