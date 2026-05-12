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
      std::function<void(std::function<void()> &&)> workletCallInvoker);

  jsi::Runtime &getRuntime() const;
  void accessRuntime(std::function<void(jsi::Runtime &rt)> &&f) const;
  void accessRuntimeSync(std::function<void(jsi::Runtime &rt)> &&f) const;

 private:
  WishlistJsRuntime();
  WishlistJsRuntime(const WishlistJsRuntime &) = delete;
  WishlistJsRuntime &operator=(const WishlistJsRuntime &) = delete;

  void decorateRuntime(jsi::Runtime &runtime);

  jsi::Runtime *runtime_;
  std::function<void(std::function<void()> &&)> jsCallInvoker_;
  std::function<void(std::function<void()> &&)> workletCallInvoker_;
};

}; // namespace Wishlist
