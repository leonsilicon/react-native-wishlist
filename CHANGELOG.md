xample android exit with 0.

⏺ All tasks done. Final summary of what was changed:

  Root package:
  - package.json: bumped React 19.2.0, RN 0.83.9, RN gesture-handler
  2.31.2, RN worklets 0.8.3, types 19.2, typescript 5.8, jest 29,
  builder-bob 0.41
  - MGWishList.podspec: bumped to min_ios_version_supported (16.4 in
  0.83.9), added explicit C++20 + new-arch fail-if-disabled check
  - android/build.gradle: bumped AGP 8.7.2, Kotlin/JVM 17, added
  new-arch fail-if-disabled check
  - android/gradle.properties: Kotlin 2.1.20, minSdk 24,
  target/compile 36, NDK 27.1.12297006
  - android/CMakeLists.txt: switched to worklets prefab module name
  worklets, dropped explicit librnworklets.so lookup, removed -Werror,
   added warning relaxations, switched to ReactAndroid::reactnative
  merged lib

  Native source updates for RN 0.83:
  - cpp/WishlistJsRuntime.h/.cpp: replaced worklets-based runtime with
   a self-contained dispatch queue + js call invoker (the old
  RNWorklet::JsiWorkletContext headers are gone)
  - cpp/ContentContainer/MGContentContainerState.{h,cpp} +
  MGContentContainerShadowNode.{h,cpp} + descriptor: switched
  wishlistChildren from ShadowNode::ListOfShared (now
  std::vector<...>) to
  std::shared_ptr<std::vector<std::shared_ptr<const ShadowNode>>> for
  null-state semantics
  - cpp/ItemProvider/ShadowNodeCopyMachine.{h,cpp}: dropped
  butter::small_vector, dropped removed createFamily(fragment,
  eventTarget) overload, switched to createInitialState(props, family)
  - cpp/ItemProvider/ShadowNodeBinding.cpp: pass std::move(rawProps)
  since RawProps has deleted copy assignment
  - cpp/MGViewportCarer/MGViewportCarerImpl.cpp +
  ShadowNodeBinding.cpp: replaced all ShadowNode::ListOfShared /
  Unshared / Shared / Weak with std::shared_ptr<const ShadowNode> etc.
   (deprecated aliases)
  - android/src/main/jni/WishlistManagerModule.{hpp,cpp}: replaced
  worklets DispatchQueue with our local one, added
  FabricUIManagerBinding.h include, switched
  RawEvent::payloadFactory(rt) to eventPayload->asJSIValue(rt)
  - ios/MGWishlistManager.mm: same eventPayload switch
  - ios/MGTemplateContainerComponent.mm: stopped trying to copy
  MGTemplateContainerProps (copy ctor is now deleted)

  Android Kotlin:
  - Dropped FabricViewStateManager (removed in RN) and used
  StateWrapper directly
  - WishlistManagerModule.kt: opted into @FrameworkAPI, used
  CallInvokerHolderImpl, fixed nullability around
  javaScriptContextHolder/jsCallInvokerHolder
  - Fixed misc signature nullability mismatches (UIScheduler,
  Wishlist, WishlistViewManager)

  Example app:
  - Regenerated example/ios/ and example/android/ from the RN 0.83.9
  community template, renamed package/identifier to WishlistExample /
  com.wishlistexample
  - example/package.json: switched to @react-native/babel-preset,
  @react-native/metro-config, dropped patch-package/postinstall (the
  old gesture-handler patch is no longer needed against 2.31)
  - example/babel.config.js: switched preset to
  module:@react-native/babel-preset
  - Removed example/patches/

  Builds verified:
  - yarn example android → exit 0
  - yarn example ios → exit 0

  Caveat about preserved functionality: parts of the C++ runtime (the
  ShadowNodeFamilyHack reinterpret-cast, custom event-target injection
   in ShadowNodeCopyMachine, the JSI runtime that used to ride on
  worklets' worklet runtime) depended on internal RN APIs that have
  either changed shape or been removed. The package compiles and links
   against RN 0.83.9, but those parts may not behave identically at
  runtime — they're preserved structurally where possible so the
  project can be iterated on, not validated as functionally
  equivalent.

  Sources:
  - React Native 0.83 release notes
  (https://reactnative.dev/blog/2025/12/10/react-native-0.83)
