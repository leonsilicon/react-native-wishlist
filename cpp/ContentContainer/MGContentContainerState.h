#pragma once

#include <react/renderer/components/view/ConcreteViewShadowNode.h>
#include <memory>
#include <vector>

#ifdef ANDROID
#include <folly/dynamic.h>
#include <react/renderer/mapbuffer/MapBuffer.h>
#include <react/renderer/mapbuffer/MapBufferBuilder.h>
#endif

namespace facebook {
namespace react {

using WishlistChildrenList = std::vector<std::shared_ptr<const ShadowNode>>;

/*
 * State for <MGContentContainer> component.
 */
class JSI_EXPORT MGContentContainerState final {
 public:
  std::shared_ptr<WishlistChildrenList> wishlistChildren;

  MGContentContainerState();
  MGContentContainerState(
      const std::shared_ptr<WishlistChildrenList> &wishlistChildren);

#ifdef ANDROID
  MGContentContainerState(
      MGContentContainerState const &previousState,
      folly::dynamic data);
  folly::dynamic getDynamic() const;
  MapBuffer getMapBuffer() const;
#endif
};

} // namespace react
} // namespace facebook
