#pragma once

#include <react/renderer/components/view/ConcreteViewShadowNode.h>
#include <react/renderer/components/wishlist/Props.h>
#include <react/renderer/core/LayoutConstraints.h>
#include <react/renderer/core/LayoutContext.h>
#include <stdio.h>
#include <iostream>

using namespace facebook;
using namespace facebook::react;

namespace Wishlist {

class ShadowNodeCopyMachine {
 public:
  static std::shared_ptr<ShadowNode> copyShadowSubtree(
      const std::shared_ptr<const ShadowNode> &sn);
  static void clearParent(const std::shared_ptr<const ShadowNode> &sn);
};

// dirty hack don't do it at home
//
// NOTE: This mirrors the private layout of ShadowNodeFamily in React Native
// for the version this library was built against. The fields below are only
// used via reinterpret_cast for a couple of targeted mutations; the precise
// layout is fragile across RN versions and this struct is preserved here only
// so the project compiles. Functionality may not be preserved at runtime.
class ShadowNodeFamilyHack final {
 public:
  using Shared = std::shared_ptr<ShadowNodeFamily const>;
  using Weak = std::weak_ptr<ShadowNodeFamily const>;

  EventDispatcher::Weak eventDispatcher_;
  mutable std::shared_ptr<State const> mostRecentState_;
  mutable std::shared_mutex mutex_;
  mutable std::function<void(ShadowNodeFamily &family)>
      onUnmountedFamilyDestroyedCallback_;
  Tag const tag_;
  SurfaceId const surfaceId_;
  mutable std::shared_ptr<const InstanceHandle> instanceHandle_;
  SharedEventEmitter const eventEmitter_;
  ComponentDescriptor const &componentDescriptor_;
  ComponentHandle componentHandle_;
  ComponentName componentName_;
  mutable ShadowNodeFamily::Weak parent_{};
  mutable bool hasParent_{false};
  mutable bool hasBeenMounted_{false};
  mutable std::unique_ptr<folly::dynamic> nativeProps_DEPRECATED;
};

}; // namespace Wishlist
