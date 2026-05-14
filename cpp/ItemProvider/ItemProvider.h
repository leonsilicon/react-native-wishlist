#pragma once

#include <jsi/jsi.h>
#include <react/renderer/uimanager/primitives.h>
#include <stdio.h>
#include <memory>
#include <optional>
#include "ComponentsPool.h"
#include "MGDI.hpp"

using namespace facebook::react;

namespace Wishlist {

struct WishItem {
  float offset;
  int index;
  std::string key;
  std::string type;
  float height;
  bool dirty = false;
  std::shared_ptr<ShadowNode> sn;
};

class ItemProvider {
 public:
  float maxWidth = 0;
  LayoutConstraints lcc;
  LayoutContext lc;

  ItemProvider(float maxWidth, LayoutContext lc) {
    this->maxWidth = maxWidth;
    this->lc = lc;
    lcc.layoutDirection = facebook::react::LayoutDirection::LeftToRight;
    lcc.maximumSize.width = maxWidth;
  }

  virtual void setComponentsPool(std::shared_ptr<ComponentsPool> pool) = 0;

  virtual WishItem provide(
      int index,
      const std::shared_ptr<ShadowNodeBinding> &prevSn) = 0;

  virtual ~ItemProvider() {}
};

struct WorkletItemProvider : ItemProvider {
  std::shared_ptr<ComponentsPool> cp;
  std::string tag;
  std::weak_ptr<MGDI> di;
  // Cached JSI references — these are populated on the worklet runtime on the
  // first `provide` call and reused for every item inflation thereafter. The
  // worklet runtime outlives any single provider, so reuse is safe.
  std::optional<facebook::jsi::Function> cachedInflateItem_;
  std::optional<facebook::jsi::String> cachedInflatorIdJs_;

  WorkletItemProvider(
      std::weak_ptr<MGDI> di,
      float maxWidth,
      LayoutContext lc,
      std::string tag)
      : ItemProvider(maxWidth, lc), di(di) {
    this->tag = tag;
  }

  void setComponentsPool(std::shared_ptr<ComponentsPool> pool) override {
    cp = pool;
  }

  WishItem provide(int index, const std::shared_ptr<ShadowNodeBinding> &prevSn)
      override;
};

}; // namespace Wishlist
