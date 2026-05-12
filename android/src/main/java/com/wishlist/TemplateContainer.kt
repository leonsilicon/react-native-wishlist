package com.wishlist

import android.content.Context
import com.facebook.react.uimanager.StateWrapper
import com.facebook.react.views.view.ReactViewGroup

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
      val templatesRef = stateWrapper?.stateData?.getInt("templates")
      if (templatesRef != null) {
        it.setTemplates(templatesRef, names ?: listOf())
      }
    }
  }
}
