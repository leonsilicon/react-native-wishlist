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
constexpr MapBuffer::Key ContentBoundsWidthKey = 3;
constexpr MapBuffer::Key ContentBoundsHeightKey = 4;
} // namespace
#endif

MGWishlistState::MGWishlistState()
    : initialised(false),
      viewportCarer(std::make_shared<MGViewportCarerImpl>()),
      contentBoundingRect({}),
      contentOffset(MG_NO_OFFSET),
      contentOffsetSeq(0){};

#ifdef ANDROID

MGWishlistState::MGWishlistState(
    MGWishlistState const &previousState,
    folly::dynamic data)
    : initialised(previousState.initialised),
      viewportCarer(previousState.viewportCarer),
      contentBoundingRect(previousState.contentBoundingRect),
      contentOffset(MG_NO_OFFSET),
      contentOffsetSeq(previousState.contentOffsetSeq){};

namespace {
constexpr MapBuffer::Key ContentOffsetSeqKey = 5;
} // namespace

folly::dynamic MGWishlistState::getDynamic() const {
  auto viewportCarerRef = Wishlist::JNIStateRegistry::getInstance().addValue(
      (void *)&viewportCarer);
  folly::dynamic result = folly::dynamic::object();
  result["viewportCarer"] = viewportCarerRef;
  if (contentOffset != MG_NO_OFFSET) {
    result["contentOffset"] = contentOffset;
    result["contentOffsetSeq"] = (double)contentOffsetSeq;
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
    builder.putInt(ContentOffsetSeqKey, (int)contentOffsetSeq);
  }
  // Same scrollable extent as iOS `MGWishListComponent` `updateState` (content
  // bounding rect, including virtual padding while not end-reached). Android
  // `ReactScrollView` infers range from the content child height only; without
  // this, the scrollbar hits the bottom while more items are still virtualized.
  builder.putDouble(ContentBoundsWidthKey, contentBoundingRect.size.width);
  builder.putDouble(ContentBoundsHeightKey, contentBoundingRect.size.height);
  return builder.build();
};

#endif

} // namespace react
} // namespace facebook
