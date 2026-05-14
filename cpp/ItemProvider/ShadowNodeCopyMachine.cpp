#include "ShadowNodeCopyMachine.h"
#include "MGWishlistComponentDescriptor.h"
#include "WishlistJsRuntime.h"

namespace Wishlist {

int tag = -2;

std::shared_ptr<ShadowNode> ShadowNodeCopyMachine::copyShadowSubtree(
    const std::shared_ptr<const ShadowNode> &sn) {
  auto const &cd = sn->getComponentDescriptor();

  PropsParserContext propsParserContext{
      sn->getSurfaceId(), *cd.getContextContainer().get()};

  if (tag < -2e9) {
    tag = -2;
  }

  int nodeTag = tag -= 2;

  // Build a real InstanceHandle so that third-party event listeners (e.g.
  // Reanimated in bundleMode) that call EventTarget::getTag() don't crash
  // dereferencing a null InstanceHandle. InstanceHandle internally wraps a
  // jsi::WeakObject, which requires a real JS Object (not null/undefined).
  // We create a plain empty sentinel object on the wishlist worklet runtime.
  // These are unmanaged wishlist rows with no JS React instance; any listener
  // that looks up the negative tag in its handler registry finds nothing and
  // skips the event harmlessly.
  auto &rt = WishlistJsRuntime::getInstance().getRuntime();
  auto sentinelObj = jsi::Value(rt, jsi::Object(rt));
  auto instanceHandle = std::make_shared<const facebook::react::InstanceHandle>(
      rt, sentinelObj, nodeTag);

  auto const fragment =
      ShadowNodeFamilyFragment{nodeTag, sn->getSurfaceId(), instanceHandle};

  auto const family = cd.createFamily(fragment);
  // On Android, mounted view props are derived from `Props::rawProps` (the
  // serialized folly::dynamic on the props object) — either sent directly, or
  // diffed against the previous shadow view. `cloneProps` rebuilds that field
  // from whatever `RawProps` we pass in, so an empty `RawProps()` here wipes
  // every styling prop (backgroundColor, borderRadius, image source, tint,
  // etc.) on the cloned subtree and the View mounts blank on Android. Reuse
  // the source props' serialized rawProps so the clone keeps the original
  // styling — iOS doesn't define this field, so it's gated behind the macro.
#ifdef RN_SERIALIZABLE_STATE
  auto const props = cd.cloneProps(
      propsParserContext,
      sn->getProps(),
      RawProps(folly::dynamic(sn->getProps()->rawProps)));
#else
  auto const props =
      cd.cloneProps(propsParserContext, sn->getProps(), RawProps());
#endif
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

}; // namespace Wishlist
