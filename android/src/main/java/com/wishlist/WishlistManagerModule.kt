package com.wishlist

import com.facebook.jni.HybridData
import com.facebook.proguard.annotations.DoNotStrip
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.common.annotations.FrameworkAPI
import com.facebook.react.fabric.FabricUIManager
import com.facebook.react.turbomodule.core.CallInvokerHolderImpl
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.common.UIManagerType

@ReactModule(name = WishlistManagerModule.NAME)
class WishlistManagerModule(reactContext: ReactApplicationContext) :
    NativeWishlistManagerSpec(reactContext) {
  companion object {
    const val NAME = "WishlistManager"

    init {
      WishlistSoLoader.staticInit()
    }
  }

  @field:DoNotStrip private val mHybridData = initHybrid()

  override fun getName() = NAME

  @OptIn(FrameworkAPI::class)
  override fun install(): Boolean = installInternal()

  @FrameworkAPI
  private fun installInternal(): Boolean {
    val ctx = reactApplicationContext
    val contextHolder = ctx.javaScriptContextHolder ?: return false
    val callInvoker = ctx.jsCallInvokerHolder as? CallInvokerHolderImpl ?: return false
    val fabricUIManager =
        UIManagerHelper.getUIManager(ctx, UIManagerType.FABRIC) as? FabricUIManager
            ?: return false
    nativeInstall(contextHolder.get(), callInvoker, fabricUIManager)
    return true
  }

  private external fun initHybrid(): HybridData

  @FrameworkAPI
  private external fun nativeInstall(
      jsiRuntimeRef: Long,
      jsCallInvokerHolder: CallInvokerHolderImpl,
      fabricUIManager: FabricUIManager
  )
}
