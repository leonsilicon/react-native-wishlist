package com.wishlist

import com.facebook.react.bridge.ReadableArray
import com.facebook.react.common.MapBuilder
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.ReactStylesDiffMap
import com.facebook.react.uimanager.StateWrapper
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewGroupManager
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.viewmanagers.MGWishlistManagerDelegate
import com.facebook.react.viewmanagers.MGWishlistManagerInterface

private const val CONTENT_OFFSET_KEY = 2
/** Must match `ContentBoundsHeightKey` in `MGWishlistState.cpp` (width key 3 is reserved). */
private const val CONTENT_BOUNDS_HEIGHT_KEY = 4

/** Must match `ContentOffsetSeqKey` in `MGWishlistState.cpp`. */
private const val CONTENT_OFFSET_SEQ_KEY = 5

@ReactModule(name = WishlistViewManager.REACT_CLASS)
class WishlistViewManager : ViewGroupManager<Wishlist>(), MGWishlistManagerInterface<Wishlist> {
  companion object {
    const val REACT_CLASS = "MGWishlist"
  }

  private val mDelegate = MGWishlistManagerDelegate(this)

  override fun getName() = REACT_CLASS

  override fun createViewInstance(reactContext: ThemedReactContext) = Wishlist(reactContext)

  override fun onDropViewInstance(view: Wishlist) {
    // Drop every gesture handler attached to the wishlist's Pressables
    // before letting the view be torn down. Without this, the recognizers
    // remain bound to the underlying RN views, and any future tap on those
    // views (after the user's app reuses them) would route into the
    // wishlist's onPress worklet.
    view.dropAllGestureHandlers()
    super.onDropViewInstance(view)
  }

  override fun getDelegate() = mDelegate

  override fun updateState(
      view: Wishlist,
      props: ReactStylesDiffMap?,
      stateWrapper: StateWrapper?
  ): Any? {
    if (stateWrapper != null) {
      view.setStateWrapper(stateWrapper)
    }
    val stateData = stateWrapper?.stateDataMapBuffer
    if (stateData != null && stateData.contains(CONTENT_BOUNDS_HEIGHT_KEY)) {
      view.setShadowContentMinHeightDip(
          stateData.getDouble(CONTENT_BOUNDS_HEIGHT_KEY).toFloat(),
      )
    }
    if (stateData != null && stateData.contains(CONTENT_OFFSET_KEY)) {
      val seq = if (stateData.contains(CONTENT_OFFSET_SEQ_KEY)) stateData.getInt(CONTENT_OFFSET_SEQ_KEY) else 0
      view.scrollToOffsetForContentChange(
          stateData.getDouble(CONTENT_OFFSET_KEY).toFloat(),
          seq,
      )
    }
    return null
  }

  @ReactProp(name = "inflatorId")
  override fun setInflatorId(view: Wishlist, value: String?) {
    view.inflatorId = value
  }

  @ReactProp(name = "initialIndex")
  override fun setInitialIndex(view: Wishlist, value: Int) {
    view.initialIndex = value
  }

  override fun scrollToItem(view: Wishlist, index: Int, animated: Boolean) {
    view.scrollToItem(index, animated)
  }

  override fun receiveCommand(root: Wishlist, commandId: String, args: ReadableArray?) {
    mDelegate.receiveCommand(root, commandId, args)
  }

  override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> {
    val map: MutableMap<String, Any> = mutableMapOf()
    map["topStartReached"] = MapBuilder.of("registrationName", "onStartReached")
    map["topEndReached"] = MapBuilder.of("registrationName", "onEndReached")
    return map
  }
}
