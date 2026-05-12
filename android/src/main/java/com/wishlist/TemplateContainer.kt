package com.wishlist

import android.content.Context
import com.facebook.react.uimanager.StateWrapper
import com.facebook.react.views.view.ReactViewGroup

private const val TEMPLATES_KEY = 1

class TemplateContainer(reactContext: Context) : ReactViewGroup(reactContext) {
  var inflatorId: String? = null
  var wishlistId: String? = null
  var names: List<String>? = null
  var stateWrapper: StateWrapper? = null
  var wishlist: Wishlist? = null
    set(value) {
      field = value
      updateWishlist()
    }

  fun updateWishlist() {
    wishlist?.let {
      it.wishlistId = wishlistId
      it.inflatorId = inflatorId
      val templatesRef = stateWrapper?.stateDataMapBuffer?.getInt(TEMPLATES_KEY)
      if (templatesRef != null) {
        it.setTemplates(templatesRef, names ?: listOf())
      }
    }
  }
}
