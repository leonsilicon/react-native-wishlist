project(Wishlist)
cmake_minimum_required(VERSION 3.13)

set(CMAKE_VERBOSE_MAKEFILE ON)
set(CMAKE_CXX_STANDARD 17)

add_compile_options(-Wall -Werror -std=c++17)

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

# react-native-worklets prefab CMake package exposes rnworklets as INTERFACE IMPORTED with
# INTERFACE_LINK_LIBRARIES empty (headers only). Wishlist C++ still needs symbols from
# librnworklets.so — link it explicitly.
#
# Prefab stores libs under libs/android.<abi>/ (not libs/<abi>/). Yarn "link:../" often
# resolves react-native-wishlist to the monorepo root, so also search example/node_modules.
set(_RNWL_PREFAB_ROOTS
  "${CMAKE_CURRENT_SOURCE_DIR}/../../react-native-worklets/android/build/intermediates/prefab_package"
  "${CMAKE_CURRENT_SOURCE_DIR}/../example/node_modules/react-native-worklets/android/build/intermediates/prefab_package"
)
set(_RNWL_ABI_DIRS "${ANDROID_ABI}" "android.${ANDROID_ABI}")
set(RNWORKLETS_SHARED_LIB RNWORKLETS_SHARED_LIB-NOTFOUND)
foreach(_RNWL_ROOT IN LISTS _RNWL_PREFAB_ROOTS)
  foreach(_RNWL_CONF debug release)
    foreach(_RNWL_ABI_DIR IN LISTS _RNWL_ABI_DIRS)
      set(_RNWL_CAND "${_RNWL_ROOT}/${_RNWL_CONF}/prefab/modules/rnworklets/libs/${_RNWL_ABI_DIR}/librnworklets.so")
      if(EXISTS "${_RNWL_CAND}")
        set(RNWORKLETS_SHARED_LIB "${_RNWL_CAND}")
        break()
      endif()
    endforeach()
    if(RNWORKLETS_SHARED_LIB)
      break()
    endif()
  endforeach()
  if(RNWORKLETS_SHARED_LIB)
    break()
  endif()
endforeach()
if(NOT RNWORKLETS_SHARED_LIB)
  message(FATAL_ERROR "Could not find librnworklets.so (${ANDROID_ABI}). Build :react-native-worklets prefab first.")
endif()

add_library(
  ${PACKAGE_NAME}
  SHARED
  ${SOURCES_COMMON}
  ${SOURCES_ANDROID}
  ${SOURCES_CODEGEN}
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
  react-native-worklets::rnworklets
  "${RNWORKLETS_SHARED_LIB}"
  ReactAndroid::fabricjni
  ReactAndroid::folly_runtime
  ReactAndroid::glog
  ReactAndroid::jsi
  ReactAndroid::react_codegen_rncore
  ReactAndroid::react_debug
  ReactAndroid::react_nativemodule_core
  ReactAndroid::react_render_animations
  ReactAndroid::react_render_core
  ReactAndroid::react_render_debug
  ReactAndroid::react_render_graphics
  ReactAndroid::react_render_mapbuffer
  ReactAndroid::react_render_mounting
  ReactAndroid::react_render_scheduler
  ReactAndroid::react_render_uimanager
  ReactAndroid::reactnativejni
  ReactAndroid::rrc_view
  ReactAndroid::runtimeexecutor
  ReactAndroid::yoga
)
