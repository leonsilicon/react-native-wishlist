//
//  MGDataBindingImpl.cpp
//  MGWishList
//
//  Created by Szymon on 16/01/2023.
//

#include "MGDataBindingImpl.hpp"
#include "WishlistJsRuntime.h"

namespace Wishlist {

using namespace facebook;

MGDataBindingImpl::MGDataBindingImpl(
    const std::string &wishlistId,
    const std::weak_ptr<MGDI> &di)
    : di(di), _wishlistId(wishlistId) {
  registerBindings();
}

std::set<int> MGDataBindingImpl::applyChangesAndGetDirtyIndices(
    std::pair<int, int> windowIndexRange) {
  std::shared_ptr retainedDI = di.lock();
  if (retainedDI == nullptr) {
    return {};
  }

  auto &rt = WishlistJsRuntime::getInstance().getRuntime();

  // Lazily cache the wishlist binding object + listener + property name IDs so
  // each scroll event no longer pays for `global.global.wishlists[<id>]`
  // resolution through five JSI property lookups + string allocations.
  if (!cachedBinding_.has_value()) {
    try {
      jsi::Object global = rt.global().getPropertyAsObject(rt, "global");
      if (!global.hasProperty(rt, "wishlists")) {
        global.setProperty(rt, "wishlists", jsi::Object(rt));
      }
      jsi::Object wishlists = global.getPropertyAsObject(rt, "wishlists");
      jsi::Value bindingVal =
          wishlists.getProperty(rt, _wishlistId.c_str());
      if (!bindingVal.isObject()) {
        return {};
      }
      cachedBinding_.emplace(bindingVal.getObject(rt));
      propPendingUpdates_.emplace(
          jsi::PropNameID::forAscii(rt, "__hasPendingUpdates"));
      propListener_.emplace(jsi::PropNameID::forAscii(rt, "listener"));
    } catch (std::exception &error) {
      retainedDI->getErrorHandler()->reportError(error.what());
      return {};
    }
  }

  // Fast path: if JS has not flagged any pending updates since the last
  // sync, skip the listener call entirely. Most scroll frames have no data
  // changes; previously we paid for a JSI call + std::set allocation each
  // time. See `WishlistData.ts` for where the flag is set/cleared.
  try {
    jsi::Value pendingVal =
        cachedBinding_->getProperty(rt, *propPendingUpdates_);
    bool hasPending = pendingVal.isBool() ? pendingVal.getBool()
                                         : pendingVal.isNumber()
                                         ? pendingVal.getNumber() != 0
                                         : false;
    if (!hasPending) {
      return {};
    }
  } catch (...) {
    // Fall through to listener call if the binding shape isn't yet ready.
  }

  try {
    jsi::Value listenerVal =
        cachedBinding_->getProperty(rt, *propListener_);
    if (!listenerVal.isObject()) {
      return {};
    }
    jsi::Object listenerObj = listenerVal.getObject(rt);
    if (!listenerObj.isFunction(rt)) {
      return {};
    }
    jsi::Function f = listenerObj.getFunction(rt);
    jsi::Array dirtyIndices = f.call(
                                   rt,
                                   jsi::Value(rt, windowIndexRange.first),
                                   jsi::Value(rt, windowIndexRange.second))
                                  .asObject(rt)
                                  .asArray(rt);
    size_t n = dirtyIndices.size(rt);
    std::set<int> res;
    for (size_t i = 0; i < n; ++i) {
      int dirtyIndex = (int)dirtyIndices.getValueAtIndex(rt, i).asNumber();
      res.insert(dirtyIndex);
    }
    return res;
  } catch (std::exception &error) {
    retainedDI->getErrorHandler()->reportError(error.what());
    return {};
  }
}

void MGDataBindingImpl::registerBindings() {
  WishlistJsRuntime::getInstance().accessRuntime([=](jsi::Runtime &rt) {
    jsi::Object global = rt.global().getPropertyAsObject(rt, "global");
    if (!global.hasProperty(rt, "wishlists")) {
      global.setProperty(rt, "wishlists", jsi::Object(rt));
    }

    jsi::Object wishlists = global.getPropertyAsObject(rt, "wishlists");

    jsi::Object binding(rt);
    if (wishlists.getProperty(rt, _wishlistId.c_str()).isObject()) {
      binding = wishlists.getProperty(rt, _wishlistId.c_str()).asObject(rt);
    }
    std::weak_ptr<MGDI> weakDi = di;
    binding.setProperty(
        rt,
        "scheduleSyncUp",
        jsi::Function::createFromHostFunction(
            rt,
            jsi::PropNameID::forAscii(rt, "scheduleSyncUp"),
            1,
            [=](jsi::Runtime &rt,
                const jsi::Value &thisValue,
                const jsi::Value *args,
                size_t count) -> jsi::Value {
              std::shared_ptr<MGDI> retainedDI = weakDi.lock();
              if (retainedDI == nullptr) {
                return jsi::Value::undefined();
              }
              std::shared_ptr<MGVSyncRequester> vsr =
                  retainedDI->getVSyncRequester();
              vsr->requestVSync();
              return jsi::Value::undefined();
            }));

    wishlists.setProperty(rt, _wishlistId.c_str(), binding);
  });
}

void MGDataBindingImpl::unregisterBindings() {
  WishlistJsRuntime::getInstance().accessRuntime([=](jsi::Runtime &rt) {
    jsi::Object global = rt.global().getPropertyAsObject(rt, "global");
    jsi::Object wishlists = global.getPropertyAsObject(rt, "wishlists");
    wishlists.setProperty(rt, _wishlistId.c_str(), jsi::Value::undefined());
  });
}

MGDataBindingImpl::~MGDataBindingImpl() {
  unregisterBindings();
}

}; // namespace Wishlist
