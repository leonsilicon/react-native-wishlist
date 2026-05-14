#include "WishlistManagerModule.hpp"

#include <fbjni/fbjni.h>
#include <react/fabric/FabricUIManagerBinding.h>
#include <react/renderer/core/ShadowNodeFamily.h>
#include <worklets/Compat/Holders.h>
#include <worklets/WorkletRuntime/WorkletRuntime.h>
#include "MGUIManagerHolder.h"
#include "WishlistJsRuntime.h"

using namespace facebook;
using namespace facebook::react;

namespace worklets {
// Implemented in `worklets/Compat/StableApi.cpp` and exported by the
// react-native-worklets shared lib. Unlike calling `getNativeState<WorkletRuntimeHolder>`
// from our own `.so`, going through worklets' own code means the `typeid` /
// `dynamic_cast` happens inside the library that defined the type, so the
// check succeeds regardless of how the typeinfo symbol's visibility is set
// across `.so` boundaries. See https://itanium-cxx-abi.github.io/cxx-abi/abi.html#rtti
// for why RTTI is fragile across shared objects.
std::shared_ptr<WorkletRuntime> getWorkletRuntimeFromHolder(
    facebook::jsi::Runtime &rt,
    const facebook::jsi::Object &object);
} // namespace worklets

namespace Wishlist {

local_ref<WishlistManagerModule::jhybriddata> WishlistManagerModule::initHybrid(
    alias_ref<jclass>) {
  return makeCxxInstance();
}

WishlistManagerModule::WishlistManagerModule() {}

WishlistManagerModule::~WishlistManagerModule() {
  scheduler_->removeEventListener(eventListener_);
}

void WishlistManagerModule::nativeInstall(
    jlong jsiRuntimeRef,
    alias_ref<CallInvokerHolder::javaobject> jsCallInvokerHolder,
    alias_ref<JFabricUIManager::javaobject> fabricUIManager) {
  auto jsiRuntime{reinterpret_cast<jsi::Runtime *>(jsiRuntimeRef)};
  auto const &jsCallInvoker = jsCallInvokerHolder->cthis()->getCallInvoker();
  scheduler_ = fabricUIManager->getBinding()->getScheduler();

  eventListener_ =
      std::make_shared<EventListener>([this](const RawEvent &event) -> bool {
        auto shadowNodeFamily = event.shadowNodeFamily.lock();
        if (shadowNodeFamily == nullptr) {
          return event.eventTarget != nullptr;
        }

        int tag = shadowNodeFamily->getTag();
        if (tag >= 0) {
          return shadowNodeFamily->getInstanceHandle() == nullptr;
        }

        auto eventPayload = event.eventPayload;
        std::string type = event.type;
        WishlistJsRuntime::getInstance().accessRuntime(
            [this, type = std::move(type), tag, eventPayload](
                jsi::Runtime &rt) {
              try {
                auto handleEvent =
                    rt.global()
                        .getPropertyAsObject(rt, "global")
                        .getPropertyAsFunction(rt, "handleEvent");
                jsi::Value payload = eventPayload
                    ? eventPayload->asJSIValue(rt)
                    : jsi::Value::null();
                handleEvent.call(rt, type, tag, payload);
              } catch (std::exception &error) {
                if (errorHandler_) {
                  errorHandler_->reportError(error.what());
                }
              }
            });

        return true;
      });
  scheduler_->addEventListener(eventListener_);

  wishlistQueue_ = std::make_shared<WishlistDispatchQueue>();

  // Install a JSI hook the JS side calls with a runtime reference; we unwrap
  // the underlying C++ `worklets::WorkletRuntime` and bind `WishlistJsRuntime`
  // to its JSI runtime so JS-side worklets and wishlist's native code share
  // global state.
  //
  // The JS side passes one of:
  //   (a) A WorkletRuntimeHolder object (e.g. from `getUIRuntimeHolder()`).
  //   (b) A WorkletRuntime HostObject (e.g. from `createWorkletRuntime(...)`).
  //
  // For (b) we go through the JS-thread `runOnRuntime` path: schedule a job on
  // the wishlist runtime that calls back into native via
  // `__mgWishlistBindCurrentRuntime`, at which point native can use
  // `getWeakRuntimeFromJSIRuntime(rt)` on the *current* runtime to recover the
  // WorkletRuntime weak_ptr — staying inside the StableApi and avoiding
  // cross-`.so` RTTI checks on `WorkletRuntime` itself.
  auto wishlistQueue = wishlistQueue_;
  auto bindToRuntime =
      [jsCallInvoker, wishlistQueue](
          std::weak_ptr<worklets::WorkletRuntime> workletRuntimeWeak) {
        auto strong = workletRuntimeWeak.lock();
        if (!strong) {
          return;
        }
        jsi::Runtime &workletJsiRuntime = strong->getJSIRuntime();
        WishlistJsRuntime::getInstance().initialize(
            &workletJsiRuntime,
            [jsCallInvoker](std::function<void()> &&f) {
              jsCallInvoker->invokeAsync(std::move(f));
            },
            [wishlistQueue](std::function<void()> &&f) {
              wishlistQueue->dispatch(std::move(f));
            },
            [workletRuntimeWeak](std::function<void(jsi::Runtime &)> &&job) {
              if (auto strong = workletRuntimeWeak.lock()) {
                strong->schedule(std::move(job));
              }
            });
      };

  auto setupWishlistRuntime = [bindToRuntime](
                                  jsi::Runtime &rt,
                                  const jsi::Value & /*thisVal*/,
                                  const jsi::Value *args,
                                  size_t count) -> jsi::Value {
    if (count < 1 || !args[0].isObject()) {
      throw jsi::JSError(
          rt,
          "WishlistManager._setWishlistContext expects a worklet runtime");
    }
    auto holderObj = args[0].asObject(rt);
    // Path (a): a `WorkletRuntimeHolder` NativeState-backed object (e.g.
    // `getUIRuntimeHolder()`). NOTE: `getWorkletRuntimeFromHolder` is
    // implemented with an *assertion* on the NativeState type, not a throw —
    // so we MUST gate it on `hasNativeState<WorkletRuntimeHolder>` first.
    if (holderObj.hasNativeState<worklets::WorkletRuntimeHolder>(rt)) {
      auto workletRuntime =
          worklets::getWorkletRuntimeFromHolder(rt, holderObj);
      bindToRuntime(workletRuntime);
      return jsi::Value::undefined();
    }
    // Path (b): the value is the `WorkletRuntime` HostObject directly (what
    // `createWorkletRuntime` returns). Dynamic-cast through `asHostObject` +
    // `dynamic_pointer_cast<WorkletRuntime>` mirrors the pre-migration
    // worklets-core binding path that successfully worked across `.so`
    // boundaries with these same library link flags.
    if (holderObj.isHostObject(rt)) {
      auto hostObject = holderObj.asHostObject(rt);
      auto workletRuntime =
          std::dynamic_pointer_cast<worklets::WorkletRuntime>(hostObject);
      if (workletRuntime) {
        bindToRuntime(workletRuntime);
        return jsi::Value::undefined();
      }
    }
    throw jsi::JSError(
        rt,
        "WishlistManager._setWishlistContext: expected a WorkletRuntime");
  };

  jsiRuntime->global().setProperty(
      *jsiRuntime,
      "__mgWishlistSetContext",
      jsi::Function::createFromHostFunction(
          *jsiRuntime,
          jsi::PropNameID::forAscii(*jsiRuntime, "__mgWishlistSetContext"),
          1,
          setupWishlistRuntime));

  MGUIManagerHolder::getInstance().setUIManager(scheduler_->getUIManager());
}

void WishlistManagerModule::registerNatives() {
  registerHybrid(
      {makeNativeMethod("initHybrid", WishlistManagerModule::initHybrid),
       makeNativeMethod(
           "nativeInstall", WishlistManagerModule::nativeInstall)});
}

} // namespace Wishlist
