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

# The editor is the browser version's page, and the engine's parameter layout comes from its params.js:
# both are regenerated from ../src on every configure (and the configure re-runs when ../src changes),
# so a build always matches the latest prototype. Needs Node.
find_program(NODE node REQUIRED)
set(REPO ${CMAKE_CURRENT_SOURCE_DIR}/..)
file(GLOB_RECURSE PROTO_SRC CONFIGURE_DEPENDS ${REPO}/src/*.js ${REPO}/src/*.css ${REPO}/src/*.html ${REPO}/presets/*.json ${REPO}/build.mjs)
execute_process(COMMAND ${NODE} build.mjs WORKING_DIRECTORY ${REPO} RESULT_VARIABLE R1)
execute_process(COMMAND ${NODE} tools/gen-cpp-params.mjs WORKING_DIRECTORY ${REPO} RESULT_VARIABLE R2)
# the page for the web view, as plain ASCII (some web views read served pages as Latin-1)
execute_process(COMMAND ${NODE} plugin/tools/ascii-page.mjs dist/index.html ${CMAKE_CURRENT_BINARY_DIR}/page/index.html WORKING_DIRECTORY ${REPO} RESULT_VARIABLE R3)
if(R1 OR R2 OR R3)
  message(FATAL_ERROR "building the page from ../src failed")
endif()

if(APPLE)
  set(FMDM_FORMATS VST3 AU Standalone)
else()
  set(FMDM_FORMATS VST3 Standalone)
endif()
option(FMDM_COPY_PLUGIN "copy the built plugins to the system plug-in folders" ON)
if(WIN32)
  set(FMDM_WEBVIEW2 NEEDS_WEBVIEW2 TRUE) # the page runs in Edge WebView2 (statically linked loader)
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
  EDITOR_WANTS_KEYBOARD_FOCUS TRUE
  NEEDS_WEB_BROWSER TRUE
  COPY_PLUGIN_AFTER_BUILD ${FMDM_COPY_PLUGIN}
  ${FMDM_WEBVIEW2}
  VST3_CATEGORIES Instrument Drum
  AU_MAIN_TYPE kAudioUnitType_MusicDevice
  FORMATS ${FMDM_FORMATS})

file(GLOB PRESET_FILES ${REPO}/presets/*.json)
file(GLOB IR_FILES ${REPO}/src/static/ir/*.flac)
juce_add_binary_data(FMDMData SOURCES
  ${CMAKE_CURRENT_BINARY_DIR}/page/index.html
  ${REPO}/src/static/logo.png
  ${PRESET_FILES}
  ${IR_FILES})

target_sources(FMDM PRIVATE
  engine/Voice.cpp
  engine/Engine.cpp
  engine/Sequencer.cpp
  src/IRs.cpp
  src/Model.cpp
  src/PluginProcessor.cpp
  src/WebEditor.cpp)
target_include_directories(FMDM PRIVATE engine src)

target_compile_definitions(FMDM PUBLIC
  JUCE_WEB_BROWSER=1
  JUCE_USE_CURL=0
  JUCE_VST3_CAN_REPLACE_VST2=0
  JUCE_DISPLAY_SPLASH_SCREEN=0
  $<$<PLATFORM_ID:Windows>:JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1>)

target_link_libraries(FMDM
  PRIVATE FMDMData juce::juce_audio_utils juce::juce_audio_formats juce::juce_dsp juce::juce_gui_extra
  PUBLIC juce::juce_recommended_config_flags juce::juce_recommended_lto_flags)

# engine render check against the JS engine (no JUCE): node plugin/test/compare.mjs <dir>
add_executable(fmdm_render test/render.cpp engine/Voice.cpp engine/Engine.cpp engine/Sequencer.cpp)
target_include_directories(fmdm_render PRIVATE engine)
