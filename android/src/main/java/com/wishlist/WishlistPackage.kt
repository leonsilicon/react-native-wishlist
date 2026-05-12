package com.wishlist

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.ModuleSpec
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.module.annotations.ReactModuleList
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

@ReactModuleList(nativeModules = [WishlistManagerModule::class])
class WishlistPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
    return if (name == WishlistManagerModule.NAME) {
      WishlistManagerModule(reactContext)
    } else {
      null
    }
  }

  override fun getViewManagers(reactContext: ReactApplicationContext): List<ModuleSpec> {
    return listOf(
        ModuleSpec.viewManagerSpec { WishlistViewManager() },
        ModuleSpec.viewManagerSpec { TemplateContainerViewManager() },
        ModuleSpec.viewManagerSpec { TemplateInterceptorViewManager() },
        ModuleSpec.viewManagerSpec { ContentContainerViewManager() })
  }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
    return ReactModuleInfoProvider {
      val reactModule =
          WishlistManagerModule::class.java.getAnnotation(ReactModule::class.java)
              ?: throw IllegalStateException("WishlistManagerModule must have @ReactModule")

      mapOf(
          WishlistManagerModule.NAME to
              ReactModuleInfo(
                  reactModule.name,
                  WishlistManagerModule::class.java.name,
                  reactModule.canOverrideExistingModule,
                  reactModule.needsEagerInit,
                  reactModule.isCxxModule,
                  true))
    }
  }
}
