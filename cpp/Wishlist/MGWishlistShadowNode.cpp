#include "MGWishlistShadowNode.h"

namespace facebook {
namespace react {

extern const char MGWishlistComponentName[] = "MGWishlist";

void MGWishlistShadowNode::layout(LayoutContext layoutContext) {
  auto state = getStateData();
  if (!state.initialised) {
    state.initialised = true;
    state.viewportCarer->setInitialValues(shared_from_this(), layoutContext);

    setStateData(std::move(state));
  }

  ConcreteViewShadowNode::layout(layoutContext);

  // TODO update viewportObserver if needed

  updateStateIfNeeded();
}

void MGWishlistShadowNode::updateStateIfNeeded() {
  ensureUnsealed();

  auto contentBoundingRect = Rect{};
  for (const auto &childNode : getLayoutableChildNodes()) {
    contentBoundingRect.unionInPlace(childNode->getLayoutMetrics().frame);
  }

  auto state = getStateData();

  if (state.viewportCarer && !state.viewportCarer->isEndReached()) {
      contentBoundingRect.unionInPlace(Rect{0, 0, 0, 100000});
  }

  if (state.contentBoundingRect != contentBoundingRect) {
    state.contentBoundingRect = contentBoundingRect;
    setStateData(std::move(state));
  }
}

void MGWishlistShadowNode::updateContentOffset(float contentOffset) {
  ensureUnsealed();

  auto state = getStateData();
  state.contentOffset = contentOffset;
  // Bump the seq only on real (non-sentinel) writes — `MG_NO_OFFSET` is a
  // "no-op, don't scroll" signal. The view side compares seq with its
  // last-applied seq to avoid re-yanking scroll on unrelated state commits.
  if (contentOffset != MG_NO_OFFSET) {
    state.contentOffsetSeq++;
  }
  setStateData(std::move(state));
}

} // namespace react
} // namespace facebook
