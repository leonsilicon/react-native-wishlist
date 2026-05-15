#pragma once

#include <react/renderer/components/view/ConcreteViewShadowNode.h>
#include <react/renderer/graphics/Rect.h>

#ifdef ANDROID
#include <folly/dynamic.h>
#include <react/renderer/mapbuffer/MapBuffer.h>
#include <react/renderer/mapbuffer/MapBufferBuilder.h>
#endif

#include "ComponentsPool.h"
#include "MGViewportCarerImpl.h"

using namespace Wishlist;

namespace facebook {
namespace react {

// class WishlistShadowNode;

/*
 * State for <ScrollView> component.
 */
class JSI_EXPORT MGWishlistState final {
 public:
  bool initialised;
  std::shared_ptr<MGViewportCarerImpl> viewportCarer;
  Rect contentBoundingRect;
  float contentOffset;
  // Bumped every time `MGViewportCarerImpl::pushChildren` writes a real
  // `contentOffset` (i.e. excluding `MG_NO_OFFSET` no-op pushes). The view
  // side compares the seen seq with the last-applied seq to decide whether
  // to actually call `setContentOffset`/`scrollTo`. Without this, the
  // sticky `contentOffset` field would replay on every unrelated state
  // commit (`updateStateIfNeeded` round-trips through `getStateData`/
  // `setStateData` and preserves it), yanking the scroll mid-fling.
  uint32_t contentOffsetSeq;

  MGWishlistState();

#ifdef ANDROID
  MGWishlistState(MGWishlistState const &previousState, folly::dynamic data);
  folly::dynamic getDynamic() const;
  MapBuffer getMapBuffer() const;
#endif
};

} // namespace react
} // namespace facebook
