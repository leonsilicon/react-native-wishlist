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

}; // namespace Wishlist
