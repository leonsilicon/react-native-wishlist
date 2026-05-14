#include "ComponentsPool.h"

#include <iostream>

#include "WishlistJsRuntime.h"

using namespace facebook::react;
using namespace jsi;

namespace Wishlist {

void collectShadowNodeTags(
    const ShadowNode &node,
    std::vector<int> &out) {
  out.push_back(node.getTag());
  for (const auto &child : node.getChildren()) {
    collectShadowNodeTags(*child, out);
  }
}

void dropGestureHandlerTags(std::shared_ptr<std::vector<int>> tags) {
  if (tags == nullptr || tags->empty()) {
    return;
  }
  WishlistJsRuntime::getInstance().accessRuntime(
      [tags = std::move(tags)](jsi::Runtime &rt) {
        try {
          auto *f =
              WishlistJsRuntime::getInstance().getDropGestureHandlerFn(rt);
          if (f == nullptr) {
            return;
          }
          for (int tag : *tags) {
            f->call(rt, tag);
          }
        } catch (...) {
          // Ignore
        }
      });
}

void ComponentsPool::setNames(const std::vector<std::string> &names) {
  nameToIndex_.clear();
  for (int i = 0; i < names.size(); ++i) {
    nameToIndex_[names[i]] = i;
  }
}

void ComponentsPool::setRegisteredViews(
    std::vector<std::shared_ptr<ShadowNode const>> registeredViews) {
  registeredViews_ = std::move(registeredViews);
}

void ComponentsPool::returnToPool(std::shared_ptr<ShadowNode const> sn) {
  if (sn == nullptr) {
    return;
  }
  reusable_[tagToType_[sn->getTag()]].push_back(sn);

  auto dropTags = std::make_shared<std::vector<int>>();
  collectShadowNodeTags(*sn, *dropTags);
  dropGestureHandlerTags(std::move(dropTags));
}

void ComponentsPool::returnToPoolWithoutDrop(
    std::shared_ptr<ShadowNode const> sn,
    std::vector<int> &dropTags) {
  if (sn == nullptr) {
    return;
  }
  reusable_[tagToType_[sn->getTag()]].push_back(sn);
  collectShadowNodeTags(*sn, dropTags);
}

void ComponentsPool::collectAllReusableTags(std::vector<int> &outTags) {
  for (auto &entry : reusable_) {
    for (const auto &sn : entry.second) {
      if (sn != nullptr) {
        collectShadowNodeTags(*sn, outTags);
      }
    }
  }
}

void ComponentsPool::templatesUpdated() {
  // optimise by reusing some of elements if they are
  // the same
  tagToType_.clear();
  reusable_.clear();
}

std::shared_ptr<ShadowNode const> ComponentsPool::getNodeForType(const std::string &type) {
  if (reusable_[type].size() > 0) {
    auto res = reusable_[type].back();
    reusable_[type].pop_back();
    auto deepCopy = ShadowNodeCopyMachine::copyShadowSubtree(res);
    tagToType_[deepCopy->getTag()] = type;
    return deepCopy;
  }

  auto templateNode = registeredViews_[nameToIndex_[type]];
  auto deepCopy = ShadowNodeCopyMachine::copyShadowSubtree(templateNode);
  tagToType_[deepCopy->getTag()] = type;
  return deepCopy;
}

jsi::Object ComponentsPool::prepareProxy(jsi::Runtime &rt) {
  if (proxy_ == nullptr) {
    proxy_ = std::static_pointer_cast<jsi::HostObject>(
        std::make_shared<ComponentsPool::Proxy>(shared_from_this()));
  }
  return jsi::Object::createFromHostObject(rt, proxy_);
}

ComponentsPool::Proxy::Proxy(std::weak_ptr<ComponentsPool> wcp) : wcp(wcp) {}

Value ComponentsPool::Proxy::get(Runtime &rt, const PropNameID &nameProp) {
  std::string name = nameProp.utf8(rt);

  if (name == "getComponent") {
    std::weak_ptr<ComponentsPool> blockWcp = this->wcp;
    return jsi::Function::createFromHostFunction(
        rt,
        nameProp,
        1,
        [blockWcp](
            Runtime &rt, const Value &thisVal, const Value *args, size_t count)
            -> Value {
          std::string type = args[0].asString(rt).utf8(rt);
          auto sn = blockWcp.lock()->getNodeForType(type);

          return jsi::Object::createFromHostObject(
              rt, std::make_shared<ShadowNodeBinding>(sn, blockWcp, type, ""));
        });
  }

  return jsi::Value::undefined();
}

void ComponentsPool::Proxy::set(
    Runtime &rt,
    const PropNameID &name,
    const Value &value) {
  throw jsi::JSError(rt, "set hasn't been implemented yet");
}

}; // namespace Wishlist
