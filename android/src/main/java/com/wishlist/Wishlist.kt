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
  private var pendingScrollOffsetSeq = 0
  private var ignoreScrollEvents = false
  /**
   * `contentOffsetSeq` of the last `pendingScrollOffset` we applied via
   * `scrollTo`. The C++ `MGWishlistState` propagates `contentOffset` as a
   * sticky field — every state commit (including those triggered by
   * unrelated layout/relayout) replays it. Without this seq guard, every
   * such commit would re-yank the user mid-fling. Stays at 0 until the
   * first real push from C++ (which always emits seq > 0).
   */
  private var lastAppliedScrollOffsetSeq: Int = 0
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

  /**
   * Drops every gesture handler the wishlist attached to its Pressable
   * children (both visible items and items parked in the C++ reusable pool).
   * Called from [WishlistViewManager.onDropViewInstance] so the handlers are
   * gone before the views themselves can be reused on an unrelated screen.
   * Mirrors `MGWishListComponent.prepareForRecycle` on iOS.
   */
  fun dropAllGestureHandlers() {
    orchestrator?.dropAllGestureHandlers()
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

  fun scrollToOffsetForContentChange(offset: Float, seq: Int) {
    // State is updated before content view is laid out so update the
    // scroll position in layout handler.
    pendingScrollOffset = PixelUtil.toPixelFromDIP(offset).toInt()
    pendingScrollOffsetSeq = seq
  }

  private fun maybeScrollToOffsetForContentChange() {
    if (pendingScrollOffset == Int.MIN_VALUE) {
      return
    }
    val contentView = getChildAt(0)
    if (contentView == null || contentView.height == 0) {
      // The content view isn't measured yet; wait for the next layout pass.
      // Do NOT call `didUpdateContentOffset` here — `pendingScrollOffset`
      // stays set so we apply it once the view is sized.
      return
    }
    val effectiveContentHeight = max(contentView.height, shadowContentMinHeightPx)
    val targetOffset = pendingScrollOffset
    val targetSeq = pendingScrollOffsetSeq
    // Always clear `pendingScrollOffset` and notify C++ that we processed
    // this update — even when we have to clamp, drop the value, or skip a
    // replayed-stale commit. Otherwise `MGViewportCarerImpl::ignoreScrollEvents_`
    // stays `true` forever (only reset by `didUpdateContentOffset`), which
    // silently drops every subsequent scroll event and leaves the wishlist
    // visually stuck with no recovery path.
    pendingScrollOffset = Int.MIN_VALUE
    ignoreScrollEvents = true
    if (targetSeq != lastAppliedScrollOffsetSeq && targetOffset in 0..effectiveContentHeight) {
      lastAppliedScrollOffsetSeq = targetSeq
      scrollTo(0, targetOffset)
    }
    orchestrator?.didUpdateContentOffset()
    ignoreScrollEvents = false
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
