//
//  MGDataBindingImpl.hpp
//  MGWishList
//
//  Created by Szymon on 16/01/2023.
//

#pragma once

#include <jsi/jsi.h>
#include <stdio.h>
#include <memory>
#include <optional>
#include <set>
#include "MGDI.hpp"
#include "MGDataBinding.hpp"

namespace Wishlist {

struct MGDataBindingImpl : MGDataBinding {
  std::weak_ptr<MGDI> di;
  std::string _wishlistId;

  MGDataBindingImpl(
      const std::string &wishlistId,
      const std::weak_ptr<MGDI> &di);

  virtual std::set<int> applyChangesAndGetDirtyIndices(
      std::pair<int, int> windowIndexRange);

  void registerBindings();
  void unregisterBindings();

  virtual ~MGDataBindingImpl();

 private:
  // Cached JSI references to skip repeated `global.global.wishlists[<id>]`
  // lookups on every scroll event. Populated lazily on the worklet runtime,
  // and only used from that runtime. We cache the *binding object* (which
  // JS keeps stable; listener fn lives inside it and may be swapped, so we
  // never cache the function itself).
  std::optional<facebook::jsi::Object> cachedBinding_;
  std::optional<facebook::jsi::PropNameID> propPendingUpdates_;
  std::optional<facebook::jsi::PropNameID> propListener_;
};

}; // namespace Wishlist
