package com.wishlist

import android.content.Context
import android.view.View
import android.widget.OverScroller
import android.widget.ScrollView
import com.facebook.react.uimanager.PixelUtil
import com.facebook.react.views.scroll.ReactScrollView
import com.facebook.react.views.scroll.ReactScrollViewHelper
import java.lang.reflect.Field
import kotlin.math.max

private const val VIEWPORT_CARER_KEY = 1
private const val CONTENT_OFFSET_KEY = 2

/**
 * [ReactScrollView] clamps flings and scroll position using only the laid-out height of its single
 * content child. Wishlist virtualization keeps that child short while the C++ shadow tree reports a
 * much larger [contentBoundingRect] (mirrored on iOS via `contentSize`). Without compensating here,
 * [onOverScrolled] aborts flings early and [onLayoutChange] clamps `scrollY`, so the scrollbar and
 * motion stop "at the bottom" of the window-sized content instead of the virtual list.
 */
class Wishlist(reactContext: Context) : ReactScrollView(reactContext) {
  var inflatorId: String? = null
  var wishlistId: String? = null
  var initialIndex: Int = 0
  private var orchestrator: Orchestrator? = null
  private var templatesRef: Int? = null
  private var names: List<String>? = null
  private var didInitialScroll = false
  private val initialContentSize = 100000f
  private var pendingScrollOffset = Int.MIN_VALUE
  private var ignoreScrollEvents = false
  /** Shadow-tree content height (px); from state `contentBoundingRect.size.height`. */
  private var shadowContentMinHeightPx: Int = 0

  init {
    clipChildren = true
    clipToPadding = true
  }

  fun setTemplates(templatesRef: Int, names: List<String>) {
    this.templatesRef = templatesRef
    this.names = names
    renderIfReady()
  }

  private fun renderIfReady() {
    val templatesRef = this.templatesRef
    val inflatorId = this.inflatorId
    val names = this.names
    if (names == null || templatesRef == null || inflatorId == null || width == 0 || height == 0) {
      return
    }

    var orchestrator = this.orchestrator
    if (orchestrator == null) {
      val viewportCarer = stateWrapper?.stateDataMapBuffer?.getInt(VIEWPORT_CARER_KEY) ?: return
      orchestrator = Orchestrator(this, wishlistId!!, viewportCarer)
      this.orchestrator = orchestrator
    }

    orchestrator.renderAsync(
        PixelUtil.toDIPFromPixel(width.toFloat()),
        PixelUtil.toDIPFromPixel(height.toFloat()),
        initialContentSize,
        initialIndex,
        templatesRef,
        names,
        inflatorId)
  }

  private fun initialScrollIfReady() {
    if (didInitialScroll) {
      return
    }
    val contentView = getChildAt(0)
    if (contentView == null || contentView.height == 0) {
      return
    }
    scrollTo(0, PixelUtil.toPixelFromDIP(initialContentSize / 2).toInt())
    didInitialScroll = true
  }

  private fun isWishlistContentReady(): Boolean {
    val child = getChildAt(0) ?: return false
    return child.width != 0 && child.height != 0
  }

  /** Max scroll Y using virtual content height (matches iOS `contentBoundingRect` extent). */
  private fun wishlistEffectiveMaxScrollY(): Int {
    val child = getChildAt(0) ?: return 0
    val contentHeight = max(child.height, shadowContentMinHeightPx)
    val viewportHeight = height - paddingBottom - paddingTop
    return max(0, contentHeight - viewportHeight)
  }

  /**
   * Do not call [ReactScrollView.onLayoutChange]: it uses [getMaxScrollY] (short child height) and
   * clamps [scrollY] during virtualization, which aborts fast scrolls. We keep
   * [ReactScrollViewHelper.emitLayoutChangeEvent] only.
   */
  override fun onLayoutChange(
      v: View,
      left: Int,
      top: Int,
      right: Int,
      bottom: Int,
      oldLeft: Int,
      oldTop: Int,
      oldRight: Int,
      oldBottom: Int,
  ) {
    if (getChildAt(0) == null) {
      return
    }
    applyShadowContentMinimumToContentView()
    if (isShown && isWishlistContentReady()) {
      val maxScrollY = wishlistEffectiveMaxScrollY()
      val currentScrollY = scrollY
      if (currentScrollY > maxScrollY) {
        scrollTo(scrollX, maxScrollY)
      }
    }
    ReactScrollViewHelper.emitLayoutChangeEvent(this)
    initialScrollIfReady()
    maybeScrollToOffsetForContentChange()
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    applyShadowContentMinimumToContentView()
    super.onLayout(changed, l, t, r, b)

    renderIfReady()
    initialScrollIfReady()
    maybeScrollToOffsetForContentChange()
  }

  /**
   * [ReactScrollView] aborts flings when `scrollY >= getMaxScrollY()` where max Y is derived from
   * the short virtualized child. Use the shadow-tree content height instead.
   */
  override fun onOverScrolled(scrollX: Int, scrollY: Int, clampedX: Boolean, clampedY: Boolean) {
    var adjustedY = scrollY
    val scroller = wishlistOverScroller
    val child = getChildAt(0)
    if (scroller != null && child != null) {
      if (!scroller.isFinished && scroller.currY != scroller.finalY) {
        val scrollRange = wishlistEffectiveMaxScrollY()
        if (adjustedY >= scrollRange) {
          scroller.abortAnimation()
          adjustedY = scrollRange
        }
      }
    }
    super.onOverScrolled(scrollX, adjustedY, clampedX, clampedY)
  }

  override fun computeVerticalScrollRange(): Int {
    val fromSuper = super.computeVerticalScrollRange()
    if (shadowContentMinHeightPx <= 0) {
      return fromSuper
    }
    return max(fromSuper, shadowContentMinHeightPx)
  }

  override fun onScrollChanged(x: Int, y: Int, oldX: Int, oldY: Int) {
    super.onScrollChanged(x, y, oldX, oldY)

    if (ignoreScrollEvents) {
      return
    }

    orchestrator?.didScrollAsync(
        PixelUtil.toDIPFromPixel(width.toFloat()),
        PixelUtil.toDIPFromPixel(height.toFloat()),
        PixelUtil.toDIPFromPixel(y.toFloat()),
        inflatorId!!)
  }

  fun scrollToItem(index: Int, animated: Boolean) {
    orchestrator?.scrollToItem(index)
  }

  fun setShadowContentMinHeightDip(heightDip: Float) {
    val heightPx = PixelUtil.toPixelFromDIP(heightDip).toInt()
    if (heightPx == shadowContentMinHeightPx) {
      return
    }
    shadowContentMinHeightPx = heightPx
    applyShadowContentMinimumToContentView()
  }

  private fun applyShadowContentMinimumToContentView() {
    val child = getChildAt(0) ?: return
    val targetMin = if (shadowContentMinHeightPx > 0) shadowContentMinHeightPx else 0
    if (child.minimumHeight == targetMin) {
      return
    }
    child.minimumHeight = targetMin
    child.requestLayout()
  }

  fun scrollToOffsetForContentChange(offset: Float) {
    // State is updated before content view is laid out so update the
    // scroll position in layout handler.
    pendingScrollOffset = PixelUtil.toPixelFromDIP(offset).toInt()
  }

  private fun maybeScrollToOffsetForContentChange() {
    if (pendingScrollOffset == Int.MIN_VALUE) {
      return
    }
    val contentView = getChildAt(0)
    val effectiveContentHeight =
        if (contentView == null) {
          0
        } else {
          max(contentView.height, shadowContentMinHeightPx)
        }
    if (contentView == null ||
        contentView.height == 0 ||
        pendingScrollOffset > effectiveContentHeight) {
      return
    }
    ignoreScrollEvents = true
    scrollTo(0, pendingScrollOffset)
    orchestrator?.didUpdateContentOffset()
    ignoreScrollEvents = false
    pendingScrollOffset = Int.MIN_VALUE
  }

  private val wishlistOverScroller: OverScroller?
    get() {
      val field = scrollerField ?: return null
      return try {
        field.get(this) as? OverScroller
      } catch (_: Throwable) {
        null
      }
    }

  companion object {
    private var scrollerField: Field? = null
    private var triedScrollerField = false

    init {
      synchronized(Wishlist::class.java) {
        if (!triedScrollerField) {
          triedScrollerField = true
          try {
            val f = ScrollView::class.java.getDeclaredField("mScroller")
            f.isAccessible = true
            scrollerField = f
          } catch (_: Throwable) {
            scrollerField = null
          }
        }
      }
    }
  }
}
