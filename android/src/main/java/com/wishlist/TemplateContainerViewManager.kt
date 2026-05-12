package com.wishlist

import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.ReactStylesDiffMap
import com.facebook.react.uimanager.StateWrapper
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewGroupManager
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.viewmanagers.MGTemplateContainerManagerDelegate
import com.facebook.react.viewmanagers.MGTemplateContainerManagerInterface
import org.json.JSONArray

@ReactModule(name = TemplateContainerViewManager.REACT_CLASS)
class TemplateContainerViewManager :
    ViewGroupManager<TemplateContainer>(), MGTemplateContainerManagerInterface<TemplateContainer> {
  companion object {
    const val REACT_CLASS = "MGTemplateContainer"
  }

  override fun getName() = REACT_CLASS

  override fun createViewInstance(reactContext: ThemedReactContext) =
      TemplateContainer(reactContext)

  override fun getDelegate() = MGTemplateContainerManagerDelegate(this)

  override fun updateState(
      view: TemplateContainer,
      props: ReactStylesDiffMap?,
      stateWrapper: StateWrapper?
  ): Any? {
    view.stateWrapper = stateWrapper
    view.updateWishlist()
    return null
  }

  override fun onAfterUpdateTransaction(view: TemplateContainer) {
    super.onAfterUpdateTransaction(view)
    view.updateWishlist()
  }

  @ReactProp(name = "inflatorId")
  override fun setInflatorId(view: TemplateContainer, value: String?) {
    view.inflatorId = value
  }

  @ReactProp(name = "wishlistId")
  override fun setWishlistId(view: TemplateContainer, value: String?) {
    view.wishlistId = value
  }

  @ReactProp(name = "names")
  override fun setNames(view: TemplateContainer, value: String?) {
    if (value != null) {
      val namesJson = JSONArray(value)
      val names = ArrayList<String>(namesJson.length())
      for (i in 0 until namesJson.length()) {
        names.add(namesJson.getString(i))
      }
      view.names = names
    } else {
      view.names = null
    }
  }
}
