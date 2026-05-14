#include "ShadowNodeBinding.h"

#include "ComponentsPool.h"
#include "WishlistJsRuntime.h"

#include <iostream>

using namespace facebook;
using namespace facebook::react;

namespace Wishlist {

void ShadowNodeBinding::propagateToAncestors(
    std::shared_ptr<ShadowNodeBinding> parent,
    std::shared_ptr<ShadowNode> replacement) {
  while (parent != nullptr) {
    auto &cd = parent->sn_->getComponentDescriptor();
    auto children = parent->sn_->getChildren();
    for (auto &child : children) {
      if (child->getTag() == replacement->getTag()) {
        child = replacement;
        break;
      }
    }
    replacement = cd.cloneShadowNode(
        *(parent->sn_),
        {nullptr,
         std::make_shared<std::vector<std::shared_ptr<const ShadowNode>>>(
             std::move(children))});
    parent->sn_ = replacement;
    parent = parent->parent_;
  }
}

ShadowNodeBinding::ShadowNodeBinding(
    std::shared_ptr<const ShadowNode> sn,
    std::weak_ptr<ComponentsPool> wcp,
    const std::string &type,
    const std::string &key)
    : sn_(std::move(sn)),
      wcp_(std::move(wcp)),
      parent_(nullptr),
      type_(type),
      key_(key) {}

ShadowNodeBinding::ShadowNodeBinding(
    std::shared_ptr<const ShadowNode> sn,
    std::weak_ptr<ComponentsPool> wcp,
    std::shared_ptr<ShadowNodeBinding> parent)
    : sn_(std::move(sn)),
      wcp_(std::move(wcp)),
      parent_(std::move(parent)),
      type_(parent_->type_),
      key_(parent_->key_) {}

std::string ShadowNodeBinding::getType() const {
  return type_;
}

std::string ShadowNodeBinding::getKey() const {
  return key_;
}

std::shared_ptr<ShadowNode const> ShadowNodeBinding::getShadowNode() const {
  return sn_;
}

void ShadowNodeBinding::describe(
    std::stringstream &ss,
    const std::shared_ptr<const ShadowNode> n,
    int level) {
  for (auto i = 0; i < level; ++i) {
    ss << " ";
  }
  ss << n->getComponentName();
  if (n->getProps()->nativeId.length() > 0) {
    ss << " (" << n->getProps()->nativeId << ")";
  }
#if DEBUG
  ss << " " << n->getProps()->getDebugDescription();
#endif
  ss << "\n";
  for (auto child : n->getChildren()) {
    describe(ss, child, level + 2);
  }
};

std::shared_ptr<ShadowNodeBinding> ShadowNodeBinding::findNodeByWishId(
    const std::string &nativeId,
    std::shared_ptr<ShadowNodeBinding> p) {
  for (auto child : p->sn_->getChildren()) {
    // Create binding
    auto bc = std::make_shared<ShadowNodeBinding>(child, wcp_, p);

    // Test against native id
    if (child->getProps()->nativeId == nativeId) {
      return bc;
    }

    // Test child's children
    auto binding = findNodeByWishId(nativeId, bc);
    if (binding != nullptr) {
      return binding;
    }
  }
  return nullptr;
}

Value ShadowNodeBinding::get(Runtime &rt, const PropNameID &nameProp) {
  std::string name = nameProp.utf8(rt);

  if (name == "setCallback") {
    return jsi::Function::createFromHostFunction(
        rt,
        nameProp,
        1,
        [=](jsi::Runtime &rt,
            jsi::Value const &thisValue,
            jsi::Value const *args,
            size_t count) -> jsi::Value {
          std::string callbackName = args[0].asString(rt).utf8(rt);
          int tag = sn_->getTag();
          // Must stay in sync with `EventHandler.ts` (WISHLIST_HANDLER_KEY_SEP):
          // plain `to_string(tag) + name` is unsafe for `dropHandlers`, which uses
          // prefix deletes — e.g. tag -100 would also remove keys for -1000.
          std::string eventName =
              std::to_string(tag) + std::string("\x1f") + callbackName;
          jsi::Function callback = args[1].asObject(rt).asFunction(rt);

          auto handlerRegistry = rt.global()
                                     .getPropertyAsObject(rt, "global")
                                     .getPropertyAsObject(rt, "handlers");
          handlerRegistry.setProperty(rt, eventName.c_str(), callback);

          return jsi::Value::undefined();
        });
  }

  if (name == "addProps") {
    return jsi::Function::createFromHostFunction(
        rt,
        nameProp,
        1,
        [=](jsi::Runtime &rt,
            jsi::Value const &thisValue,
            jsi::Value const *args,
            size_t count) -> jsi::Value {
          // Cached on first use: previously every prop bind per item per scroll
          // resolved `global.global.__wishlistInflatorRegistry.processProps`
          // afresh, paying for three JSI property lookups + a function value
          // copy each time.
          auto &processProps =
              WishlistJsRuntime::getInstance().getProcessPropsFn(rt);
          auto props = processProps.call(rt, args[0]);
          RawProps rawProps(rt, props);

          auto &cd = sn_->getComponentDescriptor();

          PropsParserContext propsParserContext{
              sn_->getFamily().getSurfaceId(), *cd.getContextContainer().get()};

          auto nextProps = cd.cloneProps(
              propsParserContext, sn_->getProps(), std::move(rawProps));

          auto clonedShadowNode = cd.cloneShadowNode(
              *sn_,
              {
                  nextProps,
                  nullptr,
              });

          sn_ = clonedShadowNode;
          propagateToAncestors(parent_, clonedShadowNode);

          return jsi::Value::undefined();
        });
  }

  if (name == "setChildren") {
    return jsi::Function::createFromHostFunction(
        rt,
        nameProp,
        1,
        [=](jsi::Runtime &rt,
            jsi::Value const &thisValue,
            jsi::Value const *args,
            size_t count) -> jsi::Value {
          if (!args[0].isObject() or !args[0].getObject(rt).isArray(rt)) {
            return jsi::Value::undefined();
          }
          jsi::Array subItems = args[0].asObject(rt).asArray(rt);

          auto &cd = sn_->getComponentDescriptor();

          auto newChildren =
              std::make_shared<std::vector<std::shared_ptr<const ShadowNode>>>();

          // Items in `subItems` come from `pool.getComponent(type)`, which
          // already returns a fresh deep-copy of the registered template (with
          // unique negative react tags). Re-copying here would generate yet
          // another set of tags, and the nested `ShadowNodeBinding`s (e.g. a
          // `Wishlist.Pressable` inside the child template) still point at the
          // pre-copy shadow nodes — so callbacks and gesture handlers registered
          // against the binding's tag never reach the mounted UIView (RNGH on
          // iOS looks the view up via the new tag and finds nothing). Reuse the
          // bindings' existing shadow nodes directly to keep the tags stable
          // through to mount.
          for (int i = 0; i < subItems.size(rt); ++i) {
            std::shared_ptr<ShadowNodeBinding> child =
                subItems.getValueAtIndex(rt, i)
                    .getObject(rt)
                    .getHostObject<ShadowNodeBinding>(rt);
            newChildren->push_back(child->sn_);
            child->parent_ = shared_from_this();
          }

          auto clonedShadowNode = cd.cloneShadowNode(
              *sn_,
              {
                  nullptr,
                  newChildren,
              });

          if (auto cp = wcp_.lock()) {
            for (const auto &oldChild : sn_->getChildren()) {
              cp->returnToPool(oldChild);
            }
          }

          sn_ = clonedShadowNode;
          propagateToAncestors(parent_, clonedShadowNode);

          return jsi::Value::undefined();
        });
  }

  if (name == "getName") {
    return jsi::Function::createFromHostFunction(
        rt,
        nameProp,
        1,
        [=](jsi::Runtime &rt,
            jsi::Value const &thisValue,
            jsi::Value const *args,
            size_t count) -> jsi::Value {
          return jsi::String::createFromUtf8(rt, sn_->getComponentName());
        });
  }

  if (name == "describe") {
    return jsi::Function::createFromHostFunction(
        rt,
        nameProp,
        1,
        [=](jsi::Runtime &rt,
            jsi::Value const &thisValue,
            jsi::Value const *args,
            size_t count) -> jsi::Value {
          std::stringstream ss;
          describe(ss, sn_, 0);
          return jsi::String::createFromUtf8(rt, ss.str());
        });
  }

  if (name == "getByWishId") { // TODO(Szymon) That can be optimised to O(depth)
    // when template preprocessing
    return jsi::Function::createFromHostFunction(
        rt,
        nameProp,
        1,
        [=](jsi::Runtime &rt,
            jsi::Value const &thisValue,
            jsi::Value const *args,
            size_t count) -> jsi::Value {
          auto binding = findNodeByWishId(
              args[0].asString(rt).utf8(rt), shared_from_this());
          if (binding != nullptr) {
            return jsi::Object::createFromHostObject(rt, binding);
          }

          return jsi::Value::undefined();
        });
  }

  if (name == "at") {
    return jsi::Function::createFromHostFunction(
        rt,
        nameProp,
        1,
        [=](jsi::Runtime &rt,
            jsi::Value const &thisValue,
            jsi::Value const *args,
            size_t count) -> jsi::Value {
          int index = (int)(args[0].getNumber());
          std::string type = sn_->getComponentName();

          int i = 0;

          for (auto sibiling : parent_->sn_->getChildren()) {
            if (sibiling->getComponentName() == type) {
              if (i == index) {
                return jsi::Object::createFromHostObject(
                    rt,
                    std::make_shared<ShadowNodeBinding>(
                        sibiling, wcp_, parent_));
              }
              i++;
            }
          }

          return jsi::Value::undefined();
        });
  }

  if (name == "getTag") {
    return jsi::Function::createFromHostFunction(
        rt,
        nameProp,
        0,
        [=](jsi::Runtime &rt,
            jsi::Value const &thisValue,
            jsi::Value const *args,
            size_t count) -> jsi::Value { return jsi::Value(sn_->getTag()); });
  }

  if (name == "key") {
    return jsi::String::createFromUtf8(rt, key_);
  }

  if (name == "type") {
    return jsi::String::createFromUtf8(rt, type_);
  }

  for (auto child : sn_->getChildren()) {
    if (child->getComponentName() == name) {
      return jsi::Object::createFromHostObject(
          rt,
          std::make_shared<ShadowNodeBinding>(child, wcp_, shared_from_this()));
    }
  }

  return jsi::Value::undefined();
}

void ShadowNodeBinding::set(
    Runtime &rt,
    const PropNameID &name,
    const Value &value) {
  std::string str = name.utf8(rt);
  if (str == "key") {
    key_ = value.asString(rt).utf8(rt);
  } else if (str == "type") {
    type_ = value.asString(rt).utf8(rt);
  }
}

}; // namespace Wishlist
