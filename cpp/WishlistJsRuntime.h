#pragma once

#include <jsi/jsi.h>
#include <condition_variable>
#include <functional>
#include <memory>
#include <mutex>
#include <queue>
#include <stdio.h>
#include <thread>

using namespace facebook;

namespace Wishlist {

class WishlistDispatchQueue {
 public:
  WishlistDispatchQueue();
  ~WishlistDispatchQueue();

  void dispatch(std::function<void()> work);

 private:
  std::mutex mutex_;
  std::condition_variable cv_;
  std::queue<std::function<void()>> queue_;
  bool quit_ = false;
  std::thread thread_;
};

class WishlistJsRuntime {
 public:
  static WishlistJsRuntime &getInstance();

  void initialize(
      jsi::Runtime *runtime,
      std::function<void(std::function<void()> &&)> jsCallInvoker,
      std::function<void(std::function<void()> &&)> workletCallInvoker,
      std::function<void(std::function<void(jsi::Runtime &)> &&)>
          runtimeAccessor = nullptr);

  jsi::Runtime &getRuntime() const;
  void accessRuntime(std::function<void(jsi::Runtime &rt)> &&f) const;
  void accessRuntimeSync(std::function<void(jsi::Runtime &rt)> &&f) const;

  // Lazy accessors for hot-path JSI functions on `global.__wishlistInflatorRegistry`.
  // These are looked up many times per scroll event (per inflated item and per
  // prop-set) — caching shaves a non-trivial amount of JSI string-key work off
  // every frame. Caller MUST be on the worklet runtime.
  jsi::Function &getProcessPropsFn(jsi::Runtime &rt);
  jsi::Function &getDidPushChildrenFn(jsi::Runtime &rt);

  // `global.dropGestureHandler` (installed by `Pressable.tsx`) — cached on
  // first use; reset if JS replaces the global.
  jsi::Function *getDropGestureHandlerFn(jsi::Runtime &rt);

 private:
  WishlistJsRuntime();
  WishlistJsRuntime(const WishlistJsRuntime &) = delete;
  WishlistJsRuntime &operator=(const WishlistJsRuntime &) = delete;

  void decorateRuntime(jsi::Runtime &runtime);
  jsi::Object &getInflatorRegistry(jsi::Runtime &rt);

  jsi::Runtime *runtime_;
  std::function<void(std::function<void()> &&)> jsCallInvoker_;
  std::function<void(std::function<void()> &&)> workletCallInvoker_;
  std::function<void(std::function<void(jsi::Runtime &)> &&)> runtimeAccessor_;

  std::unique_ptr<jsi::Object> cachedInflatorRegistry_;
  std::unique_ptr<jsi::Function> cachedProcessProps_;
  std::unique_ptr<jsi::Function> cachedDidPushChildren_;
  std::unique_ptr<jsi::Function> cachedDropGestureHandler_;
};

}; // namespace Wishlist
