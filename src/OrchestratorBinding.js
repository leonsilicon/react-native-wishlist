export function scheduleSyncUp(wishlistId) {
    'worklet';
    global.wishlists[wishlistId].scheduleSyncUp();
}
