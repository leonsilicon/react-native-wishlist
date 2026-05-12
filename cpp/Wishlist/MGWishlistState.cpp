#include "MGWishlistState.h"

#ifdef ANDROID
#include "JNIStateRegistry.h"
#endif

namespace facebook {
namespace react {
#ifdef ANDROID
namespace {
constexpr MapBuffer::Key ViewportCarerKey = 1;
constexpr MapBuffer::Key ContentOffsetKey = 2;
} // namespace
#endif

MGWishlistState::MGWishlistState()
    : initialised(false),
      viewportCarer(std::make_shared<MGViewportCarerImpl>()),
      contentBoundingRect({}),
      contentOffset(MG_NO_OFFSET){};

#ifdef ANDROID

MGWishlistState::MGWishlistState(
    MGWishlistState const &previousState,
    folly::dynamic data)
    : initialised(previousState.initialised),
      viewportCarer(previousState.viewportCarer),
      contentBoundingRect(previousState.contentBoundingRect),
      contentOffset(MG_NO_OFFSET){};

folly::dynamic MGWishlistState::getDynamic() const {
  auto viewportCarerRef = Wishlist::JNIStateRegistry::getInstance().addValue(
      (void *)&viewportCarer);
  folly::dynamic result = folly::dynamic::object();
  result["viewportCarer"] = viewportCarerRef;
  if (contentOffset != MG_NO_OFFSET) {
    result["contentOffset"] = contentOffset;
  }
  return result;
};

MapBuffer MGWishlistState::getMapBuffer() const {
  auto viewportCarerRef = Wishlist::JNIStateRegistry::getInstance().addValue(
      (void *)&viewportCarer);
  MapBufferBuilder builder;
  builder.putInt(ViewportCarerKey, viewportCarerRef);
  if (contentOffset != MG_NO_OFFSET) {
    builder.putDouble(ContentOffsetKey, contentOffset);
  }
  return builder.build();
};

#endif

} // namespace react
} // namespace facebook
