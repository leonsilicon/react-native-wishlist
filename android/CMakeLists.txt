project(Wishlist)
cmake_minimum_required(VERSION 3.13)

set(CMAKE_VERBOSE_MAKEFILE ON)
set(CMAKE_CXX_STANDARD 20)

add_compile_options(
  -Wall
  -std=c++20
  -Wno-deprecated-declarations
  -Wno-deprecated-this-capture
  -Wno-unused-parameter
  -Wno-unused-variable
  -Wno-unused-private-field
  -Wno-unused-function
  -Wno-unused-lambda-capture
  -Wno-unused-but-set-variable
)

if(${CMAKE_BUILD_TYPE} STREQUAL "Debug")
  string(APPEND CMAKE_CXX_FLAGS " -DDEBUG")
endif()

set(PACKAGE_NAME "react_codegen_wishlist")
set(SRC_DIR "${CMAKE_CURRENT_SOURCE_DIR}/src")
set(COMMON_SRC_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../cpp")
set(LIB_ANDROID_GENERATED_JNI_DIR ${CMAKE_CURRENT_SOURCE_DIR}/build/generated/source/codegen/jni)

file(GLOB_RECURSE SOURCES_COMMON CONFIGURE_DEPENDS "${COMMON_SRC_DIR}/**.cpp")
file(GLOB_RECURSE SOURCES_ANDROID CONFIGURE_DEPENDS "${SRC_DIR}/main/jni/**.cpp")
file(GLOB_RECURSE SOURCES_CODEGEN CONFIGURE_DEPENDS "${LIB_ANDROID_GENERATED_JNI_DIR}/**.cpp")

# Consume shared libraries and headers from prefabs
find_package(fbjni REQUIRED CONFIG)
find_package(ReactAndroid REQUIRED CONFIG)
find_package(react-native-worklets REQUIRED CONFIG)

add_library(
  ${PACKAGE_NAME}
  SHARED
  ${SOURCES_COMMON}
  ${SOURCES_ANDROID}
  ${SOURCES_CODEGEN}
)

target_compile_definitions(
  ${PACKAGE_NAME}
  PRIVATE
  RN_SERIALIZABLE_STATE
)

# includes
target_include_directories(
  ${PACKAGE_NAME}
  PUBLIC
  "${SRC_DIR}/main/jni"
  "${COMMON_SRC_DIR}/ContentContainer"
  "${COMMON_SRC_DIR}/DataBinding"
  "${COMMON_SRC_DIR}/DependencyInjection"
  "${COMMON_SRC_DIR}/ItemProvider"
  "${COMMON_SRC_DIR}/MGViewportCarer"
  "${COMMON_SRC_DIR}/ReanimatedRuntime"
  "${COMMON_SRC_DIR}/TemplateContainer"
  "${COMMON_SRC_DIR}/UIScheduler"
  "${COMMON_SRC_DIR}/Wishlist"
  "${COMMON_SRC_DIR}"
  "${LIB_ANDROID_GENERATED_JNI_DIR}"
  "${REACT_ANDROID_DIR}/src/main/jni/react/turbomodule"
  # `worklets/WorkletRuntime/WorkletRuntime.h` transitively pulls in headers
  # such as `<jsireact/JSIExecutor.h>` and `<oscompat/OSCompat.h>` that live
  # in RN's source tree but are not surfaced via the ReactAndroid prefab. Add
  # the relevant ReactCommon directories so they resolve when we include
  # WorkletRuntime indirectly.
  "${REACT_ANDROID_DIR}/../ReactCommon"
  "${REACT_ANDROID_DIR}/../ReactCommon/jsiexecutor"
)

# build shared lib
set_target_properties(${PACKAGE_NAME} PROPERTIES LINKER_LANGUAGE CXX)

target_link_libraries(
  ${PACKAGE_NAME}
  log
  android
)

target_link_libraries(
  ${PACKAGE_NAME}
  fbjni::fbjni
  react-native-worklets::worklets
  ReactAndroid::reactnative
  ReactAndroid::jsi
)
