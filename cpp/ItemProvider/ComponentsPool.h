#pragma once

#include <react/renderer/core/ConcreteComponentDescriptor.h>
#include <stdio.h>
#include <map>
#include <memory>
#include <sstream>
#include "ShadowNodeBinding.h"
#include "ShadowNodeCopyMachine.h"

using namespace facebook::react;
using namespace facebook::jsi;

namespace Wishlist {

// Walks `node` and its descendants, appending each tag to `out`.
void collectShadowNodeTags(const ShadowNode &node, std::vector<int> &out);

// Posts a single JS-thread job that calls `global.dropGestureHandler(tag)` for
// every tag in `tags`. Coalesces drops so callers only pay one runtime hop.
void dropGestureHandlerTags(std::shared_ptr<std::vector<int>> tags);

class ComponentsPool : public std::enable_shared_from_this<ComponentsPool> {
 public:
  void setNames(const std::vector<std::string> &names);

  void setRegisteredViews(std::vector<std::shared_ptr<ShadowNode const>> registeredViews);

  void returnToPool(std::shared_ptr<ShadowNode const> sn);

  void templatesUpdated();

  std::shared_ptr<ShadowNode const> getNodeForType(const std::string &type);

  Object prepareProxy(Runtime &rt);

  class Proxy : public HostObject {
   public:
    std::weak_ptr<ComponentsPool> wcp;

    Proxy(std::weak_ptr<ComponentsPool> wcp);

    virtual Value get(Runtime &rt, const PropNameID &nameProp);

    virtual void set(Runtime &rt, const PropNameID &name, const Value &value);
  };

 private:
  std::map<std::string, int> nameToIndex_;
  std::map<int, std::string> tagToType_;
  std::map<std::string, std::vector<std::shared_ptr<ShadowNode const>>> reusable_;
  std::vector<std::shared_ptr<ShadowNode const>> registeredViews_;
  std::shared_ptr<HostObject> proxy_;
};

}; // namespace Wishlist
