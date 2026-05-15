#pragma once

#include <react/renderer/uimanager/UIManager.h>
#include <stdio.h>
#include <condition_variable>
#include <deque>
#include <iostream>
#include <mutex>
#include <set>
#include "ItemProvider.h"
#include "MGDI.hpp"
#include "MGViewportCarer.hpp"

namespace facebook::react {
class MGWishlistShadowNode;
};

namespace Wishlist {

// TODO make this class testable by injecting componentsPool and itemProvider
// or their factories
class MGViewportCarerImpl final : public MGViewportCarer {
 public:
  MGViewportCarerImpl();
  ~MGViewportCarerImpl();

  void setInitialValues(
      const std::shared_ptr<MGWishlistShadowNode> &wishListNode,
      const LayoutContext &lc);

  void setDI(const std::weak_ptr<MGDI> &_di);

  void setListener(const std::weak_ptr<MGViewportCarerListener> &listener);

  void initialRenderAsync(
      MGDims dimensions,
      float initialContentSize,
      int originItem,
      const std::vector<std::shared_ptr<ShadowNode const>> &registeredViews,
      const std::vector<std::string> &names,
      const std::string &inflatorId) override;

  void didScrollAsync(
      MGDims dimensions,
      float contentOffset,
      const std::string &inflatorId) override;

  void didUpdateContentOffset() override;

  bool isEndReached() const { return endReached_; }

  // Synchronously walks `window_` and `componentsPool_->reusable_` and
  // schedules one batched `dropGestureHandler` JS hop for every shadow
  // node tag they hold. Unlike `~MGViewportCarerImpl` (same walk on
  // destruction) this can be invoked while the carer is still alive —
  // intended for iOS `prepareForRecycle` on `MGWishListComponent`, when
  // Fabric is about to take the wishlist's UIViews and reuse them for an
  // unrelated screen. Idempotent: dropping a tag twice is a no-op on the
  // JS side and on RNGH's native registry.
  void dropAllGestureHandlersNow();

 private:
  struct PendingScroll;
  // Body of the worklet-runtime job posted by `didScrollAsync`. Extracted from
  // the lambda so the UI-thread sync-wait path and the async-scheduled path
  // can share one entry point.
  void processScrollOnWorklet(std::shared_ptr<PendingScroll> pending);

  void updateWindow();

  void updateContentOffset(float contentOffset);

  std::shared_ptr<ShadowNode> getOffseter(float offset);

  void pushChildren(float contentOffset);

  void notifyAboutPushedChildren();

  void notifyAboutStartReached();

  void notifyAboutEndReached();

  float contentOffset_;
  float initialContentSize_;
  float windowHeight_;
  float windowWidth_;
  int surfaceId_;
  // Index passed to `initialRenderAsync`, kept so `didScrollAsync` can retry
  // seeding `window_` on subsequent vsyncs if the very first
  // `provide(originItem)` returned null (inflator/data not yet ready).
  int initialOriginItem_;
  // First worklet pass after `initialRenderAsync` uses a small buffer so the
  // first commit lands fast (one viewport of items); the next pass expands to
  // the steady-state buffer. Without this gate the initial render inflates 3
  // viewports of items before the first commit and the list visibly appears
  // late.
  bool initialBufferFilled_ = false;
  std::string inflatorId_;
  std::shared_ptr<ComponentsPool> componentsPool_;
  std::shared_ptr<ItemProvider> itemProvider_;
  std::deque<WishItem> window_;
  std::shared_ptr<MGWishlistShadowNode> wishListNode_;
  LayoutContext lc_;
  std::weak_ptr<MGDI> di_;
  std::string firstItemKeyForStartReached_;
  std::string lastItemKeyForEndReached_;
  bool endReached_ = false;
  std::weak_ptr<MGViewportCarerListener> listener_;
  bool ignoreScrollEvents_;

  // Scroll-event coalescing: during a fast fling, `onScrollChanged` fires
  // per native frame and every event used to enqueue a separate worklet
  // task. The producer easily out-paced the worklet runtime — pending tasks
  // piled up, processing the most recent offset arrived late, and the UI
  // looked choppy. We now keep at most one pending job; subsequent scroll
  // events just update the latest dimensions/offset/inflator and the
  // already-queued job reads them.
  //
  // Stored in a heap-allocated `PendingScroll` so the queued lambda can hold
  // a shared_ptr to it; the lambda may outlive `*this` (see
  // [[wishlist-viewport-carer-lifetime]] memory) and must not dereference
  // `this` to read the state.
  struct PendingScroll {
    std::mutex mutex;
    std::condition_variable cv;
    bool scheduled = false;
    // Incremented every time the worklet thread finishes an `updateWindow`
    // pass driven by this `PendingScroll`. The UI thread snapshots the value
    // before waiting and checks for a change to know its scroll event landed.
    // A counter (vs. a bool) avoids the lost-wakeup race when the worklet
    // races to completion before the UI thread enters `wait_for`.
    uint64_t completionCounter = 0;
    // Wall-clock duration of the most recent worklet pass, in microseconds.
    // The UI-thread sync-wait path checks this before waiting: if the worklet
    // has been chronically slow (saturated under sustained heavy scrolling),
    // we skip the wait and let things stay async — blocking the UI thread for
    // a full 16ms budget on every event under saturation makes scrolling
    // worse, not better.
    uint64_t lastWorkletDurationMicros = 0;
    MGDims dimensions{0, 0};
    float contentOffset = 0;
    std::string inflatorId;
  };
  std::shared_ptr<PendingScroll> pendingScroll_;
};

} // namespace Wishlist
