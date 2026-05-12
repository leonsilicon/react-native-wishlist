#include "ShadowNodeCopyMachine.h"
#include "MGWishlistComponentDescriptor.h"
#include "WishlistJsRuntime.h"

namespace Wishlist {
namespace {

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

  ShadowNodeFamilyHack() = delete;

  mutable std::unique_ptr<folly::dynamic> nativeProps_DEPRECATED;

 private:
  [[maybe_unused]] EventDispatcher::Weak eventDispatcher_;
  [[maybe_unused]] mutable std::shared_ptr<State const> mostRecentState_;
  [[maybe_unused]] mutable std::shared_mutex mutex_;
  [[maybe_unused]] mutable std::function<void(ShadowNodeFamily &family)>
      onUnmountedFamilyDestroyedCallback_;
  [[maybe_unused]] Tag const tag_;
  [[maybe_unused]] SurfaceId const surfaceId_;
  [[maybe_unused]] mutable InstanceHandle::Shared instanceHandle_;
  [[maybe_unused]] SharedEventEmitter const eventEmitter_;
  [[maybe_unused]] ComponentDescriptor const &componentDescriptor_;
  [[maybe_unused]] ComponentHandle componentHandle_;
  [[maybe_unused]] ComponentName componentName_;

 public:
  mutable ShadowNodeFamily::Weak parent_{};
  mutable bool hasParent_{false};

 private:
  [[maybe_unused]] mutable bool hasBeenMounted_{false};
};

} // namespace

int tag = -2;

std::shared_ptr<ShadowNode> ShadowNodeCopyMachine::copyShadowSubtree(
    const std::shared_ptr<const ShadowNode> &sn) {
  auto const &cd = sn->getComponentDescriptor();

  PropsParserContext propsParserContext{
      sn->getSurfaceId(), *cd.getContextContainer().get()};

  if (tag < -2e9) {
    tag = -2;
  }

  auto const fragment =
      ShadowNodeFamilyFragment{tag -= 2, sn->getSurfaceId(), nullptr};

  auto const family = cd.createFamily(fragment);
  auto const props =
      cd.cloneProps(propsParserContext, sn->getProps(), RawProps());
  auto const state = cd.createInitialState(props, family);

  auto shadowNode = cd.createShadowNode(
      ShadowNodeFragment{
          /* .props = */
          props,
          /* .children = */ ShadowNodeFragment::childrenPlaceholder(),
          /* .state = */ state,
      },
      family);

  for (const auto &child : sn->getChildren()) {
    auto const clonedChild = copyShadowSubtree(child);
    cd.appendChild(shadowNode, clonedChild);
  }

  return shadowNode;
}

void ShadowNodeCopyMachine::clearParent(
    const std::shared_ptr<const ShadowNode> &sn) {
  auto *family =
      reinterpret_cast<const ShadowNodeFamilyHack *>(&sn->getFamily());
  family->hasParent_ = false;
  family->parent_.reset();
}

}; // namespace Wishlist
