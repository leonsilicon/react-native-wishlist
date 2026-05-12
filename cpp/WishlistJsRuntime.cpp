#include "WishlistJsRuntime.h"

#include <chrono>
#include <iostream>
#include <mutex>

namespace Wishlist {

WishlistDispatchQueue::WishlistDispatchQueue() {
  thread_ = std::thread([this]() {
    while (true) {
      std::function<void()> work;
      {
        std::unique_lock<std::mutex> lock(mutex_);
        cv_.wait(lock, [this] { return quit_ || !queue_.empty(); });
        if (quit_ && queue_.empty()) {
          return;
        }
        work = std::move(queue_.front());
        queue_.pop();
      }
      work();
    }
  });
}

WishlistDispatchQueue::~WishlistDispatchQueue() {
  {
    std::lock_guard<std::mutex> lock(mutex_);
    quit_ = true;
  }
  cv_.notify_all();
  if (thread_.joinable()) {
    thread_.join();
  }
}

void WishlistDispatchQueue::dispatch(std::function<void()> work) {
  {
    std::lock_guard<std::mutex> lock(mutex_);
    queue_.push(std::move(work));
  }
  cv_.notify_one();
}

WishlistJsRuntime &WishlistJsRuntime::getInstance() {
  static WishlistJsRuntime instance;
  return instance;
}

WishlistJsRuntime::WishlistJsRuntime() : runtime_(nullptr) {}

void WishlistJsRuntime::initialize(
    jsi::Runtime *runtime,
    std::function<void(std::function<void()> &&)> jsCallInvoker,
    std::function<void(std::function<void()> &&)> workletCallInvoker,
    std::function<void(std::function<void(jsi::Runtime &)> &&)>
        runtimeAccessor) {
  runtime_ = runtime;
  jsCallInvoker_ = std::move(jsCallInvoker);
  workletCallInvoker_ = std::move(workletCallInvoker);
  runtimeAccessor_ = std::move(runtimeAccessor);

  decorateRuntime(*runtime_);
}

jsi::Runtime &WishlistJsRuntime::getRuntime() const {
  return *runtime_;
}

void WishlistJsRuntime::accessRuntime(
    std::function<void(jsi::Runtime &)> &&f) const {
  if (runtimeAccessor_) {
    runtimeAccessor_(std::move(f));
    return;
  }
  auto runtime = runtime_;
  auto ff = std::move(f);
  jsCallInvoker_([runtime, ff = std::move(ff)]() mutable {
    if (runtime) {
      ff(*runtime);
    }
  });
}

void WishlistJsRuntime::accessRuntimeSync(
    std::function<void(jsi::Runtime &)> &&f) const {
  static std::mutex mutex;
  mutex.lock();
  auto runtime = runtime_;
  auto ff = std::move(f);
  jsCallInvoker_([runtime, ff = std::move(ff)]() mutable {
    if (runtime) {
      ff(*runtime);
    }
    mutex.unlock();
  });
  mutex.lock();
  mutex.unlock();
}

void WishlistJsRuntime::decorateRuntime(jsi::Runtime &rt) {
  auto callback = [](jsi::Runtime &rt,
                     const jsi::Value & /*thisValue*/,
                     const jsi::Value *args,
                     size_t /*count*/) -> jsi::Value {
    const jsi::Value *value = &args[0];
    if (value->isString()) {
      std::cout << value->getString(rt).utf8(rt).c_str() << std::endl;
    } else if (value->isNumber()) {
      std::cout << value->getNumber() << std::endl;
    } else if (value->isUndefined()) {
      std::cout << "undefined" << std::endl;
    } else {
      std::cout << "unsupported value type" << std::endl;
    }
    return jsi::Value::undefined();
  };
  jsi::Value log = jsi::Function::createFromHostFunction(
      rt, jsi::PropNameID::forAscii(rt, "_log"), 1, callback);
  rt.global().setProperty(rt, "_log", log);

  auto chronoNow = [](jsi::Runtime & /*rt*/,
                      const jsi::Value & /*thisValue*/,
                      const jsi::Value * /*args*/,
                      size_t /*count*/) -> jsi::Value {
    double now = std::chrono::system_clock::now().time_since_epoch() /
        std::chrono::milliseconds(1);
    return jsi::Value(now);
  };

  rt.global().setProperty(
      rt,
      "_chronoNow",
      jsi::Function::createFromHostFunction(
          rt, jsi::PropNameID::forAscii(rt, "_chronoNow"), 0, chronoNow));
}

}; // namespace Wishlist
