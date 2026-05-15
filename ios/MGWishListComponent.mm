#import "MGWishListComponent.h"
#import <React/RCTConversions.h>
#import <React/RCTImageResponseDelegate.h>
#import <React/RCTImageResponseObserverProxy.h>

#import <React/RCTBridgeModule.h>
#import <React/RCTComponentViewFactory.h>
#import <react/renderer/components/rncore/EventEmitters.h>
#import <react/renderer/components/rncore/Props.h>
#include <react/renderer/components/wishlist/Props.h>
#include <react/renderer/components/wishlist/ShadowNodes.h>
#import "MGOrchestrator.h"
#import "MGWishlistComponentDescriptor.h"
#import "RCTFabricComponentsPlugins.h"
#include "WishlistDefine.h"

#define MG_INITIAL_CONTENT_SIZE 100000

using namespace facebook::react;

@interface RCTScrollViewComponentView (MGWishList)

- (void)scrollViewDidScroll:(UIScrollView *)sv;
- (void)scrollViewWillEndDragging:(UIScrollView *)sv
                     withVelocity:(CGPoint)velocity
              targetContentOffset:(inout CGPoint *)targetContentOffset;

@end

@implementation MGWishListComponent {
  MGWishlistShadowNode::ConcreteState::Shared _state;
  std::string _inflatorId;
  std::string _wishlistId;
  MGOrchestrator *_orchestrator;
  std::shared_ptr<const MGWishlistEventEmitter> _emitter;
  int _initialIndex;
  BOOL _ignoreScrollEvents;
  // Sequence of the last `data.contentOffsetSeq` we acted on. State commits
  // for unrelated reasons (contentBoundingRect changed, child relayout, …)
  // replay the same sticky `data.contentOffset` because `MGWishlistState`
  // round-trips it through `getStateData`/`setStateData` in
  // `updateStateIfNeeded`. Without this guard, a stale commit would yank
  // the scrollView mid-fling back to a value the user already scrolled past.
  // We still call `didUpdateContentOffset` even when we skip the actual
  // `setContentOffset`, so the C++ `ignoreScrollEvents_` always unblocks.
  uint32_t _lastAppliedContentOffsetSeq;
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    self.clipsToBounds = YES;
    self.scrollView.showsVerticalScrollIndicator = NO;
    self.scrollView.clipsToBounds = YES;
    _ignoreScrollEvents = NO;
    _lastAppliedContentOffsetSeq = 0;
  }
  return self;
}

- (void)mountChildComponentView:(UIView<RCTComponentViewProtocol> *)childComponentView index:(NSInteger)index
{
  [super mountChildComponentView:childComponentView index:index];
}

- (void)setInflatorId:(std::string)nextInflatorId
{
  _inflatorId = nextInflatorId;
}

- (void)setWishlistId:(std::string)wishlistId
{
  _wishlistId = wishlistId;
}

- (BOOL)scrollViewShouldScrollToTop:(UIScrollView *)scrollView
{
  [self scrollToItem:0 animated:YES]; // Maybe it would be better to scroll to initial (which is not always 0)
  return NO;
}

- (void)setTemplates:(std::vector<std::shared_ptr<facebook::react::ShadowNode const>>)templates
           withNames:(std::vector<std::string>)names
{
  if (!_orchestrator) {
    self.scrollView.contentSize = CGSizeMake(self.frame.size.width, MG_INITIAL_CONTENT_SIZE);
    self.scrollView.contentOffset = CGPointMake(0, MG_INITIAL_CONTENT_SIZE / 2);

    std::shared_ptr<MGViewportCarerImpl> viewportCarer = _state->getData().viewportCarer;
    _orchestrator = [[MGOrchestrator alloc] initWith:self wishlistId:_wishlistId viewportCarer:viewportCarer];
  }

  [_orchestrator
      renderAsyncWithDimensions:{(float)self.scrollView.frame.size.width, (float)self.scrollView.frame.size.height}
             initialContentSize:MG_INITIAL_CONTENT_SIZE
                   initialIndex:_initialIndex
                      templates:templates
                          names:names
                     inflatorId:_inflatorId];
}

#pragma mark - RCTComponentViewProtocol

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<MGWishlistComponentDescriptor>();
}

#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wobjc-missing-super-calls"
- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  std::shared_ptr<const MGWishlistProps> wProps = std::static_pointer_cast<const MGWishlistProps>(props);
  _initialIndex = wProps->initialIndex;

  _props = wProps;
}
#pragma clang diagnostic pop

- (void)updateState:(State::Shared const &)state oldState:(State::Shared const &)oldState
{
  // Updating content size or offset can trigger scroll events but we do not want to
  // process those as they can have invalid offset or were already processed.
  _ignoreScrollEvents = YES;

  assert(std::dynamic_pointer_cast<MGWishlistShadowNode::ConcreteState const>(state));
  _state = std::static_pointer_cast<MGWishlistShadowNode::ConcreteState const>(state);
  auto &data = _state->getData();

  CGSize contentSize = RCTCGSizeFromSize(data.contentBoundingRect.size);
  CGRect contentFrame = CGRect{RCTCGPointFromPoint(data.contentBoundingRect.origin), contentSize};
  // `containerView` (from RCTScrollViewComponentView) is the actual subview of
  // the UIScrollView that holds all mounted descendants. Without sizing it,
  // UIKit hit-testing rejects every touch because the container's frame stays
  // at {0,0,0,0} (rendering still works because Core Animation draws unclipped
  // descendants regardless, but `hitTest:` returns nil outside `bounds`). The
  // inherited `contentView` setter is unrelated — RCTViewComponentView's
  // `contentView` is a different property.
  self.containerView.frame = contentFrame;
  self.contentView.frame = contentFrame;
  self.scrollView.contentSize = contentSize;

#if MG_WISHLIST_DEBUG
  std::cout << "updateState {offset: " << data.contentOffset << ", contentHeight: " << contentSize.height << "}"
            << std::endl;
#endif

  if (data.contentOffset != MG_NO_OFFSET) {
    // Apply only fresh `contentOffset` writes (seq advanced past the last we
    // acted on). The sticky `contentOffset` would otherwise replay on every
    // unrelated state commit and yank the scrollView mid-fling. We still
    // call `didUpdateContentOffset` even when we skip the actual scroll, so
    // C++'s `ignoreScrollEvents_` always unblocks.
    if (data.contentOffsetSeq != _lastAppliedContentOffsetSeq) {
      _lastAppliedContentOffsetSeq = data.contentOffsetSeq;
      [self.scrollView setContentOffset:{0, data.contentOffset} animated:NO];
    }
    data.viewportCarer->didUpdateContentOffset();
  }

  _ignoreScrollEvents = NO;
}

#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wobjc-missing-super-calls"
- (void)updateEventEmitter:(EventEmitter::Shared const &)eventEmitter
{
  _emitter = std::static_pointer_cast<MGWishlistEventEmitter const>(eventEmitter);
}
#pragma clang diagnostic pop

- (void)scrollViewDidScroll:(UIScrollView *)scrollView
{
  if (_ignoreScrollEvents) {
    return;
  }

  [_orchestrator didScrollAsyncWithDimensions:{(float)scrollView.frame.size.width, (float)scrollView.frame.size.height}
                                contentOffset:scrollView.contentOffset.y
                                   inflatorId:_inflatorId];
}

- (void)scrollViewWillEndDragging:(UIScrollView *)scrollView
                     withVelocity:(CGPoint)velocity
              targetContentOffset:(inout CGPoint *)targetContentOffset
{
  // Cap the predicted deceleration landing offset to a maximum displacement
  // from the current position. UIScrollView will decelerate to that closer
  // point at a proportionally lower effective velocity, which keeps the JS
  // worklet renderer able to produce frames fast enough to avoid blanks.
  // Flutter lists feel "speed-limited" the same way; user trades peak fling
  // distance for guaranteed content. Deliberately not calling `super`: the
  // sibling `scrollViewDidScroll` override here also doesn't, and the parent
  // (RCTScrollViewComponentView) provides no behavior we'd want layered on.
  //
  // The upward cap is tighter than the downward one: upward flings reveal
  // the transparent offsetter (app background showing through) as soon as the
  // prepend loop falls behind, while downward flings just delay reaching the
  // unseen tail of the rendered window. A more aggressive upward clamp keeps
  // peak velocity low enough that the worklet always lands before the user
  // outpaces the rendered front.
  static const CGFloat kMaxFlingDownDisplacement = 1600.0f;
  static const CGFloat kMaxFlingUpDisplacement = 900.0f;
  CGFloat dy = targetContentOffset->y - scrollView.contentOffset.y;
  if (dy > kMaxFlingDownDisplacement) {
    targetContentOffset->y =
        scrollView.contentOffset.y + kMaxFlingDownDisplacement;
  } else if (dy < -kMaxFlingUpDisplacement) {
    targetContentOffset->y =
        scrollView.contentOffset.y - kMaxFlingUpDisplacement;
  }
}

- (void)prepareForRecycle
{
  // Drop every gesture handler the wishlist attached BEFORE Fabric pulls
  // this component's child Pressable UIViews into the recycle pool. RNGH
  // attaches `UIGestureRecognizer`s directly to UIViews and writes
  // `view.reactTag` as an associated object that survives `prepareForRecycle`;
  // if a recognizer is still attached when Fabric reuses the view for an
  // unrelated screen, tapping that view fires the stale recognizer →
  // DeviceEventEmitter → wishlist runtime → original `onPress`. We can't rely
  // on `~MGViewportCarerImpl` for this because `MGWishlistState` keeps the
  // carer alive past view recycle, and `react-native-screens`-style detach
  // (the common navigation case) recycles wishlist views without unmounting
  // the React component (so `markWishlistDead` doesn't run either).
  if (_state) {
    auto viewportCarer = _state->getData().viewportCarer;
    if (viewportCarer != nullptr) {
      viewportCarer->dropAllGestureHandlersNow();
    }
  }
  _state.reset();
  _orchestrator = nil;
  _lastAppliedContentOffsetSeq = 0;
  [super prepareForRecycle];
}

- (void)setBridge:(RCTBridge *)bridge
{
  // TODO here you can intercept uiManager by registering fake surface
  // bridge.surfacePresentsr
}

- (void)handleCommand:(const NSString *)commandName args:(const NSArray *)args
{
  RCTMGWishlistHandleCommand(self, commandName, args);
}

- (void)scrollToItem:(NSInteger)index animated:(BOOL)animated
{
  if (animated && _orchestrator != nil) {
    [_orchestrator scrollToItem:index];
  }

  if (!animated) {
    // TODO (restart Wishlist with different initial index)
  }
}

@end

Class<RCTComponentViewProtocol> MGWishlistCls(void)
{
  return MGWishListComponent.class;
}
