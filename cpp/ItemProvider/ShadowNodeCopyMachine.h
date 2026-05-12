#pragma once

#include <jsi/jsi.h>
#include <react/renderer/components/view/ConcreteViewShadowNode.h>
#include <react/renderer/components/wishlist/Props.h>
#include <react/renderer/core/InstanceHandle.h>
#include <react/renderer/core/LayoutConstraints.h>
#include <react/renderer/core/LayoutContext.h>
#include <react/renderer/core/ShadowNodeFamily.h>
#include <stdio.h>
#include <iostream>

using namespace facebook;
using namespace facebook::react;

namespace Wishlist {

class ShadowNodeCopyMachine {
 public:
  static std::shared_ptr<ShadowNode> copyShadowSubtree(
      const std::shared_ptr<const ShadowNode> &sn);
  };

  }; // namespace Wishlist
