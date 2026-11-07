# fm/dm — JUCE plugin (VST3, AU, standalone).
#   cmake -B build -G Xcode        (or: cmake -B build -DCMAKE_BUILD_TYPE=Release)
#   cmake --build build --config Release
# JUCE is fetched on first configure; pass -DJUCE_DIR=/path/to/JUCE to use a local copy.
cmake_minimum_required(VERSION 3.22)
project(FMDM VERSION 0.1.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_OSX_DEPLOYMENT_TARGET "10.13" CACHE STRING "")
if(APPLE AND NOT CMAKE_OSX_ARCHITECTURES)
  set(CMAKE_OSX_ARCHITECTURES "arm64;x86_64" CACHE STRING "" FORCE)
endif()

if(JUCE_DIR)
  add_subdirectory(${JUCE_DIR} juce)
else()
  include(FetchContent)
  FetchContent_Declare(juce GIT_REPOSITORY https://github.com/juce-framework/JUCE.git GIT_TAG 8.0.4 GIT_SHALLOW TRUE)
  FetchContent_MakeAvailable(juce)
endif()

juce_add_plugin(FMDM
  COMPANY_NAME "johnnyhawk"
  BUNDLE_ID "com.johnnyhawk.fmdm"
  PLUGIN_MANUFACTURER_CODE Jhwk
  PLUGIN_CODE Fmdm
  PRODUCT_NAME "fm-dm"
  IS_SYNTH TRUE
  NEEDS_MIDI_INPUT TRUE
  NEEDS_MIDI_OUTPUT FALSE
  IS_MIDI_EFFECT FALSE
  EDITOR_WANTS_KEYBOARD_FOCUS FALSE
  COPY_PLUGIN_AFTER_BUILD TRUE
  VST3_CATEGORIES Instrument Drum
  AU_MAIN_TYPE kAudioUnitType_MusicDevice
  FORMATS VST3 AU Standalone)

file(GLOB PRESET_FILES ${CMAKE_CURRENT_SOURCE_DIR}/../presets/*.json)
file(GLOB IR_FILES ${CMAKE_CURRENT_SOURCE_DIR}/../src/static/ir/*.flac)
juce_add_binary_data(FMDMData SOURCES
  ${PRESET_FILES}
  ${IR_FILES}
  resources/VT323-Regular.ttf)

target_sources(FMDM PRIVATE
  engine/Voice.cpp
  engine/Engine.cpp
  engine/Sequencer.cpp
  src/IRs.cpp
  src/Model.cpp
  src/PluginProcessor.cpp
  src/PluginEditor.cpp
  src/Widgets.cpp)
target_include_directories(FMDM PRIVATE engine src)

target_compile_definitions(FMDM PUBLIC
  JUCE_WEB_BROWSER=0
  JUCE_USE_CURL=0
  JUCE_VST3_CAN_REPLACE_VST2=0
  JUCE_DISPLAY_SPLASH_SCREEN=0)

target_link_libraries(FMDM
  PRIVATE FMDMData juce::juce_audio_utils juce::juce_audio_formats juce::juce_dsp
  PUBLIC juce::juce_recommended_config_flags juce::juce_recommended_lto_flags)

# engine render check against the JS engine (no JUCE): node plugin/test/compare.mjs <dir>
add_executable(fmdm_render test/render.cpp engine/Voice.cpp engine/Engine.cpp engine/Sequencer.cpp)
target_include_directories(fmdm_render PRIVATE engine)
