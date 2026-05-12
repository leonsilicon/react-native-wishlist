#include "MGContentContainerState.h"

namespace facebook {
namespace react {

MGContentContainerState::MGContentContainerState()
    : wishlistChildren(nullptr) {}

MGContentContainerState::MGContentContainerState(
    const std::shared_ptr<WishlistChildrenList> &wishlistChildren)
    : wishlistChildren(wishlistChildren) {}

#ifdef ANDROID

MGContentContainerState::MGContentContainerState(
    MGContentContainerState const &previousState,
    folly::dynamic /*data*/)
    : wishlistChildren(previousState.wishlistChildren) {}

folly::dynamic MGContentContainerState::getDynamic() const {
  return folly::dynamic::object;
}

MapBuffer MGContentContainerState::getMapBuffer() const {
  return MapBufferBuilder::EMPTY();
}

#endif

} // namespace react
} // namespace facebook
