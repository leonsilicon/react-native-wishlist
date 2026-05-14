#include "ItemProvider.h"

#include <react/renderer/uimanager/UIManager.h>
#include <react/renderer/uimanager/primitives.h>
#include "WishlistJsRuntime.h"

namespace Wishlist {

WishItem WorkletItemProvider::provide(
    int index,
    const std::shared_ptr<ShadowNodeBinding> &prevSn) {
  WishItem wishItem;

  auto &rt = WishlistJsRuntime::getInstance().getRuntime();

  // Lazily cache the JS `inflateItem` function and our inflatorId JS string
  // once per provider. Previously every visible item per scroll event paid
  // for three JSI property lookups + a string-from-utf8 allocation on the
  // worklet runtime.
  if (!cachedInflateItem_.has_value()) {
    cachedInflateItem_.emplace(
        rt.global()
            .getPropertyAsObject(rt, "global")
            .getPropertyAsObject(rt, "__wishlistInflatorRegistry")
            .getPropertyAsFunction(rt, "inflateItem"));
  }
  if (!cachedInflatorIdJs_.has_value()) {
    cachedInflatorIdJs_.emplace(jsi::String::createFromUtf8(rt, tag));
  }

  jsi::Value returnedValue;
  try {
    returnedValue = cachedInflateItem_->call(
        rt,
        jsi::Value(rt, *cachedInflatorIdJs_),
        jsi::Value(index),
        cp->prepareProxy(rt),
        prevSn ? jsi::Object::createFromHostObject(rt, prevSn)
               : jsi::Value::null());
  } catch (std::exception &error) {
    di.lock()->getErrorHandler()->reportError(error.what());
    return wishItem;
  }

  if (returnedValue.isUndefined()) {
    return wishItem;
  }

  std::shared_ptr<ShadowNodeBinding> shadowNodeWrapper =
      returnedValue.asObject(rt).getHostObject<ShadowNodeBinding>(rt);

  auto sn = shadowNodeWrapper->getShadowNode();

  auto affected = std::vector<const LayoutableShadowNode *>();
  this->lc.affectedNodes = &affected;
  // better use layoutTree instead of measure (will be persistant)
  std::shared_ptr<YogaLayoutableShadowNode> ysn =
      std::static_pointer_cast<YogaLayoutableShadowNode>(sn->clone({}));
  facebook::react::Size sz = ysn->measure(this->lc, this->lcc);

  wishItem.sn = std::static_pointer_cast<ShadowNode>(ysn);
  wishItem.height = sz.height;
  wishItem.index = index;
  wishItem.key = shadowNodeWrapper->getKey();
  wishItem.type = shadowNodeWrapper->getType();
  return wishItem;
}

}; // namespace Wishlist
