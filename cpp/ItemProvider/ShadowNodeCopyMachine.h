#pragma once

#include <jsi/jsi.h>
#include <react/renderer/components/view/ConcreteViewShadowNode.h>
#include <react/renderer/components/wishlist/Props.h>
#include <react/renderer/core/InstanceHandle.h>
#include <react/renderer/core/LayoutConstraints.h>
#include <react/renderer/core/LayoutContext.h>
#include <react/renderer/core/ShadowNodeFamily.h>
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
// NOTE: This mirrors the private layout of `facebook::react::ShadowNodeFamily`
// for React Native 0.83. We only use it via `reinterpret_cast` to reach the
// private `parent_`/`hasParent_` slots. RN 0.83 made `ShadowNodeFamily` derive
// from `jsi::NativeState` and moved `nativeProps_DEPRECATED` to a public field
// at the top of the class, so the order below differs from older versions of
// the library.
class ShadowNodeFamilyHack final : public jsi::NativeState {
 public:
  using Shared = std::shared_ptr<ShadowNodeFamily const>;
  using Weak = std::weak_ptr<ShadowNodeFamily const>;

  mutable std::unique_ptr<folly::dynamic> nativeProps_DEPRECATED;

 private:
  EventDispatcher::Weak eventDispatcher_;
  mutable std::shared_ptr<State const> mostRecentState_;
  mutable std::shared_mutex mutex_;
  mutable std::function<void(ShadowNodeFamily &family)>
      onUnmountedFamilyDestroyedCallback_;
  Tag const tag_;
  SurfaceId const surfaceId_;
  mutable InstanceHandle::Shared instanceHandle_;
  SharedEventEmitter const eventEmitter_;
  ComponentDescriptor const &componentDescriptor_;
  ComponentHandle componentHandle_;
  ComponentName componentName_;

 public:
  mutable ShadowNodeFamily::Weak parent_{};
  mutable bool hasParent_{false};

 private:
  mutable bool hasBeenMounted_{false};
};

}; // namespace Wishlist
