#include "MGViewportCarerImpl.h"

#include <chrono>
#include <iostream>

#include "MGContentContainerShadowNode.h"
#include "MGUIManagerHolder.h"
#include "MGWishlistShadowNode.h"
#include "WishlistDefine.h"
#include "WishlistJsRuntime.h"

namespace Wishlist {

using namespace facebook::react;

MGViewportCarerImpl::MGViewportCarerImpl()
    : contentOffset_(0),
      initialContentSize_(0),
      windowHeight_(0),
      windowWidth_(0),
      surfaceId_(0),
      initialOriginItem_(0),
      componentsPool_(std::make_shared<ComponentsPool>()),
      ignoreScrollEvents_(false),
      pendingScroll_(std::make_shared<PendingScroll>()) {}

MGViewportCarerImpl::~MGViewportCarerImpl() {
  // Collect every tag still held by this wishlist into a single batch, then
  // post one JS-thread job. The destructor runs on whatever thread releases
  // the last shared_ptr (often UI during screen navigation away), so doing
  // the tree walk inline + one async hop keeps the navigation transition
  // smooth.
  //
  // We MUST also walk `componentsPool_->reusable_`: items that scrolled out
  // of the window earlier had their tags dropped, but items returned via
  // `returnToPool` that are still parked in the reusable pool have RNGH
  // handlers attached and `global.handlers[tag\x1fonGestureHandlerStateChange]`
  // entries alive. Without flushing them here, those stale handlers can fire
  // on a later screen (the listener is global, see `Pressable.tsx`) and
  // invoke press worklets that captured state from this dead screen.
  auto dropTags = std::make_shared<std::vector<int>>();
  for (const auto &item : window_) {
    if (item.sn != nullptr) {
      collectShadowNodeTags(*item.sn, *dropTags);
    }
  }
  if (componentsPool_ != nullptr) {
    componentsPool_->collectAllReusableTags(*dropTags);
  }
  dropGestureHandlerTags(std::move(dropTags));
}

void MGViewportCarerImpl::dropAllGestureHandlersNow() {
  // Same walk as `~MGViewportCarerImpl`. Called from iOS
  // `MGWishListComponent::prepareForRecycle` so handlers are removed before
  // Fabric reuses the Pressable UIViews on an unrelated screen. The carer
  // itself stays alive — if the wishlist remounts (react-navigation
  // re-attach), a later `addProps` worklet will re-attach handlers from
  // scratch via `attachGestureHandlersBatch`.
  auto dropTags = std::make_shared<std::vector<int>>();
  for (const auto &item : window_) {
    if (item.sn != nullptr) {
      collectShadowNodeTags(*item.sn, *dropTags);
    }
  }
  if (componentsPool_ != nullptr) {
    componentsPool_->collectAllReusableTags(*dropTags);
  }
  dropGestureHandlerTags(std::move(dropTags));
}

void MGViewportCarerImpl::setDI(const std::weak_ptr<MGDI> &di) {
  di_ = di;
}

void MGViewportCarerImpl::setListener(
    const std::weak_ptr<MGViewportCarerListener> &listener) {
  listener_ = listener;
}

void MGViewportCarerImpl::setInitialValues(
    const std::shared_ptr<MGWishlistShadowNode> &wishListNode,
    const LayoutContext &lc) {
  wishListNode_ = wishListNode;
  lc_ = lc;
}

void MGViewportCarerImpl::initialRenderAsync(
    MGDims dimensions,
    float initialContentSize,
    int originItem,
    const std::vector<std::shared_ptr<ShadowNode const>> &registeredViews,
    const std::vector<std::string> &names,
    const std::string &inflatorId) {
  WishlistJsRuntime::getInstance().accessRuntime([=](jsi::Runtime &rt) {
    componentsPool_->setRegisteredViews(registeredViews);
    componentsPool_->setNames(names);

    itemProvider_ = std::static_pointer_cast<ItemProvider>(
        std::make_shared<WorkletItemProvider>(
            di_, dimensions.width, lc_, inflatorId));
    itemProvider_->setComponentsPool(componentsPool_);

    surfaceId_ = wishListNode_->getFamily().getSurfaceId();
    initialContentSize_ = initialContentSize;
    contentOffset_ = initialContentSize / 2;
    windowHeight_ = dimensions.height;
    windowWidth_ = dimensions.width;
    inflatorId_ = inflatorId;
    initialOriginItem_ = originItem;

    // Refuse to seed `window_` with a null-sn item. `WorkletItemProvider::provide`
    // returns a default-constructed `WishItem` (sn=nullptr, index=0, height=0)
    // when the JS inflator reports the requested index doesn't exist yet — e.g.
    // because the data binding hasn't propagated, the inflator was just
    // unregistered during HMR, or the user's `__at(originItem)` is transiently
    // undefined. Pushing that placeholder corrupts the window: `window_[0].index`
    // becomes 0 (not `originItem`), and every subsequent `updateWindow` either
    // hits the same null on retry (if the data is genuinely empty, fine) or
    // tries to walk indices around 0 instead of around `originItem` (broken).
    // Skip the seed entirely; the next vsync's `didScrollAsync` will retry via
    // `handleVSync` once the inflator and data are ready.
    WishItem seed = itemProvider_->provide(originItem, nullptr);
    if (seed.sn == nullptr) {
      return;
    }
    window_.push_back(seed);
    window_.back().offset = initialContentSize / 2;
    updateWindow();
  });
}

void MGViewportCarerImpl::didScrollAsync(
    MGDims dimensions,
    float contentOffset,
    const std::string &inflatorId) {
#if MG_WISHLIST_DEBUG
  static int scrollEventId = 0;
  int currentScrollEventId = scrollEventId++;
  std::cout << "didScrollAsync UI {eventId: " << currentScrollEventId
            << ", contentOffset: " << contentOffset << "}" << std::endl;
#endif

  // Coalesce: store the latest scroll state and only enqueue a worklet job
  // if one isn't already pending. This caps queued work at one regardless of
  // how fast native scroll events fire. The queued job re-reads the latest
  // state from the shared PendingScroll when it actually runs.
  //
  // `pendingScroll_` is heap-owned so the lambda can hold its own
  // `shared_ptr` — the lambda can outlive `*this`
  // (see [[wishlist-viewport-carer-lifetime]]).
  auto pending = pendingScroll_;
  bool shouldSchedule = false;
  uint64_t baselineCompletion = 0;
  uint64_t lastDurationMicros = 0;
  {
    std::lock_guard<std::mutex> lock(pending->mutex);
    pending->dimensions = dimensions;
    pending->contentOffset = contentOffset;
    pending->inflatorId = inflatorId;
    baselineCompletion = pending->completionCounter;
    lastDurationMicros = pending->lastWorkletDurationMicros;
    if (!pending->scheduled) {
      pending->scheduled = true;
      shouldSchedule = true;
    }
  }

  if (shouldSchedule) {
    WishlistJsRuntime::getInstance().accessRuntime(
        [this, pending](jsi::Runtime &rt) { processScrollOnWorklet(pending); });
  }

  // Sync-wait gate. Three conditions to bail:
  //  1. `contentOffset == MG_NO_OFFSET` — this is a VSync re-entry triggered
  //     from the worklet runtime itself (see `MGDataBindingImpl` →
  //     `requestVSync` → `handleVSync` → `didScrollAsync(MG_NO_OFFSET)`).
  //     Waiting on the worklet to signal us from the worklet thread would
  //     deadlock. Only real UI-thread scroll events carry an offset.
  //  2. The worklet's most recent pass exceeded the budget. Blocking here on
  //     a saturated worklet just burns the full timeout on every event and
  //     makes scrolling worse, not better.
  constexpr auto kSyncCatchUpBudget = std::chrono::milliseconds(16);
  constexpr uint64_t kSaturationThresholdMicros = 12'000;
  if (contentOffset == MG_NO_OFFSET ||
      lastDurationMicros > kSaturationThresholdMicros) {
    return;
  }

  // Wait briefly for the worklet pass to land so the next frame draws fresh
  // content. If it doesn't land in time we fall through and accept one frame
  // of staleness rather than a hang.
  std::unique_lock<std::mutex> lock(pending->mutex);
  pending->cv.wait_for(lock, kSyncCatchUpBudget, [&] {
    return pending->completionCounter != baselineCompletion;
  });
}

void MGViewportCarerImpl::processScrollOnWorklet(
    std::shared_ptr<PendingScroll> pending) {
  // Signal completion on EVERY exit path (including early returns for
  // missing di/itemProvider/etc.) so a UI thread blocked in `wait_for`
  // unblocks immediately instead of paying the full budget timeout. Also
  // records the elapsed time so the UI thread can decide whether the worklet
  // is keeping up well enough to be worth waiting for on the next event.
  struct CompletionNotifier {
    std::shared_ptr<PendingScroll> pending;
    std::chrono::steady_clock::time_point start =
        std::chrono::steady_clock::now();
    ~CompletionNotifier() {
      auto durationMicros =
          std::chrono::duration_cast<std::chrono::microseconds>(
              std::chrono::steady_clock::now() - start)
              .count();
      {
        std::lock_guard<std::mutex> lock(pending->mutex);
        ++pending->completionCounter;
        pending->lastWorkletDurationMicros =
            static_cast<uint64_t>(durationMicros);
      }
      pending->cv.notify_all();
    }
  } notifier{pending};

  MGDims dimensions;
  float contentOffset;
  std::string inflatorId;
  {
    std::lock_guard<std::mutex> lock(pending->mutex);
    dimensions = pending->dimensions;
    contentOffset = pending->contentOffset;
    inflatorId = pending->inflatorId;
    pending->scheduled = false;
  }

  if (ignoreScrollEvents_) {
    return;
  }

  if (itemProvider_ == nullptr) {
    return;
  }

  auto di = di_.lock();
  if (di == nullptr) {
    return;
  }
  auto dataBinding = di->getDataBinding();
  if (dataBinding == nullptr) {
    return;
  }

  if (dimensions.width != windowWidth_ || inflatorId != inflatorId_) {
    itemProvider_ = std::static_pointer_cast<ItemProvider>(
        std::make_shared<WorkletItemProvider>(
            di_, dimensions.width, lc_, inflatorId));
    itemProvider_->setComponentsPool(componentsPool_);
    windowWidth_ = dimensions.width;
    inflatorId_ = inflatorId;
  } else if (!window_.empty()) {
    std::set<int> dirty = dataBinding->applyChangesAndGetDirtyIndices(
        {window_[0].index, window_.back().index});
    for (auto &item : window_) {
      if (dirty.count(item.index) > 0) {
        item.dirty = true;
      }
    }
  }

  // MG_NO_OFFSET means that we keep the current offset.
  if (contentOffset != MG_NO_OFFSET) {
    contentOffset_ = contentOffset;
  }
  windowHeight_ = dimensions.height;

  // Window can be empty when `initialRenderAsync` refused to seed (its
  // `provide(originItem)` returned null because the inflator/data wasn't
  // ready yet). Retry the seed here on every scroll/vsync until it
  // succeeds — otherwise the carer is permanently stuck and the user sees
  // an empty wishlist with no recovery path.
  if (window_.empty()) {
    WishItem seed = itemProvider_->provide(initialOriginItem_, nullptr);
    if (seed.sn == nullptr) {
      return;
    }
    window_.push_back(seed);
    window_.back().offset = initialContentSize_ / 2;
  }

  updateWindow();
}

void MGViewportCarerImpl::didUpdateContentOffset() {
  WishlistJsRuntime::getInstance().accessRuntime([=](jsi::Runtime &rt) {
#if MG_WISHLIST_DEBUG
    std::cout << "didUpdateContentOffset BG" << std::endl;
#endif
    ignoreScrollEvents_ = false;
  });
}

void MGViewportCarerImpl::updateWindow() {
  // Render `kBufferViewports` viewport-heights above and below the visible
  // region. Sized to keep each pass fast enough that the UI-thread sync-wait
  // gate in `didScrollAsync` stays under its saturation threshold — that gate
  // is the primary defense against blanks under rapid successive swipes, and
  // a bigger buffer here trips it and disables sync help.
  //
  // On the very first pass after `initialRenderAsync` we use a smaller buffer
  // so the first commit lands fast (visible viewport only); the next pass
  // expands to steady-state. `initialRenderAsync` schedules that follow-up
  // expansion via `requestVSync`.
  constexpr float kBufferViewports = 3.0f;
  constexpr float kInitialBufferViewports = 0.0f;
  float bufferViewports =
      initialBufferFilled_ ? kBufferViewports : kInitialBufferViewports;
  float topEdge = contentOffset_ - bufferViewports * windowHeight_;
  float bottomEdge =
      contentOffset_ + (1.0f + bufferViewports) * windowHeight_;
  bool startReached = false;
  endReached_ = false;
  bool changed = false;

  assert(!window_.empty());

#if MG_WISHLIST_DEBUG
  std::cout << "updateWindow {contentOffset: " << contentOffset_
            << ", topEdge: " << topEdge << ", bottomEdge: " << bottomEdge << "}"
            << std::endl;
  std::cout << "before:" << std::endl;
  for (auto &item : window_) {
    std::cout << "{key: " << item.key << ", offset: " << item.offset
              << ", height: " << item.height << "}" << std::endl;
  }
#endif

  // Re-provide every dirty item with up-to-date data.
  //
  // Anchoring rule: the FIRST item's bottom stays where it was (so items
  // visually below it don't jump when the first item's height changes —
  // chat-style "anchor at bottom" behavior). Every subsequent dirty item is
  // laid out continuously below its predecessor. The previous code applied
  // `currentOffset - (newH - oldH)` to every dirty item, but that formula
  // only anchors correctly when `currentOffset` equals the item's OLD
  // offset — true for the first item, NOT true for any item after it (since
  // by then `currentOffset` is the prior item's NEW bottom). The result was
  // a layout discontinuity proportional to the dirty item's old height
  // every time a non-first item was dirty.
  //
  // Bug also fixed: when a dirty item's `provide` returned null we used
  // `continue`, which skipped the `currentOffset = item.offset + item.height`
  // advance at the bottom of the loop. Subsequent iterations then computed
  // offsets against a stale `currentOffset`. Now we always advance.
  bool isFirstItem = true;
  float currentOffset = window_[0].offset;
  for (auto &item : window_) {
    if (item.dirty) {
      std::shared_ptr<ShadowNodeBinding> prevSn = nullptr;
      if (item.sn) {
        prevSn = std::make_shared<ShadowNodeBinding>(
            item.sn, componentsPool_, item.type, item.key);
      }
      WishItem wishItem = itemProvider_->provide(item.index, prevSn);
      if (wishItem.sn != nullptr) {
        if (item.sn && wishItem.sn && item.sn->getTag() != wishItem.sn->getTag()) {
          componentsPool_->returnToPool(item.sn);
        }
        swap(item.sn, wishItem.sn);
        if (isFirstItem) {
          // Anchor first item's bottom in place.
          item.offset = currentOffset - (wishItem.height - item.height);
        } else {
          // Lay out continuously below the previous item.
          item.offset = currentOffset;
        }
        item.height = wishItem.height;
        item.type = wishItem.type;
        item.key = wishItem.key;
        item.dirty = false;
        changed = true;
      }
      // If `provide` returned null we leave the item as-is and still advance
      // `currentOffset` so later iterations see the correct predecessor bottom.
    }
    currentOffset = item.offset + item.height;
    isFirstItem = false;
  }

  // Add above
  while (true) {
    WishItem item = window_.front();

    if (item.offset > topEdge) {
      WishItem wishItem = itemProvider_->provide(item.index - 1, nullptr);
      if (wishItem.sn == nullptr) {
        startReached = true;
        break;
      }
      wishItem.offset = item.offset - wishItem.height;
      window_.push_front(wishItem);
      changed = true;
    } else {
      break;
    }
  }

  // Add below
  while (true) {
    WishItem item = window_.back();
    float bottom = item.offset + item.height;

    if (bottom < bottomEdge) {
      WishItem wishItem = itemProvider_->provide(item.index + 1, nullptr);
      if (wishItem.sn == nullptr) {
        endReached_ = true;
        break;
      }
      wishItem.offset = bottom;
      window_.push_back(wishItem);
      changed = true;
    } else {
      break;
    }
  }

  std::vector<WishItem> itemsToRemove;

  // remove above — keep at least one item so window_ is never empty
  while (window_.size() > 1) {
    WishItem item = window_.front();
    float bottom = item.offset + item.height;
    if (bottom <= topEdge) {
      window_.pop_front();
      itemsToRemove.push_back(item);
      changed = true;
      continue;
    } else {
      break;
    }
  }

  // remove below — keep at least one item so window_ is never empty
  while (window_.size() > 1) {
    WishItem item = window_.back();
    if (item.offset >= bottomEdge) {
      window_.pop_back();
      itemsToRemove.push_back(item);
      changed = true;
      continue;
    } else {
      break;
    }
  }

  // Bail out early if no changes to the window.
  if (!changed) {
    return;
  }

  // This will be used to adjust scroll position to maintain the visible content
  // position.
  float contentOffsetAdjustment = 0;

  // If the window's first item went negative (add-above outran the spacer),
  // shift everything so window starts at 0 (or at initialContentSize_/2 when
  // there are still items above to load — that keeps the offsetter big
  // enough for future upward scrolls). Only do this when the front actually
  // became negative; firing this branch speculatively whenever front.offset
  // is 0 (the common state right after items get popped during a downward
  // fling) bounces the native ScrollView by ±initialContentSize_/2 and the
  // user lands back at the top mid-fling.
  if (window_.front().offset < 0) {
    float newFrontOffset = startReached ? 0.0f : initialContentSize_ / 2;
    contentOffsetAdjustment += newFrontOffset - window_.front().offset;
    float newOffset = newFrontOffset;
    for (auto &item : window_) {
      item.offset = newOffset;
      newOffset = newOffset + item.height;
    }
  }

  // We reached the start of the list and still have extra offset above the
  // first item — remove it so the content size is exact and the list stops
  // scrolling correctly at the very top.
  if (startReached && window_.front().offset > 0) {
    contentOffsetAdjustment -= window_.front().offset;

    float newOffset = 0;
    for (auto &item : window_) {
      item.offset = newOffset;
      newOffset = newOffset + item.height;
    }
  }

  if (contentOffsetAdjustment != 0) {
    contentOffset_ += contentOffsetAdjustment;
    ignoreScrollEvents_ = true;
#if MG_WISHLIST_DEBUG
    std::cout << "updateWindow adjust content offset {adjustment: "
              << contentOffsetAdjustment << ", offset: " << contentOffset_
              << "}" << std::endl;
#endif
  }

  pushChildren(contentOffsetAdjustment != 0 ? contentOffset_ : MG_NO_OFFSET);

  // Batch drop: collect every gesture-handler tag from every item leaving the
  // viewport in this `updateWindow` pass, then fire ONE `accessRuntime` hop
  // for the whole batch. The unbatched form (one `returnToPool` → one
  // `accessRuntime` per item) used to cost N JS-thread schedules per fling
  // step, starving the scroll on Android.
  if (!itemsToRemove.empty()) {
    auto dropTags = std::make_shared<std::vector<int>>();
    for (auto &item : itemsToRemove) {
      componentsPool_->returnToPoolWithoutDrop(item.sn, *dropTags);
    }
    dropGestureHandlerTags(std::move(dropTags));
  }

  if (startReached) {
    auto firstItemKey = window_.front().key;
    if (firstItemKey != firstItemKeyForStartReached_) {
      notifyAboutStartReached();
      firstItemKeyForStartReached_ = firstItemKey;
    }
  } else {
    firstItemKeyForStartReached_ = "";
  }
  if (endReached_) {
    auto lastItemKey = window_.back().key;
    if (lastItemKey != lastItemKeyForEndReached_) {
      notifyAboutEndReached();
      lastItemKeyForEndReached_ = lastItemKey;
    }
  } else {
    lastItemKeyForEndReached_ = "";
  }

#if MG_WISHLIST_DEBUG
  std::cout << "after:" << std::endl;
  for (auto &item : window_) {
    std::cout << "{key: " << item.key << ", offset: " << item.offset
              << ", height: " << item.height << "}" << std::endl;
  }
#endif

  // First pass committed with the visible viewport only — schedule a follow-up
  // pass so the steady-state buffer fills in before the user scrolls. Request
  // via the orchestrator's vsync hook (rather than directly calling
  // `updateWindow` here) so the larger pass doesn't extend the current
  // commit's latency.
  if (!initialBufferFilled_) {
    initialBufferFilled_ = true;
    if (auto di = di_.lock()) {
      if (auto vsr = di->getVSyncRequester()) {
        vsr->requestVSync();
      }
    }
  }
}

std::shared_ptr<ShadowNode> MGViewportCarerImpl::getOffseter(float offset) {
  std::shared_ptr<const YogaLayoutableShadowNode> offseterTemplate =
      std::static_pointer_cast<const YogaLayoutableShadowNode>(
          componentsPool_->getNodeForType("__offsetComponent"));

  auto &cd = offseterTemplate->getComponentDescriptor();
  PropsParserContext propsParserContext{
      surfaceId_, *cd.getContextContainer().get()};

  // todo remove color
  folly::dynamic props = folly::dynamic::object;
  props["height"] = offset;
  props["width"] = windowWidth_;
  props["backgroundColor"] = 0x00001111;

  Props::Shared newProps = cd.cloneProps(
      propsParserContext, offseterTemplate->getProps(), RawProps(props));

  return offseterTemplate->clone({newProps, nullptr, nullptr});
}

void MGViewportCarerImpl::pushChildren(float contentOffset) {
  std::shared_ptr<ShadowNode> sWishList = wishListNode_;
  if (sWishList == nullptr) {
    // Carer's owning shadow node is gone. If we'd flagged
    // `ignoreScrollEvents_=true` upstream, nothing will ever clear it because
    // there'll be no `updateState`/`didUpdateContentOffset` cycle from the
    // view side. Recover here so a subsequent (post-remount) scroll isn't
    // silently dropped.
    if (contentOffset != MG_NO_OFFSET) {
      ignoreScrollEvents_ = false;
    }
    return;
  }

  auto uiManager = MGUIManagerHolder::getInstance().getUIManager();
  if (uiManager == nullptr) {
    if (contentOffset != MG_NO_OFFSET) {
      ignoreScrollEvents_ = false;
    }
    return;
  }

  bool committed = false;
  uiManager->getShadowTreeRegistry().visit(surfaceId_, [&](const ShadowTree &st) {
    ShadowTreeCommitTransaction transaction =
        [&](RootShadowNode const &oldRootShadowNode)
        -> std::shared_ptr<RootShadowNode> {
      return std::static_pointer_cast<RootShadowNode>(
          oldRootShadowNode.cloneTree(
              sWishList->getFamily(),
              [&](const ShadowNode &sn) -> std::shared_ptr<ShadowNode> {
                auto children =
                    std::make_shared<std::vector<std::shared_ptr<const ShadowNode>>>();

                children->push_back(getOffseter(window_[0].offset));

                for (WishItem &wishItem : window_) {
                  if (wishItem.sn != nullptr) {
                    children->push_back(wishItem.sn);
                  }
                }

                auto contentContainer = std::static_pointer_cast<
                    const MGContentContainerShadowNode>(
                    sn.getChildren()[0]);

                // TODO: This solution seems a little bit hacky still.
                // We need to update most recent state before creating
                // cloning the shadow node as it will be used to initialize
                // children.
                auto stateData =
                    std::make_shared<MGContentContainerState>(children);
                auto state = std::make_shared<
                    MGContentContainerShadowNode::ConcreteState>(
                    stateData, *contentContainer->getState());
                contentContainer->getFamily().setMostRecentState(state);

                auto newContentContainer =
                    std::static_pointer_cast<MGContentContainerShadowNode>(
                        contentContainer->clone(
                            {nullptr, children, nullptr}));

                newContentContainer->setWishlistChildren(children);

                auto wishlistChildren =
                    std::make_shared<std::vector<std::shared_ptr<const ShadowNode>>>(
                        std::vector<std::shared_ptr<const ShadowNode>>{newContentContainer});

                auto newWishlistSn =
                    std::static_pointer_cast<MGWishlistShadowNode>(
                        sn.clone(ShadowNodeFragment{
                            nullptr, wishlistChildren, nullptr}));

                newWishlistSn->updateContentOffset(contentOffset);

                return newWishlistSn;
              }));
    };
    auto status = st.commit(transaction, {});
    committed = (status == ShadowTree::CommitStatus::Succeeded);
  });

  // If we set `ignoreScrollEvents_=true` upstream but the commit didn't go
  // through (commit conflict, surface gone, etc.), there is no view-side
  // `updateState` to ever clear it via `didUpdateContentOffset`. Without
  // this rescue every subsequent scroll event is dropped at the worklet
  // level and the user sees a frozen, unscrollable list.
  if (!committed && contentOffset != MG_NO_OFFSET) {
    ignoreScrollEvents_ = false;
  }

  notifyAboutPushedChildren();
}

// TODO That could cause a lag we may need to push it through state
void MGViewportCarerImpl::notifyAboutPushedChildren() {
  auto listener = listener_.lock();
  if (listener != nullptr) {
    std::vector<Item> newWindow;
    newWindow.reserve(window_.size());
    for (auto &item : window_) {
      newWindow.push_back({item.offset, item.height, item.index, item.key});
    }
    di_.lock()->getUIScheduler()->scheduleOnUI(
        [newWindow = std::move(newWindow), listener]() {
          listener->didPushChildren(newWindow);
        });
    WishlistJsRuntime::getInstance().accessRuntime([=](jsi::Runtime &rt) {
      try {
        // Cached on first use to avoid the three JSI property lookups every
        // viewport-carer push (i.e. every scroll-induced item change).
        auto &didPushChildren =
            WishlistJsRuntime::getInstance().getDidPushChildrenFn(rt);
        didPushChildren.call(rt, 0);
      } catch (jsi::JSError &e) {
        std::cout << "[Wishlist][didPushChildren] JS error: "
                  << e.getMessage() << "\n"
                  << e.getStack() << std::endl;
      } catch (std::exception &e) {
        std::cout << "[Wishlist][didPushChildren] native exception: "
                  << e.what() << std::endl;
      }
    });
  }
}

void MGViewportCarerImpl::notifyAboutStartReached() {
  wishListNode_->getConcreteEventEmitter().onStartReached({});
}

void MGViewportCarerImpl::notifyAboutEndReached() {
  wishListNode_->getConcreteEventEmitter().onEndReached({});
}

}; // namespace Wishlist
