#pragma once

#include <react/renderer/components/view/ConcreteViewShadowNode.h>
#include <react/renderer/core/ConcreteComponentDescriptor.h>
#include <iostream>
#include "MGContentContainerShadowNode.h"

namespace facebook {
namespace react {

class MGContentContainerComponentDescriptor
    : public ConcreteComponentDescriptor<MGContentContainerShadowNode> {
  using ConcreteComponentDescriptor::ConcreteComponentDescriptor;

  std::shared_ptr<ShadowNode> cloneShadowNode(
      const ShadowNode &sourceShadowNode,
      const ShadowNodeFragment &fragment) const override {
    // React holds on to old shadow nodes so we need to make sure to get the
    // latest state when cloning those to get the children that were set by
    // Wishlist.
    auto &mostRecentStateData = static_cast<ConcreteState const *>(
                                    sourceShadowNode.getMostRecentState().get())
                                    ->getData();
    auto wishlistChildren = mostRecentStateData.wishlistChildren;
    auto children =
        wishlistChildren
            ? std::make_shared<std::vector<std::shared_ptr<const ShadowNode>>>(
                  *wishlistChildren)
            : fragment.children;
    auto shadowNode = std::make_shared<MGContentContainerShadowNode>(
        sourceShadowNode,
        ShadowNodeFragment{fragment.props, children, fragment.state});

    adopt(*shadowNode);
    return shadowNode;
  }
};

} // namespace react
} // namespace facebook
