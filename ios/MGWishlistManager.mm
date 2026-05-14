#import "MGWishlistManager.h"

#import <objc/runtime.h>
#import <React/RCTBridge+Private.h>
#import <React/RCTBridge.h>
#import <React/RCTComponentViewFactory.h>
#import <React/RCTScheduler.h>
#import <React/RCTSurfacePresenter.h>
#import <React/RCTSurfacePresenterStub.h>
#import <ReactCommon/RCTTurboModule.h>
#include <jsi/JSIDynamic.h>
#include <jsi/jsi.h>
#include <react/renderer/components/view/ViewEventEmitter.h>
#include <react/renderer/core/EventListener.h>
#include <react/renderer/core/ShadowNodeFamily.h>
#include <worklets/Compat/Holders.h>
#include <worklets/WorkletRuntime/WorkletRuntime.h>
#include "MGContentContainerComponent.h"
#include "MGObjCJSIUtils.h"
#include "MGTemplateContainerComponent.h"
#include "MGTemplateInterceptorComponent.h"
#include "MGUIManagerHolder.h"
#import "MGWishListComponent.h"
#import "MGWishlistQueue.h"
#include "WishlistJsRuntime.h"

using namespace facebook::react;
using namespace Wishlist;

@interface MGWishlistManager () <RCTEventDispatcherObserver>

@property (nonatomic, weak) RCTBridge *bridge;

@end

@implementation MGWishlistManager {
  __weak RCTSurfacePresenter *_surfacePresenter;
  std::shared_ptr<EventListener> _eventListener;
  dispatch_queue_t _wishlistQueue;
}

RCT_EXPORT_MODULE(WishlistManager);

+ (void)initialize
{
  if (self != [MGWishlistManager class]) {
    return;
  }
  RCTComponentViewFactory *factory = [RCTComponentViewFactory currentComponentViewFactory];
  [factory registerComponentViewClass:[MGWishListComponent class]];
  [factory registerComponentViewClass:[MGTemplateContainerComponent class]];
  [factory registerComponentViewClass:[MGTemplateInterceptorComponent class]];
  [factory registerComponentViewClass:[MGContentContainerComponent class]];
}

- (void)setBridge:(RCTBridge *)bridge
{
  _bridge = bridge;
  __weak __typeof(self) weakSelf = self;
  _eventListener = std::make_shared<EventListener>([weakSelf](const RawEvent &event) -> bool {
    __typeof(self) strongSelf = weakSelf;
    if (!strongSelf) {
      return false;
    }
    return [strongSelf handleFabricEvent:event];
  });
  // In bridgeless mode the real surface presenter arrives via
  // `setSurfacePresenter:` — the eventListener and UIManager hook-up happen
  // there. In the legacy bridge path we still see a usable presenter here.
  RCTSurfacePresenter *presenter = (RCTSurfacePresenter *)_bridge.surfacePresenter;
  if ([presenter isKindOfClass:[RCTSurfacePresenter class]]) {
    _surfacePresenter = presenter;
    [_surfacePresenter.scheduler addEventListener:_eventListener];
    MGUIManagerHolder::getInstance().setUIManager(_surfacePresenter.scheduler.uiManager);
  }

  [[bridge.moduleRegistry moduleForName:"EventDispatcher" lazilyLoadIfNecessary:YES] addDispatchObserver:self];
}

- (void)installWishlistRuntime
{
  RCTCxxBridge *cxxBridge = (RCTCxxBridge *)_bridge;
  auto callInvoker = cxxBridge.jsCallInvoker;
  facebook::jsi::Runtime *jsRuntime = (facebook::jsi::Runtime *)cxxBridge.runtime;

  // Install a JSI helper that lets the JS side hand us the worklets UI runtime
  // (obtained via `getUIRuntimeHolder()` from `react-native-worklets`). We
  // unwrap the C++ `worklets::WorkletRuntime` from its NativeState holder and
  // use its JSI runtime as `WishlistJsRuntime`, so native and JS share global
  // state. Without this the registry/handlers installed on the UI runtime are
  // invisible to wishlist's native code.
  auto setupWishlistRuntime = [callInvoker](
                                  facebook::jsi::Runtime &rt,
                                  const facebook::jsi::Value & /*thisVal*/,
                                  const facebook::jsi::Value *args,
                                  size_t count) -> facebook::jsi::Value {
    if (count < 1 || !args[0].isObject()) {
      throw facebook::jsi::JSError(
          rt, "MGWishlistManager._setWishlistContext expects a worklet runtime holder");
    }
    auto holderObj = args[0].asObject(rt);
    if (!holderObj.hasNativeState<worklets::WorkletRuntimeHolder>(rt)) {
      throw facebook::jsi::JSError(
          rt,
          "MGWishlistManager._setWishlistContext: argument is not a WorkletRuntimeHolder");
    }
    auto workletRuntime = holderObj.getNativeState<worklets::WorkletRuntimeHolder>(rt)->runtime_;
    facebook::jsi::Runtime &workletJsiRuntime = workletRuntime->getJSIRuntime();
    std::weak_ptr<worklets::WorkletRuntime> workletRuntimeWeak = workletRuntime;
    Wishlist::WishlistJsRuntime::getInstance().initialize(
        &workletJsiRuntime,
        [=](std::function<void()> &&f) { callInvoker->invokeAsync(std::move(f)); },
        [=](std::function<void()> &&f) {
          __block auto retainedWork = std::move(f);
          MGExecuteOnWishlistQueue(^{
            retainedWork();
          });
        },
        [workletRuntimeWeak](std::function<void(facebook::jsi::Runtime &)> &&job) {
          if (auto strong = workletRuntimeWeak.lock()) {
            strong->schedule(std::move(job));
          }
        });
    return facebook::jsi::Value::undefined();
  };

  jsRuntime->global().setProperty(
      *jsRuntime,
      "__mgWishlistSetContext",
      facebook::jsi::Function::createFromHostFunction(
          *jsRuntime,
          facebook::jsi::PropNameID::forAscii(*jsRuntime, "__mgWishlistSetContext"),
          1,
          setupWishlistRuntime));

  // In bridgeless mode RN sets the real surface presenter on us via
  // `setSurfacePresenter:` (separately from `setBridge:`), which also seeds
  // `MGUIManagerHolder`. Capture again here as a fallback for the legacy
  // bridge path — the scheduler's uiManager is finally wired up by the time
  // JS reaches `install()`.
  if (_surfacePresenter != nil) {
    if (MGUIManagerHolder::getInstance().getUIManager() == nullptr) {
      MGUIManagerHolder::getInstance().setUIManager(_surfacePresenter.scheduler.uiManager);
    }
  }
}

- (void)eventDispatcherWillDispatchEvent:(id<RCTEvent>)event
{
  [self handlePaperEvent:event];
}

- (bool)handleFabricEvent:(const RawEvent &)event
{
  std::string type = event.type;

  auto shadowNodeFamily = event.shadowNodeFamily.lock();
  if (shadowNodeFamily == nullptr) {
    return event.eventTarget != nullptr;
  }

  int tag = shadowNodeFamily->getTag();
  if (tag >= 0) {
    // Some RN 0.83 Fabric events can have no instance handle. If we let those
    // continue through the default event queue, RN crashes when retaining the
    // target or mixing the JS `target` into the payload.
    return shadowNodeFamily->getInstanceHandle() == nullptr;
  }

  if (event.eventTarget == nullptr) {
    return false;
  }

  auto eventPayload = event.eventPayload;
  WishlistJsRuntime::getInstance().accessRuntime([=](jsi::Runtime &rt) {
    jsi::Value payload = eventPayload ? eventPayload->asJSIValue(rt) : jsi::Value::null();
    [self sendEventWithType:jsi::String::createFromUtf8(rt, type) tag:tag payload:payload];
  });

  return true;
}

- (void)handlePaperEvent:(id<RCTEvent>)event
{
  NSNumber *tag = event.viewTag;
  NSString *type = event.eventName;

  WishlistJsRuntime::getInstance().accessRuntime([=](jsi::Runtime &rt) {
    [self sendEventWithType:jsi::String::createFromUtf8(rt, [type UTF8String])
                        tag:tag.intValue
                    payload:convertObjCObjectToJSIValue(rt, event.arguments[2])];
  });
}

- (void)sendEventWithType:(const jsi::String &)type tag:(int)tag payload:(const jsi::Value &)payload
{
  auto &rt = WishlistJsRuntime::getInstance().getRuntime();
  try {
    auto global = rt.global().getPropertyAsObject(rt, "global");
    if (global.hasProperty(rt, "handleEvent")) {
      auto f = global.getPropertyAsFunction(rt, "handleEvent");
      f.call(rt, type, tag, payload);
    }
  } catch (std::exception &error) {
    RCTLogError(@"%@", [NSString stringWithUTF8String:error.what()]);
  }
}

- (void)initialize
{
}

// In bridgeless mode RN calls this method on the TurboModule with the
// real surface presenter (the one set on `RCTBridge` is unusable here). We
// keep this reference and re-attach the wishlist event listener / refresh the
// cached UIManager.
- (void)setSurfacePresenter:(id<RCTSurfacePresenterStub>)surfacePresenter
{
  _surfacePresenter = (RCTSurfacePresenter *)surfacePresenter;

  // Ensure the event listener exists (setBridge: may not have set it up under
  // bridgeless mode).
  if (_eventListener == nullptr) {
    __weak __typeof(self) weakSelf = self;
    _eventListener = std::make_shared<EventListener>([weakSelf](const RawEvent &event) -> bool {
      __typeof(self) strongSelf = weakSelf;
      if (!strongSelf) {
        return false;
      }
      return [strongSelf handleFabricEvent:event];
    });
  }

  RCTScheduler *scheduler = _surfacePresenter.scheduler;
  if (scheduler != nil) {
    [scheduler addEventListener:_eventListener];
    MGUIManagerHolder::getInstance().setUIManager(scheduler.uiManager);
  }
}

- (void)invalidate
{
  [_surfacePresenter.scheduler removeEventListener:_eventListener];
}

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(install)
{
  // Wire up `WishlistJsRuntime` to the worklets UI runtime now that JS has
  // started (so `globalThis.__workletsModuleProxy` is available). This must
  // happen before any wishlist component mounts.
  [self installWishlistRuntime];
  return @true;
}

- (std::shared_ptr<TurboModule>)getTurboModule:(const ObjCTurboModule::InitParams &)params
{
  return std::make_shared<NativeWishlistManagerSpecJSI>(params);
}

@end

@implementation MGWishlistComponentManager

RCT_EXPORT_MODULE(MGWishlist)

RCT_CUSTOM_VIEW_PROPERTY(inflatorId, NSString *, UIView) {}
RCT_CUSTOM_VIEW_PROPERTY(initialIndex, double, UIView) {}

RCT_EXPORT_VIEW_PROPERTY(onStartReached, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onEndReached, RCTDirectEventBlock)

- (UIView *)view
{
  return [[UIView alloc] init];
}

@end

@implementation MGTemplateContainerManager

RCT_EXPORT_MODULE(MGTemplateContainer)

RCT_CUSTOM_VIEW_PROPERTY(inflatorId, NSString *, UIView) {}

RCT_CUSTOM_VIEW_PROPERTY(wishlistId, NSString *, UIView) {}

RCT_CUSTOM_VIEW_PROPERTY(names, NSArray<NSString *> *, UIView) {}

- (UIView *)view
{
  return [[UIView alloc] init];
}

@end

@implementation MGTemplateInterceptorManager

RCT_EXPORT_MODULE(MGTemplateInterceptor)

RCT_CUSTOM_VIEW_PROPERTY(inflatorId, NSString *, UIView) {}

- (UIView *)view
{
  return [[UIView alloc] init];
}

@end

@implementation MGContentContainerManager

RCT_EXPORT_MODULE(MGContentContainerManager)

- (UIView *)view
{
  return [[UIView alloc] init];
}

@end
