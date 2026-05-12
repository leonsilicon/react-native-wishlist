#include "MGTemplateContainerState.h"

#ifdef ANDROID
#include "JNIStateRegistry.h"
#endif

namespace facebook::react {
#ifdef ANDROID
namespace {
constexpr MapBuffer::Key TemplatesKey = 1;
} // namespace
#endif

const std::vector<std::shared_ptr<ShadowNode const>>
    &MGTemplateContainerState::getTemplates() const {
  return templates_;
}

#ifdef ANDROID

folly::dynamic MGTemplateContainerState::getDynamic() const {
  auto templatesRef =
      Wishlist::JNIStateRegistry::getInstance().addValue((void *)&templates_);
  return folly::dynamic::object("templates", templatesRef);
};

MapBuffer MGTemplateContainerState::getMapBuffer() const {
  auto templatesRef =
      Wishlist::JNIStateRegistry::getInstance().addValue((void *)&templates_);
  MapBufferBuilder builder;
  builder.putInt(TemplatesKey, templatesRef);
  return builder.build();
}

#endif

} // namespace facebook::react
