#import "MGTemplateContainerComponent.h"
#import <react/renderer/components/wishlist/ComponentDescriptors.h>
#import "MGTemplateContainerComponentDescriptor.h"
#import "MGTemplateContainerShadowNode.h"
#import "RCTFabricComponentsPlugins.h"

using namespace facebook::react;

static std::vector<std::string> parseTemplateNames(std::string const &namesJson)
{
  if (namesJson.empty()) {
    return {};
  }

  NSString *jsonString = [NSString stringWithUTF8String:namesJson.c_str()];
  NSData *jsonData = [jsonString dataUsingEncoding:NSUTF8StringEncoding];
  if (!jsonData) {
    return {};
  }

  NSError *error = nil;
  id parsed = [NSJSONSerialization JSONObjectWithData:jsonData options:0 error:&error];
  if (error || ![parsed isKindOfClass:NSArray.class]) {
    return {};
  }

  NSArray *names = (NSArray *)parsed;
  std::vector<std::string> result;
  result.reserve(names.count);
  for (id name in names) {
    if ([name isKindOfClass:NSString.class]) {
      result.emplace_back([(NSString *)name UTF8String]);
    }
  }
  return result;
}

@implementation MGTemplateContainerComponent {
  MGTemplateContainerShadowNode::ConcreteState::Shared _state;
  MGWishListComponent *_wishList;
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const MGTemplateContainerProps>();
    _props = defaultProps;
  }

  return self;
}

- (void)setWishlist:(MGWishListComponent *)wishList
{
  _wishList = wishList;
  [self updateWishlist];
}

#pragma mark - RCTComponentViewProtocol

+ (facebook::react::ComponentDescriptorProvider)componentDescriptorProvider
{
  return facebook::react::concreteComponentDescriptorProvider<
      facebook::react::MGTemplateContainerComponentDescriptor>();
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  [super updateProps:props oldProps:oldProps];
  [self updateWishlist];
}

- (void)updateState:(State::Shared const &)state oldState:(State::Shared const &)oldState
{
  auto templateState = std::static_pointer_cast<MGTemplateContainerShadowNode::ConcreteState const>(state);
  _state = templateState;
  [self updateWishlist];
}

- (void)prepareForRecycle
{
  [super prepareForRecycle];

  _wishList = nil;
  _state.reset();
}

- (void)updateWishlist
{
  if (!_wishList || !_state) {
    return;
  }
  auto props = std::static_pointer_cast<const MGTemplateContainerProps>(_props);
  auto state = std::static_pointer_cast<MGTemplateContainerShadowNode::ConcreteState const>(_state);
  [_wishList setWishlistId:props->wishlistId];
  [_wishList setInflatorId:props->inflatorId];
  [_wishList setTemplates:state->getData().getTemplates() withNames:parseTemplateNames(props->names)];
}

@end

Class<RCTComponentViewProtocol> MGTemplateContainerCls(void)
{
  return MGTemplateContainerComponent.class;
}
